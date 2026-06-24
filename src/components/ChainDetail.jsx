import './OutputDetail.css';

export default function ChainDetail({ agent, onBack, onConfigure, onToggleRerun, linkedWorkspace }) {
  const {
    name,
    sourceWorkspaceName,
    sourceWorkspaceId,
    rerunLinked,
    chainLog,
  } = agent;

  const hasLinked = !!sourceWorkspaceId;
  const outputNode = linkedWorkspace?.agents?.find((a) => a.nodeType === 'output');
  const hasCached = !!(outputNode?.capturedOutput);

  return (
    <div className="output-detail">
      <div className="output-detail-header">
        <button className="detail-back-btn" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <div className="output-detail-title-row">
          <span className="output-detail-type-badge chain-badge">CHAIN INPUT</span>
          <span className="output-detail-name">{name}</span>
        </div>
      </div>

      {/* Linked workflow */}
      <div className="output-detail-section">
        <span className="output-detail-section-label">Linked workflow</span>
        {hasLinked ? (
          <div className="chain-detail-linked">
            <div className="chain-detail-linked-name">
              <span className="chain-detail-linked-icon">←</span>
              {sourceWorkspaceName}
            </div>
            <div className="chain-detail-status">
              {hasCached
                ? <span className="chain-detail-cached">◉ Output cached</span>
                : <span className="chain-detail-nocache">○ No cache — will run on chain</span>
              }
            </div>
            <button
              className="output-detail-action chain-detail-change"
              onClick={() => onConfigure?.(agent.id)}
            >
              Change source
            </button>
          </div>
        ) : (
          <button
            className="output-detail-action chain-detail-change"
            onClick={() => onConfigure?.(agent.id)}
          >
            Select source workflow
          </button>
        )}
      </div>

      {/* Re-run toggle */}
      {hasLinked && (
        <div className="output-detail-section">
          <span className="output-detail-section-label">Re-run behaviour</span>
          <label className="chain-detail-toggle">
            <input
              type="checkbox"
              checked={!!rerunLinked}
              onChange={() => onToggleRerun?.(agent.id)}
            />
            <span className="chain-detail-toggle-text">
              {rerunLinked
                ? 'Always re-run linked workflow (fresh output every time)'
                : 'Use cached output when available (saves tokens)'}
            </span>
          </label>
        </div>
      )}

      {/* Cached content preview */}
      {hasCached && (
        <div className="output-detail-section">
          <span className="output-detail-section-label">Cached output preview</span>
          <div className="output-detail-text" style={{ maxHeight: 160 }}>
            {outputNode.capturedOutput.slice(0, 400)}
            {outputNode.capturedOutput.length > 400 ? '…' : ''}
          </div>
          {outputNode.savedAt && (
            <div className="output-detail-timestamp">
              Cached {new Date(outputNode.savedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Activity log */}
      {chainLog?.length > 0 && (
        <div className="output-detail-section">
          <span className="output-detail-section-label">Last run activity</span>
          <div className="chain-detail-log">
            {chainLog.map((entry, i) => (
              <div key={i} className={`chain-detail-log-entry chain-log-${entry.kind}`}>
                {entry.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
