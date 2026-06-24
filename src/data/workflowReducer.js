// Central state management for a Parlance workflow.
// Single source of truth the Canvas, Sidebar, and forms all read from
// and dispatch actions to. Kept as a plain reducer so it's easy to test
// and easy to swap for a backend sync layer later.

import { createAgent, createEdge } from './workflowModel';

export const initialWorkflowState = {
  name: 'Untitled workflow',
  conditions: '',
  fileContextMode: 'truncated', // 'off' | 'truncated' | 'full' — see workflowModel.js for the tradeoff this controls
  agents: [],
  edges: [],
  selectedAgentId: null,
  editingAgentId: null, // agent currently open in the creation/edit form, or 'new'
  editorPreset: null, // 'overseer' when opened via right-click Add Overseer, null otherwise
  pendingPosition: null, // {x, y} target position when opening the form via "Add agent here"
  runStatus: 'idle', // 'idle' | 'running' | 'completed' | 'halted'
  runMessage: null, // halt reason, or null
  runApproved: null, // true/false once a run completes with an Overseer verdict, null otherwise
  overseerOutput: null, // the Overseer's final decision text, for the Results panel
  runSequence: 0, // increments every RUN_STARTED — a genuine per-run identifier, unlike runLog.length
  // which can coincidentally match between two runs that happen to produce the same number of log
  // entries (e.g. two clean first-try completions), which silently broke results-panel auto-open
  activeAgentId: null, // agent currently executing, for live highlighting
  runLog: [], // ordered list of { id, text, kind } entries for the run's activity feed
};

