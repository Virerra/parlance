import { useState } from 'react';
import { loadWorkspaceIndex, loadWorkspace } from '../data/workspaceStorage';
import './shared.css';
import './ChainConfig.css';

export default function ChainConfig({ nodeId, activeWorkspaceId, onSave, onClose }) {
  const [workspaces] = useState(() => {
    const all = loadWorkspaceIndex().filter((w) => w.id !== activeWorkspaceId);
    // Only show workspaces that have an Output node — those are the valid chain sources
    return all.filter((w) => {
      const ws = loadWorkspace(w.id);
      return ws?.agents?.some((a) => a.nodeType === 'output');
    });
  });
  const [selectedId, setSelectedId] = useState(null);

  function handleSave() {
    if (!selectedId) return;
    const ws = workspaces.find((w) => w.id === selectedId);
    if (!ws) return;
    onSave(nodeId, { sourceWorkspaceId: selectedId, sourceWorkspaceName: ws.name });
    onClose();
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-shell chain-config-shell" role="dialog" aria-modal="true" aria-labelledby="chain-config-title">
        <div className="modal-header">
          <h2 id="chain-config-title" className="modal-title">Chain input — select workspace</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <p className="chain-config-hint">
            Select a workspace to pull its approved output from. The output will
            be injected as input to agents connected to this node.
          </p>

          {workspaces.length === 0 ? (
            <p className="chain-config-empty">
              No chainable workflows found. Add an Output node to another workflow first — only workflows with an Output node can be used as chain sources.
            </p>
          ) : (
            <div className="chain-config-list">
              {workspaces.map((ws) => {
                const wsData = loadWorkspace(ws.id);
                const outputNode = wsData?.agents?.find((a) => a.nodeType === 'output');
                const hasCached = !!(outputNode?.capturedOutput);
                return (
                  <button
                    key={ws.id}
                    className={`chain-config-item ${selectedId === ws.id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedId(ws.id)}
                  >
                    <span className="chain-config-item-name">{ws.name}</span>
                    <span className="chain-config-item-date">
                      {hasCached ? '✓ cached' : 'no cache'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-accent"
            onClick={handleSave}
            disabled={!selectedId}
          >
            Link workspace
          </button>
        </div>
      </div>
    </div>
  );
}
