import { Handle, Position } from 'reactflow';
import './SpecialNode.css';

export default function ChainNode({ data }) {
  const { agent, selected, onConfigure } = data;
  const { sourceWorkspaceName, rerunLinked, chainLog } = agent;
  const hasSource = !!sourceWorkspaceName;

  return (
    <div
      className={`special-node chain-node ${selected ? 'is-selected' : ''} ${hasSource ? 'has-content' : ''}`}
    >
      <div className="special-node-type-label">CHAIN INPUT</div>
      <div className="special-node-name">{agent.name}</div>

      {hasSource ? (
        <>
          <div className="special-node-detail">
            <span className="special-node-chain-arrow">←</span>
            <span className="special-node-workspace-name">{sourceWorkspaceName}</span>
            <button
              className="chain-node-change-btn"
              onClick={(e) => { e.stopPropagation(); onConfigure?.(agent.id); }}
            >
              Change
            </button>
          </div>

          <label className="chain-node-toggle" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!rerunLinked}
              onChange={(e) => {
                e.stopPropagation();
                data.onToggleRerun?.(agent.id);
              }}
            />
            <span className="chain-node-toggle-label">
              Re-run on every chain {rerunLinked ? '(always fresh)' : '(use cache)'}
            </span>
          </label>

          {chainLog?.length > 0 && (
            <div className="chain-node-log">
              {chainLog.slice(-4).map((entry, i) => (
                <div key={i} className={`chain-node-log-entry chain-node-log-${entry.kind}`}>
                  {entry.text}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <button
          className="special-node-upload-btn"
          onClick={() => onConfigure?.(agent.id)}
        >
          Select source workflow
        </button>
      )}

      <Handle type="source" position={Position.Right} className="agent-handle" />
    </div>
  );
}
