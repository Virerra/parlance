import { useReducer, useState, useCallback, useRef, useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';
import TopBar from './components/TopBar';
import Canvas from './components/Canvas';
import Sidebar from './components/Sidebar';
import AgentEditor from './components/AgentEditor';
import ConditionsEditor from './components/ConditionsEditor';
import { workflowReducer, initialWorkflowState } from './data/workflowReducer';
import { computeAutoLayout } from './data/autoLayout';
import { createImportNode, createOutputNode, createChainNode } from './data/workflowModel';
import { runWorkflow } from './execution/runEngine';
import { createClaudeClient } from './execution/claudeClient';
import { createEngineEventBridge } from './execution/engineEventBridge';
import { hasApiKey } from './data/apiKeyStorage';
import {
  loadWorkspace,
  loadWorkspaceIndex,
  loadActiveWorkspaceId,
  saveWorkspace,
  createWorkspace,
  setActiveWorkspaceId,
  createAutoSave,
  deleteWorkspace,
} from './data/workspaceStorage';
import SettingsPanel from './components/SettingsPanel';
import ResultsPanel from './components/ResultsPanel';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';
import ChainConfig from './components/ChainConfig';
import './index.css';
import './App.css';

/**
 * Computes a default position for a newly created agent: below the lowest
 * existing node, left-aligned with the leftmost one. Avoids the old
 * diagonal-cascade approach, which marched off-canvas as agents piled up
 * and risked exact overlaps. This is just a starting point — full
 * structural placement happens via the explicit "Tidy up" auto-layout.
 */
function computeNewAgentPosition(agents) {
  if (agents.length === 0) return { x: 80, y: 80 };

  const minX = Math.min(...agents.map((a) => a.position.x));
  const maxY = Math.max(...agents.map((a) => a.position.y));
  return { x: minX, y: maxY + 170 };
}

/**
 * Loads the active workspace from storage, or creates a fresh one if
 * nothing has been saved yet. Returns the workflow state to initialize
 * the reducer with, plus the active workspace id.
 */
function buildInitialState() {
  const activeId = loadActiveWorkspaceId();
  if (activeId) {
    const saved = loadWorkspace(activeId);
    if (saved) {
      return {
        workspaceId: activeId,
        state: { ...initialWorkflowState, ...saved },
      };
    }
  }

  // Nothing saved yet — create a fresh workspace and persist it
  const id = createWorkspace('Untitled workflow');
  return {
    workspaceId: id,
    state: { ...initialWorkflowState },
  };
}

const autoSave = createAutoSave(800);

export default function App() {
  const [{ workspaceId, state: initialState }] = useState(buildInitialState);
  const [activeWorkspaceId, setActiveId] = useState(workspaceId);
  const [state, dispatch] = useReducer(workflowReducer, initialState);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The API key lives in localStorage, outside React state (see
  // apiKeyStorage.js). This setter exists purely to force a re-render
  // after the settings panel closes — hasApiKey() itself is cheap (one
  // localStorage read), so no memoization is needed; we just call it
  // directly on every render and bump this counter to trigger that render.
  const [, forceApiKeyRecheck] = useState(0);
  const apiKeyPresent = hasApiKey();

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  const selectAgent = useCallback(
    (id) => dispatch({ type: 'SELECT_AGENT', payload: id }),
    []
  );

  const openNewAgentFormAt = useCallback(
    (position) => dispatch({ type: 'OPEN_AGENT_EDITOR', payload: { id: 'new', position } }),
    []
  );

  const openNewOverseerFormAt = useCallback(
    (position) => dispatch({ type: 'OPEN_AGENT_EDITOR', payload: { id: 'new', position, preset: 'overseer' } }),
    []
  );

  const handleAddImportAt = useCallback((position) => {
    const node = createImportNode({ position });
    dispatch({ type: 'ADD_AGENT', payload: node });
  }, []);

  const handleAddOutputAt = useCallback((position) => {
    const node = createOutputNode({ position });
    dispatch({ type: 'ADD_AGENT', payload: node });
  }, []);

  const handleAddChainAt = useCallback((position) => {
    const node = createChainNode({ position });
    dispatch({ type: 'ADD_AGENT', payload: node });
  }, []);

  // Hidden file input ref for Import node uploads
  const fileInputRef = useRef(null);
  const pendingUploadNodeId = useRef(null);

  const handleUploadFile = useCallback((nodeId) => {
    pendingUploadNodeId.current = nodeId;
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    const nodeId = pendingUploadNodeId.current;
    if (selectedFiles.length === 0 || !nodeId) return;

    // Read all files, then dispatch once with the full batch
    Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve({ name: file.name, content: ev.target.result });
            reader.readAsText(file);
          })
      )
    ).then((newFiles) => {
      dispatch({ type: 'UPDATE_IMPORT_NODE', payload: { nodeId, newFiles } });
    });

    e.target.value = '';
    pendingUploadNodeId.current = null;
  }, []);

  const [chainConfigNodeId, setChainConfigNodeId] = useState(null);
  const handleConfigureChain = useCallback((nodeId) => {
    setChainConfigNodeId(nodeId);
  }, []);

  const handleToggleRerun = useCallback((nodeId) => {
    dispatch({ type: 'CHAIN_NODE_TOGGLE_RERUN', payload: { nodeId } });
  }, []);

  const openEditAgentForm = useCallback(
    (id) => dispatch({ type: 'OPEN_AGENT_EDITOR', payload: id }),
    []
  );

  const closeEditor = useCallback(
    () => dispatch({ type: 'CLOSE_AGENT_EDITOR' }),
    []
  );

  const editingAgent =
    state.editingAgentId && state.editingAgentId !== 'new'
      ? state.agents.find((a) => a.id === state.editingAgentId)
      : null;
  const editorOpen = state.editingAgentId !== null;

  function handleSaveAgent(form) {
    if (state.editingAgentId === 'new') {
      dispatch({
        type: 'ADD_AGENT',
        payload: { ...form, position: state.pendingPosition ?? computeNewAgentPosition(state.agents) },
      });
    } else if (editingAgent) {
      dispatch({ type: 'UPDATE_AGENT', payload: { id: editingAgent.id, changes: form } });
    }
    closeEditor();
  }

  function handleDeleteAgent(id) {
    dispatch({ type: 'DELETE_AGENT', payload: { id } });
    closeEditor();
  }

  function handleSaveConditions({ conditions, fileContextMode }) {
    dispatch({ type: 'SET_CONDITIONS', payload: conditions });
    dispatch({ type: 'SET_FILE_CONTEXT_MODE', payload: fileContextMode });
    setConditionsOpen(false);
  }

  const [layoutTrigger, setLayoutTrigger] = useState(0);

  const handleTidyUp = useCallback(async () => {
    const positions = await computeAutoLayout(state.agents, state.edges);
    dispatch({ type: 'MOVE_AGENTS_BULK', payload: positions });
    // Bump a counter Canvas watches to know it should fitView after this
    // specific layout pass, rather than on every unrelated re-render.
    setLayoutTrigger((v) => v + 1);
  }, [state.agents, state.edges]);

  // --- Run orchestration ---
  const abortControllerRef = useRef(null);
  const isRunning = state.runStatus === 'running';
  const [resultsPanelOpen, setResultsPanelOpen] = useState(false);
  const lastAutoOpenedRunRef = useRef(null);

  const executeRun = useCallback(
    async (client) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      dispatch({ type: 'RUN_STARTED' });

      const snapshotWorkflow = {
        name: state.name,
        conditions: state.conditions,
        fileContextMode: state.fileContextMode,
        agents: state.agents.map((a) => ({ ...a, runs: [] })),
        edges: state.edges,
      };

      // Resolve Chain Input nodes before the main workflow runs.
      // For each Chain Input that has a source workspace:
      //   - If rerunLinked=false AND cached output exists → use it
      //   - If rerunLinked=true OR no cache → run the linked workflow first
      const chainNodes = snapshotWorkflow.agents.filter(
        (a) => a.nodeType === 'chain' && a.sourceWorkspaceId
      );

      for (const chainNode of chainNodes) {
        const { sourceWorkspaceId, sourceWorkspaceName, rerunLinked } = chainNode;

        // Load the linked workspace from storage
        const linkedWorkspace = loadWorkspace(sourceWorkspaceId);
        if (!linkedWorkspace) {
          dispatch({
            type: 'RUN_HALTED',
            payload: { reason: `Chain Input "${chainNode.name}": linked workspace "${sourceWorkspaceName}" not found.` },
          });
          return;
        }

        // Find the Output node in the linked workspace
        const outputNode = linkedWorkspace.agents?.find((a) => a.nodeType === 'output');

        // Use cache if available and rerun not requested
        if (!rerunLinked && outputNode?.capturedOutput) {
          dispatch({ type: 'CHAIN_NODE_LOG', payload: { nodeId: chainNode.id, entry: { text: `Using cached output from "${sourceWorkspaceName}"`, kind: 'started' } } });
          const idx = snapshotWorkflow.agents.findIndex((a) => a.id === chainNode.id);
          if (idx >= 0) snapshotWorkflow.agents[idx].importedFileContent = outputNode.capturedOutput;
          dispatch({ type: 'CHAIN_NODE_LOADED', payload: { nodeId: chainNode.id, content: outputNode.capturedOutput, status: 'completed' } });
          continue;
        }

        // Need to run the linked workflow
        dispatch({ type: 'CHAIN_NODE_LOG', payload: { nodeId: chainNode.id, entry: { text: `Running "${sourceWorkspaceName}"…`, kind: 'started' } } });

        // Build a clean snapshot of the linked workflow
        const linkedSnapshot = {
          name: linkedWorkspace.name,
          conditions: linkedWorkspace.conditions ?? '',
          fileContextMode: linkedWorkspace.fileContextMode ?? 'truncated',
          agents: (linkedWorkspace.agents ?? []).map((a) => ({ ...a, runs: [] })),
          edges: linkedWorkspace.edges ?? [],
        };

        // Run the linked workflow and wait for it to complete
        const linkedResult = await new Promise((resolve) => {
          const linkedBridge = (event) => {
            // Forward chain log entries to the Chain Input node
            if (event.type === 'agent-started') {
              const agent = linkedSnapshot.agents.find((a) => a.id === event.agentId);
              if (agent) dispatch({ type: 'CHAIN_NODE_LOG', payload: { nodeId: chainNode.id, entry: { text: `${agent.name} started`, kind: 'started' } } });
            }
            if (event.type === 'agent-completed') {
              const agent = linkedSnapshot.agents.find((a) => a.id === event.agentId);
              if (agent) dispatch({ type: 'CHAIN_NODE_LOG', payload: { nodeId: chainNode.id, entry: { text: `${agent.name} completed`, kind: 'completed' } } });
            }
            if (event.type === 'run-completed') {
              // Find the Output node in the linked snapshot after run
              const linkedOutputNode = linkedSnapshot.agents.find((a) => a.nodeType === 'output');
              resolve({ approved: event.approved, output: linkedOutputNode?.capturedOutput ?? event.overseerOutput ?? null });
            }
            if (event.type === 'run-halted') {
              resolve({ approved: false, output: null, halted: true, reason: event.reason });
            }
            // Also apply events to the linked snapshot so Output capture works
            if (event.type === 'agent-completed') {
              const agent = linkedSnapshot.agents.find((a) => a.id === event.agentId);
              if (agent) agent.runs = [...(agent.runs ?? []), event.run];
              // Check for output nodes downstream
              const outputTargets = linkedSnapshot.agents.filter((a) =>
                a.nodeType === 'output' &&
                linkedSnapshot.edges.some((e) => e.source === event.agentId && e.target === a.id && e.kind === 'flow')
              );
              outputTargets.forEach((o) => { o.capturedOutput = event.run.output; o.capturedFiles = event.run.files ?? []; });
            }
          };

          runWorkflow(linkedSnapshot, client, linkedBridge, { signal: controller.signal });
        });

        if (!linkedResult.approved || !linkedResult.output) {
          const reason = linkedResult.halted
            ? `Chain Input "${chainNode.name}": linked workflow halted — ${linkedResult.reason}`
            : `Chain Input "${chainNode.name}": linked workflow "${sourceWorkspaceName}" did not produce approved output.`;
          dispatch({ type: 'CHAIN_NODE_LOG', payload: { nodeId: chainNode.id, entry: { text: 'Linked workflow failed', kind: 'failed' } } });
          dispatch({ type: 'RUN_HALTED', payload: { reason } });
          return;
        }

        // Save the fresh output to the linked workspace for future caching
        saveWorkspace(sourceWorkspaceId, { ...linkedWorkspace, agents: linkedSnapshot.agents });

        dispatch({ type: 'CHAIN_NODE_LOG', payload: { nodeId: chainNode.id, entry: { text: `"${sourceWorkspaceName}" completed ✓`, kind: 'completed' } } });
        const idx = snapshotWorkflow.agents.findIndex((a) => a.id === chainNode.id);
        if (idx >= 0) snapshotWorkflow.agents[idx].importedFileContent = linkedResult.output;
        dispatch({ type: 'CHAIN_NODE_LOADED', payload: { nodeId: chainNode.id, content: linkedResult.output, status: 'completed' } });
      }

      if (controller.signal.aborted) return;

      const onEngineEvent = createEngineEventBridge(dispatch, state.agents);
      runWorkflow(snapshotWorkflow, client, onEngineEvent, { signal: controller.signal });
    },
    [state.agents, state.edges, state.name, state.conditions, state.fileContextMode]
  );

  const handleRun = useCallback(() => {
    if (isRunning) return;
    if (state.agents.length === 0) return;

    if (!apiKeyPresent) {
      // No key — open settings so the user can add one
      setSettingsOpen(true);
      return;
    }

    // Key is present — run real immediately, no modal
    executeRun(createClaudeClient());
  }, [isRunning, state.agents.length, apiKeyPresent, executeRun]);

  const handleCancelRun = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Cancel any in-flight run if the app unmounts (defensive — this is a
  // single-page app, but avoids a dangling async loop calling dispatch
  // after teardown in dev/hot-reload scenarios).
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // Auto-save the current workspace state to localStorage on config changes.
  // We deliberately exclude run-time agent state (runs, status, chainLog)
  // from this dep array — those change on every engine event but contain
  // nothing worth persisting (saveWorkspace strips them anyway). Saving only
  // when config changes means no localStorage writes during active runs.
  //
  // We use a stable config signature: agent IDs + names + tasks + positions
  // (things a user edits), not runs or status (things the engine writes).
  const configSignature = JSON.stringify(
    state.agents.map((a) => ({
      id: a.id, name: a.name, role: a.role, task: a.task,
      model: a.model, maxIterations: a.maxIterations, isManager: a.isManager,
      canUseFiles: a.canUseFiles, systemPrompt: a.systemPrompt,
      nodeType: a.nodeType, position: a.position,
      // Include Output node cache so it persists across reloads
      capturedOutput: a.capturedOutput, savedAt: a.savedAt,
      // Include Chain node config
      sourceWorkspaceId: a.sourceWorkspaceId, rerunLinked: a.rerunLinked,
      // Include Import node files
      importedFileName: a.importedFileName, importedFiles: a.importedFiles,
    }))
  );

  useEffect(() => {
    const snapshot = {
      name: state.name,
      conditions: state.conditions,
      fileContextMode: state.fileContextMode,
      agents: state.agents,
      edges: state.edges,
    };
    autoSave(activeWorkspaceId, snapshot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, state.name, state.conditions, state.fileContextMode, configSignature, state.edges]);

  // When a run is approved, save the approved output text to the workspace
  // so other workspaces can pull it via Chain nodes.
  useEffect(() => {
    if (state.runStatus === 'completed' && state.runApproved === true && state.overseerOutput) {
      saveWorkspace(activeWorkspaceId, {
        name: state.name,
        conditions: state.conditions,
        fileContextMode: state.fileContextMode,
        agents: state.agents,
        edges: state.edges,
        approvedOutput: state.overseerOutput,
      });
    }
  }, [state.runStatus, state.runApproved, state.overseerOutput, activeWorkspaceId, state.name, state.conditions, state.fileContextMode, state.agents, state.edges]);

  // Switch to a different workspace — saves the current state first (the
  // auto-save debounce might not have flushed yet), then loads the new one.
  const handleSwitchWorkspace = useCallback((id) => {
    // Flush current workspace immediately before switching
    saveWorkspace(activeWorkspaceId, {
      name: state.name,
      conditions: state.conditions,
      fileContextMode: state.fileContextMode,
      agents: state.agents,
      edges: state.edges,
    });

    const saved = loadWorkspace(id);
    if (!saved) return;

    setActiveWorkspaceId(id);
    setActiveId(id);
    dispatch({ type: 'LOAD_WORKSPACE', payload: saved });
  }, [activeWorkspaceId, state]);

  // Create a new blank workspace and switch to it.
  const handleNewWorkspace = useCallback(() => {
    saveWorkspace(activeWorkspaceId, {
      name: state.name,
      conditions: state.conditions,
      fileContextMode: state.fileContextMode,
      agents: state.agents,
      edges: state.edges,
    });
    const id = createWorkspace('Untitled workflow');
    setActiveId(id);
    dispatch({ type: 'LOAD_WORKSPACE', payload: { name: 'Untitled workflow', conditions: '', fileContextMode: 'truncated', agents: [], edges: [] } });
  }, [activeWorkspaceId, state]);

  const handleDeleteWorkspace = useCallback((id) => {
    deleteWorkspace(id);
    if (id === activeWorkspaceId) {
      const remaining = loadWorkspaceIndex();
      if (remaining.length > 0) {
        const next = remaining[0];
        const saved = loadWorkspace(next.id);
        setActiveWorkspaceId(next.id);
        setActiveId(next.id);
        dispatch({ type: 'LOAD_WORKSPACE', payload: saved ?? { name: 'Untitled workflow', conditions: '', fileContextMode: 'truncated', agents: [], edges: [] } });
      } else {
        const newId = createWorkspace('Untitled workflow');
        setActiveId(newId);
        dispatch({ type: 'LOAD_WORKSPACE', payload: { name: 'Untitled workflow', conditions: '', fileContextMode: 'truncated', agents: [], edges: [] } });
      }
    }
  }, [activeWorkspaceId]);

  // Auto-open the Results panel once when a run completes approved.
  // Guarded by runSequence (incremented on every RUN_STARTED — see
  // workflowReducer.js) rather than runLog.length, which looked
  // reasonable but isn't actually unique: two runs that both complete
  // cleanly on the first try produce the same number of log entries,
  // which silently broke auto-open on the second run in exactly that
  // scenario (confirmed via live testing — Full mode approved but the
  // panel never opened because its runLog.length matched the prior run's).
  useEffect(() => {
    const hasOutputContent = state.agents.some((a) => a.nodeType === 'output' && a.capturedOutput);
    const isApproved = state.runStatus === 'completed' && state.runApproved === true;

    if (isApproved || hasOutputContent) {
      if (lastAutoOpenedRunRef.current !== state.runSequence) {
        lastAutoOpenedRunRef.current = state.runSequence;
        setResultsPanelOpen(true);
      }
    }
  }, [state.runStatus, state.runApproved, state.runSequence, state.agents]);

  return (
    <div className="app-shell">
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        workspaceSwitcher={
          <WorkspaceSwitcher
            activeWorkspaceId={activeWorkspaceId}
            workspaceName={state.name}
            onSwitch={handleSwitchWorkspace}
            onNew={handleNewWorkspace}
            onDelete={handleDeleteWorkspace}
            onRename={(name) => dispatch({ type: 'SET_NAME', payload: name })}
            isRunning={isRunning}
          />
        }
        onOpenConditions={() => setConditionsOpen(true)}
        hasConditions={state.conditions.trim().length > 0}
        onTidyUp={handleTidyUp}
        onRun={handleRun}
        onCancelRun={handleCancelRun}
        isRunning={isRunning}
        canRun={state.agents.length > 0}
        onOpenSettings={() => setSettingsOpen(true)}
        hasApiKey={apiKeyPresent}
        hasApprovedResults={
          (state.runStatus === 'completed' && state.runApproved === true) ||
          state.agents.some((a) => a.nodeType === 'output' && a.capturedOutput)
        }
        onOpenResults={() => setResultsPanelOpen(true)}
      />
      <div className="app-body">
        <ReactFlowProvider>
          <Canvas
            agents={state.agents}
            edges={state.edges}
            selectedAgentId={state.selectedAgentId}
            onSelectAgent={selectAgent}
            onEditAgent={openEditAgentForm}
            onMoveAgent={(id, position) => dispatch({ type: 'MOVE_AGENT', payload: { id, position } })}
            onAddEdge={(payload) => dispatch({ type: 'ADD_EDGE', payload })}
            onDeleteEdge={(id) => dispatch({ type: 'DELETE_EDGE', payload: { id } })}
            onAddAgentAt={openNewAgentFormAt}
            onAddOverseerAt={openNewOverseerFormAt}
            onAddImportAt={handleAddImportAt}
            onAddOutputAt={handleAddOutputAt}
            onAddChainAt={handleAddChainAt}
            onTidyUp={handleTidyUp}
            onOpenConditions={() => setConditionsOpen(true)}
            onUploadFile={handleUploadFile}
            onConfigureChain={handleConfigureChain}
            onToggleRerun={handleToggleRerun}
            onDeleteAgent={handleDeleteAgent}
            layoutTrigger={layoutTrigger}
          />
        </ReactFlowProvider>
        <Sidebar
          agents={state.agents}
          open={sidebarOpen}
          selectedAgentId={state.selectedAgentId}
          onSelectAgent={selectAgent}
          onEditAgent={openEditAgentForm}
          onConfigureChain={handleConfigureChain}
          onToggleRerun={handleToggleRerun}
          activeWorkspaceId={activeWorkspaceId}
          runStatus={state.runStatus}
          runMessage={state.runMessage}
          runLog={state.runLog}
        />
        {editorOpen && (
          <AgentEditor
            agent={editingAgent}
            preset={state.editorPreset}
            onSave={handleSaveAgent}
            onDelete={handleDeleteAgent}
            onClose={closeEditor}
          />
        )}
        {conditionsOpen && (
          <ConditionsEditor
            conditions={state.conditions}
            fileContextMode={state.fileContextMode}
            onSave={handleSaveConditions}
            onClose={() => setConditionsOpen(false)}
          />
        )}
        {settingsOpen && (
          <SettingsPanel
            onClose={() => {
              setSettingsOpen(false);
              forceApiKeyRecheck((v) => v + 1);
            }}
          />
        )}
        {resultsPanelOpen && (
          <ResultsPanel
            workflow={state}
            overseerOutput={state.overseerOutput}
            onClose={() => setResultsPanelOpen(false)}
          />
        )}
        {chainConfigNodeId && (
          <ChainConfig
            nodeId={chainConfigNodeId}
            activeWorkspaceId={activeWorkspaceId}
            onSave={(nodeId, data) => dispatch({ type: 'UPDATE_CHAIN_NODE', payload: { nodeId, ...data } })}
            onClose={() => setChainConfigNodeId(null)}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="text/*,.pdf,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.html,.css,.yaml,.yml"
          style={{ display: 'none' }}
          multiple
          onChange={handleFileSelected}
        />
      </div>
    </div>
  );
}
