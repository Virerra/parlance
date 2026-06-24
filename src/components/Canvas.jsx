import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionLineType,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import AgentNode from './AgentNode';
import AgentEdge from './AgentEdge';
import EdgeTypePicker from './EdgeTypePicker';
import ContextMenu from './ContextMenu';
import ImportNode from './ImportNode';
import OutputNode from './OutputNode';
import ChainNode from './ChainNode';
import {
  AgentIcon,
  OverseerIcon,
  FileImportIcon,
  OutputIcon,
  ChainIcon,
  TidyUpIcon,
  FitViewIcon,
  ConditionsIcon,
  EditIcon,
  DeleteIcon,
  DeleteConnectionIcon,
} from './icons/WorkflowIcons';
import './Canvas.css';

const nodeTypes = {
  agent: AgentNode,
  import: ImportNode,
  output: OutputNode,
  chain: ChainNode,
};
const edgeTypes = { agent: AgentEdge };

const connectionLineStyle = { stroke: '#1985A1', strokeWidth: 1.5 };

const edgeBase = {
  flow: {
    type: 'smoothstep',
    style: { stroke: '#6b6d70', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed', color: '#6b6d70', width: 16, height: 16 },
  },
  feedback: {
    type: 'smoothstep',
    style: { stroke: '#1985A1', strokeWidth: 1.5, strokeDasharray: '4 3' },
    markerEnd: { type: 'arrowclosed', color: '#1985A1', width: 16, height: 16 },
    label: 'retry',
  },
};

export default function Canvas({
  agents,
  edges: workflowEdges,
  selectedAgentId,
  onSelectAgent,
  onEditAgent,
  onMoveAgent,
  onAddEdge,
  onDeleteEdge,
  onAddAgentAt,
  onAddOverseerAt,
  onAddImportAt,
  onAddOutputAt,
  onAddChainAt,
  onTidyUp,
  onOpenConditions,
  onUploadFile,
  onConfigureChain,
  onToggleRerun,
  onDeleteAgent,
  layoutTrigger,
}) {
  // React Flow owns live node state (position during drag, etc). We seed it
  // from `agents` and resync whenever agents are added/removed/edited
  // elsewhere (e.g. the editor form), but we must NOT clobber it on every
  // render or drags will fight the incoming prop and stutter/snap.
  const [nodes, setNodes, onNodesChange] = useNodesState(
    agents.map((a) => ({
      id: a.id,
      type: a.nodeType ?? 'agent',
      position: a.position,
      data: {
        agent: a,
        selected: a.id === selectedAgentId,
        onUpload: onUploadFile,
        onConfigure: onConfigureChain,
        onToggleRerun,
        isChainConnected: a.nodeType === 'output'
          ? workflowEdges.some((e) => e.source === a.id && e.kind === 'flow')
          : false,
      },
      draggable: true,
    }))
  );

  // Track agent identity + count so we only resync structural changes
  // (add/remove agents), not every reference change from unrelated state
  // updates in the parent reducer. layoutTrigger is a third, explicit
  // signal: a "Tidy up" pass just ran and every position should be taken
  // from `agents` even though structure didn't change.
  const agentSignature = agents.map((a) => a.id).join(',');
  const prevSignatureRef = useRef(agentSignature);
  const prevLayoutTriggerForResyncRef = useRef(layoutTrigger);

  useEffect(() => {
    const structureChanged = prevSignatureRef.current !== agentSignature;
    const layoutJustRan = prevLayoutTriggerForResyncRef.current !== layoutTrigger;
    prevSignatureRef.current = agentSignature;
    prevLayoutTriggerForResyncRef.current = layoutTrigger;

    setNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((n) => [n.id, n]));
      return agents.map((agent) => {
        const existing = currentById.get(agent.id);
        // Keep React Flow's live position (it may differ from the agent's
        // last-committed position if a drag is in flight) unless this is a
        // brand new node, a structural change, or an explicit auto-layout
        // pass — in those cases `agents` is the source of truth.
        const position =
          existing && !structureChanged && !layoutJustRan ? existing.position : agent.position;
        return {
          id: agent.id,
          type: agent.nodeType ?? 'agent',
          position,
          data: {
            agent,
            selected: agent.id === selectedAgentId,
            onUpload: onUploadFile,
            onConfigure: onConfigureChain,
            onToggleRerun,
            // Output node badge logic — computed from live edges so it
            // updates immediately when connections change, no run needed:
            // isChainConnected: true when this output node has a flow edge
            //   going out (something in this workspace connects from it)
            // hasCachedOutput: true when capturedOutput is set from a run
            isChainConnected: agent.nodeType === 'output'
              ? workflowEdges.some((e) => e.source === agent.id && e.kind === 'flow')
              : false,
          },
          draggable: true,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, selectedAgentId, agentSignature, layoutTrigger, workflowEdges]);

  const edges = useMemo(
    () =>
      workflowEdges.map((conn) => ({
        id: conn.id,
        source: conn.source,
        target: conn.target,
        type: 'agent',
        ...edgeBase[conn.kind],
        labelStyle: conn.kind === 'feedback'
          ? { fill: '#1985A1', fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: 500 }
          : undefined,
        labelBgStyle: conn.kind === 'feedback'
          ? { fill: '#161718' }
          : undefined,
        data: { onDelete: onDeleteEdge },
      })),
    [workflowEdges, onDeleteEdge]
  );

  const handleNodeDragStop = useCallback(
    (_, node) => {
      onMoveAgent?.(node.id, node.position);
    },
    [onMoveAgent]
  );

  const handleNodeDoubleClick = useCallback(
    (_, node) => {
      const agent = agents.find((a) => a.id === node.id);
      if (!agent) return;

      // Import: open file upload
      if (agent.nodeType === 'import') {
        onUploadFile?.(agent.id);
        return;
      }

      // Output and Chain: open the sidebar detail panel
      // (same as clicking a regular agent node — sidebar detects nodeType)
      if (agent.nodeType === 'output' || agent.nodeType === 'chain') {
        onSelectAgent?.(node.id);
        return;
      }

      onEditAgent?.(node.id);
    },
    [agents, onEditAgent, onUploadFile, onSelectAgent]
  );

  // Connection-in-progress: captured on a valid drag-to-drop, resolved once
  // the user picks flow/feedback from the popover (or cancels it).
  const [pendingConnection, setPendingConnection] = useState(null);
  const wrapperRef = useRef(null);
  const { flowToScreenPosition, screenToFlowPosition, fitView } = useReactFlow();
  // Use a ref so handleFitView always calls the latest fitView without
  // needing it in a dependency array (fitView changes identity each render).
  const fitViewRef = useRef(fitView);
  useEffect(() => { fitViewRef.current = fitView; }, [fitView]);
  const handleFitView = useCallback(
    () => fitViewRef.current?.({ padding: 0.3, duration: 300 }),
    []
  );

  // After an auto-layout pass (triggered from the topbar's "Tidy up"
  // button), smoothly reframe the canvas so the newly arranged graph is
  // actually visible. Skipped on initial mount (trigger starts at 0 and
  // the `fitView` prop already handles the first render). This effect's
  // job is purely "should we reframe the camera" — it's intentionally
  // separate from the resync effect above, which decides "whose position
  // wins"; combining them risks the camera reframing before positions
  // have actually updated.
  const prevLayoutTriggerForFitViewRef = useRef(layoutTrigger);
  useEffect(() => {
    if (layoutTrigger !== prevLayoutTriggerForFitViewRef.current) {
      prevLayoutTriggerForFitViewRef.current = layoutTrigger;
      // Defer to the next frame so this runs after the position resync
      // effect above has applied the new coordinates to React Flow's
      // node state — fitView needs current positions to frame correctly.
      requestAnimationFrame(() => {
        handleFitView();
      });
    }
  }, [layoutTrigger, handleFitView]);

  const handleConnect = useCallback(
    (connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return;

      const alreadyConnected = workflowEdges.some(
        (e) => e.source === source && e.target === target
      );
      if (alreadyConnected) return;

      const targetNode = nodes.find((n) => n.id === target);
      const wrapperRect = wrapperRef.current?.getBoundingClientRect();

      let x = 200;
      let y = 200;
      if (targetNode && wrapperRect) {
        const screenPoint = flowToScreenPosition({
          x: targetNode.position.x + 230,
          y: targetNode.position.y,
        });
        const pickerWidth = 230;
        const pickerHeight = 130;
        x = Math.min(
          Math.max(screenPoint.x - wrapperRect.left, 12),
          wrapperRect.width - pickerWidth - 12
        );
        y = Math.min(
          Math.max(screenPoint.y - wrapperRect.top, 12),
          wrapperRect.height - pickerHeight - 12
        );
      }

      setPendingConnection({ source, target, x, y });
    },
    [workflowEdges, nodes, flowToScreenPosition]
  );

  const resolveConnection = useCallback(
    (kind) => {
      if (pendingConnection) {
        onAddEdge?.({ source: pendingConnection.source, target: pendingConnection.target, kind });
      }
      setPendingConnection(null);
    },
    [pendingConnection, onAddEdge]
  );

  const handleEdgesDelete = useCallback(
    (deleted) => {
      deleted.forEach((e) => onDeleteEdge?.(e.id));
    },
    [onDeleteEdge]
  );

  const cancelConnection = useCallback(() => setPendingConnection(null), []);

  const handleNodeClick = useCallback(
    (_, node) => onSelectAgent(node.id),
    [onSelectAgent]
  );

  // Right-click context menus: one of 'pane' | 'node' | 'edge', plus the
  // screen position to render the menu at and whatever target (node/edge
  // id) it applies to.
  const [contextMenu, setContextMenu] = useState(null);

  const handlePaneClick = useCallback(() => {
    onSelectAgent(null);
    setContextMenu(null); // dismiss context menu on any pane click
  }, [onSelectAgent]);

  const handlePaneContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      const wrapperRect = wrapperRef.current?.getBoundingClientRect();
      setContextMenu({
        type: 'pane',
        x: event.clientX - (wrapperRect?.left ?? 0),
        y: event.clientY - (wrapperRect?.top ?? 0),
        flowPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      });
    },
    [screenToFlowPosition]
  );

  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    setContextMenu({
      type: 'node',
      x: event.clientX - (wrapperRect?.left ?? 0),
      y: event.clientY - (wrapperRect?.top ?? 0),
      nodeId: node.id,
    });
  }, []);

  const handleEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    setContextMenu({
      type: 'edge',
      x: event.clientX - (wrapperRect?.left ?? 0),
      y: event.clientY - (wrapperRect?.top ?? 0),
      edgeId: edge.id,
    });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const contextMenuItems = useMemo(() => {
    if (!contextMenu) return [];
    if (contextMenu.type === 'pane') {
      const hasOverseer = agents.some((a) => a.isManager);
      return [
        // — Canvas (most used, comes first) —
        { type: 'label', text: 'Canvas' },
        {
          label: 'Tidy up',
          icon: <TidyUpIcon />,
          onSelect: () => onTidyUp?.(),
        },
        {
          label: 'Fit view',
          icon: <FitViewIcon />,
          onSelect: handleFitView,
        },
        {
          label: 'Conditions',
          icon: <ConditionsIcon />,
          accent: true,
          onSelect: () => onOpenConditions?.(),
        },
        'divider',
        // — Agents —
        { type: 'label', text: 'Agents' },
        {
          label: 'Add agent',
          icon: <AgentIcon />,
          onSelect: () => onAddAgentAt?.(contextMenu.flowPosition),
        },
        {
          label: 'Add Overseer',
          icon: <OverseerIcon />,
          accent: !hasOverseer,
          onSelect: () => onAddOverseerAt?.(contextMenu.flowPosition),
          disabled: hasOverseer,
          hint: hasOverseer ? '(exists)' : undefined,
        },
        'divider',
        // — Data nodes —
        { type: 'label', text: 'Data nodes' },
        {
          label: 'File import',
          icon: <FileImportIcon />,
          onSelect: () => onAddImportAt?.(contextMenu.flowPosition),
        },
        {
          label: 'Output',
          icon: <OutputIcon />,
          onSelect: () => onAddOutputAt?.(contextMenu.flowPosition),
        },
        {
          label: 'Chain input',
          icon: <ChainIcon />,
          onSelect: () => onAddChainAt?.(contextMenu.flowPosition),
        },
      ];
    }
    if (contextMenu.type === 'node') {
      const agent = agents.find((a) => a.id === contextMenu.nodeId);
      const nodeType = agent?.nodeType ?? 'agent';

      const editItem = (() => {
        if (nodeType === 'import') {
          return {
            label: 'Manage files',
            icon: <FileImportIcon />,
            onSelect: () => onUploadFile?.(contextMenu.nodeId),
          };
        }
        if (nodeType === 'chain') {
          return {
            label: 'Choose source workspace',
            icon: <ChainIcon />,
            onSelect: () => onConfigureChain?.(contextMenu.nodeId),
          };
        }
        if (nodeType === 'output') {
          return null;
        }
        return {
          label: 'Edit agent',
          icon: <EditIcon />,
          onSelect: () => onEditAgent?.(contextMenu.nodeId),
        };
      })();

      return [
        ...(editItem ? [editItem] : []),
        {
          label: agent ? `Delete "${agent.name}"` : 'Delete',
          icon: <DeleteIcon />,
          danger: true,
          onSelect: () => onDeleteAgent?.(contextMenu.nodeId),
        },
      ];
    }
    if (contextMenu.type === 'edge') {
      return [
        {
          label: 'Delete connection',
          icon: <DeleteConnectionIcon />,
          danger: true,
          onSelect: () => onDeleteEdge?.(contextMenu.edgeId),
        },
      ];
    }
    return [];
  }, [contextMenu, agents, handleFitView, onAddAgentAt, onAddOverseerAt, onAddImportAt, onAddOutputAt, onAddChainAt, onTidyUp, onOpenConditions, onUploadFile, onConfigureChain, onEditAgent, onDeleteAgent, onDeleteEdge]);

  return (
    <div className="canvas-wrap" ref={wrapperRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onEdgesDelete={handleEdgesDelete}
        deleteKeyCode={['Backspace', 'Delete']}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={connectionLineStyle}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#232527"
        />
        <Controls
          showInteractive={false}
          className="parlance-controls"
        />
        <MiniMap
          className="parlance-minimap"
          maskColor="rgba(22, 23, 24, 0.7)"
          nodeColor="#46494C"
          pannable
          zoomable
        />
      </ReactFlow>
      {pendingConnection && (
        <EdgeTypePicker
          x={pendingConnection.x}
          y={pendingConnection.y}
          onChoose={resolveConnection}
          onCancel={cancelConnection}
        />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