export function workflowReducer(state, action) {
  switch (action.type) {
    case 'ADD_AGENT': {
      // If the payload is a pre-built node (has an id and nodeType already
      // set by a factory function like createImportNode), use it directly.
      // Otherwise, build a regular agent from the form data via createAgent.
      const agent = action.payload.id && action.payload.nodeType
        ? action.payload
        : createAgent(action.payload);
      return { ...state, agents: [...state.agents, agent] };
    }

    case 'UPDATE_AGENT': {
      const { id, changes } = action.payload;
      return {
        ...state,
        agents: state.agents.map((a) => (a.id === id ? { ...a, ...changes } : a)),
      };
    }

    case 'DELETE_AGENT': {
      const { id } = action.payload;
      return {
        ...state,
        agents: state.agents.filter((a) => a.id !== id),
        edges: state.edges.filter((e) => e.source !== id && e.target !== id),
        selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId,
        editingAgentId: state.editingAgentId === id ? null : state.editingAgentId,
      };
    }

    case 'MOVE_AGENT': {
      const { id, position } = action.payload;
      return {
        ...state,
        agents: state.agents.map((a) => (a.id === id ? { ...a, position } : a)),
      };
    }

    case 'MOVE_AGENTS_BULK': {
      // payload: Map or plain object of agentId -> {x, y}. Used by auto-layout
      // to reposition every agent in a single state update.
      const positions = action.payload;
      const getPosition = positions instanceof Map
        ? (id) => positions.get(id)
        : (id) => positions[id];
      return {
        ...state,
        agents: state.agents.map((a) => {
          const next = getPosition(a.id);
          return next ? { ...a, position: next } : a;
        }),
      };
    }

    case 'ADD_EDGE': {
      const { source, target, kind } = action.payload;
      // Prevent duplicate edges of the same kind between the same pair.
      const exists = state.edges.some(
        (e) => e.source === source && e.target === target && e.kind === kind
      );
      if (exists) return state;
      const edge = createEdge({ source, target, kind });
      return { ...state, edges: [...state.edges, edge] };
    }

    case 'DELETE_EDGE': {
      const { id } = action.payload;
      return { ...state, edges: state.edges.filter((e) => e.id !== id) };
    }

    case 'LOAD_WORKSPACE': {
      // Replaces the entire workflow state when switching workspaces.
      // Resets run-specific transient state (runStatus, runLog, etc.) so
      // switching workspaces always shows a clean slate, not mid-run UI
      // from the previous workspace.
      const { name, conditions, fileContextMode, agents, edges } = action.payload;
      return {
        ...initialWorkflowState,
        name: name ?? 'Untitled workflow',
        conditions: conditions ?? '',
        fileContextMode: fileContextMode ?? 'truncated',
        agents: agents ?? [],
        edges: edges ?? [],
      };
    }

    case 'SET_CONDITIONS': {
      return { ...state, conditions: action.payload };
    }

    case 'SET_FILE_CONTEXT_MODE': {
      return { ...state, fileContextMode: action.payload };
    }

    case 'SET_NAME': {
      return { ...state, name: action.payload };
    }

    case 'SELECT_AGENT': {
      return { ...state, selectedAgentId: action.payload };
    }

    case 'OPEN_AGENT_EDITOR': {
      // payload is either an agent id / 'new' string, or an object
      // { id: 'new', position: {x, y}, preset? } when opened via right-click
      // "Add agent here" so the form knows where to place the new agent.
      // preset: 'overseer' pre-configures the editor for an Overseer agent.
      if (typeof action.payload === 'object' && action.payload !== null) {
        return {
          ...state,
          editingAgentId: action.payload.id,
          pendingPosition: action.payload.position ?? null,
          editorPreset: action.payload.preset ?? null,
        };
      }
      return { ...state, editingAgentId: action.payload, pendingPosition: null, editorPreset: null };
    }

    case 'CLOSE_AGENT_EDITOR': {
      return { ...state, editingAgentId: null, pendingPosition: null, editorPreset: null };
    }

    case 'RUN_STARTED': {
      // Clear prior run history so re-running shows a clean slate, not a
      // confusing mix of old and new attempts. Status resets to pending.
      // Output node capturedOutput is intentionally NOT cleared here —
      // Chain Input nodes in other workflows may need the cached content
      // between runs. It gets overwritten when OUTPUT_CAPTURED fires in
      // the new run, and cleared only by the user explicitly re-running.
      return {
        ...state,
        runStatus: 'running',
        runMessage: null,
        runSequence: state.runSequence + 1,
        activeAgentId: null,
        runLog: [],
        agents: state.agents.map((a) => ({ ...a, runs: [], status: 'pending' })),
      };
    }

    case 'AGENT_RUN_STARTED': {
      const { agentId, agentName } = action.payload;
      const logId = `log_started_${agentId}_${state.runLog.length}`;
      return {
        ...state,
        activeAgentId: agentId,
        agents: state.agents.map((a) => (a.id === agentId ? { ...a, status: 'running' } : a)),
        runLog: [...state.runLog, { id: logId, kind: 'started', text: `${agentName} started` }],
      };
    }

    case 'AGENT_RUN_FINISHED': {
      // payload: { agentId, agentName, run } — run.status is 'completed' or 'failed'
      const { agentId, agentName, run } = action.payload;
      const text =
        run.status === 'completed'
          ? `${agentName} completed (attempt ${run.attempt})`
          : `${agentName} failed (attempt ${run.attempt}): ${run.error ?? 'Unknown error'}`;
      const logId = `log_finished_${agentId}_${run.attempt}_${state.runLog.length}`;
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === agentId ? { ...a, runs: [...a.runs, run], status: run.status } : a
        ),
        runLog: [
          ...state.runLog,
          { id: logId, kind: run.status, text },
        ],
      };
    }

    case 'RUN_ESCALATION': {
      const { text } = action.payload;
      const logId = `log_escalation_${state.runLog.length}`;
      return {
        ...state,
        runLog: [...state.runLog, { id: logId, kind: 'escalation', text }],
      };
    }

    case 'RUN_HALTED': {
      const logId = `log_halted_${state.runLog.length}`;
      return {
        ...state,
        runStatus: 'halted',
        runMessage: action.payload.reason,
        activeAgentId: null,
        runLog: [
          ...state.runLog,
          { id: logId, kind: 'halted', text: action.payload.reason },
        ],
      };
    }

    case 'UPDATE_IMPORT_NODE': {
      const { nodeId, newFiles } = action.payload;
      return {
        ...state,
        agents: state.agents.map((a) => {
          if (a.id !== nodeId) return a;
          const existing = a.importedFiles ?? [];
          const combined = [...existing, ...newFiles];
          // Compose a single content string for injection into prompts
          const importedFileContent = combined
            .map((f) => `=== ${f.name} ===\n${f.content}`)
            .join('\n\n');
          return {
            ...a,
            importedFiles: combined,
            importedFileName: combined.map((f) => f.name).join(', '),
            importedFileContent,
          };
        }),
      };
    }

    case 'UPDATE_CHAIN_NODE': {
      const { nodeId, sourceWorkspaceId, sourceWorkspaceName } = action.payload;
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === nodeId
            ? { ...a, sourceWorkspaceId, sourceWorkspaceName, importedFileContent: null, chainLog: [] }
            : a
        ),
      };
    }

    case 'CHAIN_NODE_TOGGLE_RERUN': {
      const { nodeId } = action.payload;
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === nodeId ? { ...a, rerunLinked: !a.rerunLinked } : a
        ),
      };
    }

    case 'CHAIN_NODE_LOG': {
      const { nodeId, entry } = action.payload;
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === nodeId
            ? { ...a, chainLog: [...(a.chainLog ?? []), entry] }
            : a
        ),
      };
    }

    case 'CHAIN_NODE_LOADED': {
      const { nodeId, content, status } = action.payload;
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === nodeId ? { ...a, importedFileContent: content, status } : a
        ),
      };
    }

    case 'OUTPUT_CAPTURED': {
      const { outputNodeId, run } = action.payload;
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === outputNodeId
            ? {
                ...a,
                capturedOutput: run.output,
                capturedFiles: run.files ?? [],
                status: 'completed',
                savedAt: new Date().toISOString(),
              }
            : a
        ),
      };
    }

    case 'RUN_COMPLETED': {
      const { approved, overseerOutput } = action.payload;
      const text = approved ? 'Approved — conditions met.' : 'Completed, but not approved by the Overseer.';
      const logId = `log_completed_${approved ? 'approved' : 'rejected'}_${state.runLog.length}`;
      return {
        ...state,
        runStatus: 'completed',
        runMessage: text,
        runApproved: approved,
        overseerOutput: overseerOutput ?? null,
        activeAgentId: null,
        runLog: [...state.runLog, { id: logId, kind: approved ? 'approved' : 'rejected', text }],
      };
    }

    default:
      return state;
  }
}
