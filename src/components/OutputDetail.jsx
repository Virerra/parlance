import './OutputDetail.css';

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function OutputDetail({ agent, onBack, chainConsumers }) {
  const { capturedOutput, capturedFiles, savedAt, name } = agent;
  const hasOutput = !!capturedOutput;
  const files = capturedFiles ?? [];

  return (
    <div className="output-detail">
      <div className="output-detail-header">
        <button className="detail-back-btn" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <div className="output-detail-title-row">
          <span className="output-detail-type-badge">OUTPUT</span>
          <span className="output-detail-name">{name}</span>
        </div>
      </div>

      {hasOutput ? (
        <>
          {/* Text output */}
          <div className="output-detail-section">
            <div className="output-detail-section-header">
              <span className="output-detail-section-label">Text output</span>
              <div className="output-detail-section-actions">
                <button
                  className="output-detail-action"
                  onClick={() => navigator.clipboard.writeText(capturedOutput)}
                >
                  Copy
                </button>
                <button
                  className="output-detail-action"
                  onClick={() => downloadText(capturedOutput, `${name}.txt`)}
                >
                  ↓ Download
                </button>
              </div>
            </div>
            <div className="output-detail-text">{capturedOutput}</div>
            {savedAt && (
              <div className="output-detail-timestamp">
                Saved {new Date(savedAt).toLocaleString()}
              </div>
            )}
          </div>

          {/* Files */}
          {files.length > 0 && (
            <div className="output-detail-section">
              <span className="output-detail-section-label">Files ({files.length})</span>
              <div className="output-detail-files">
                {files.map((f, i) => (
                  <div key={i} className="output-detail-file-row">
                    <span className="output-detail-file-icon">📄</span>
                    <span className="output-detail-file-name">{f.path ?? `file-${i + 1}`}</span>
                    <button
                      className="output-detail-action"
                      onClick={() => downloadText(f.content ?? '', f.path ?? `file-${i + 1}`)}
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chain connections */}
          <div className="output-detail-section">
            <span className="output-detail-section-label">Chain connections</span>
            {chainConsumers?.length > 0 ? (
              <div className="output-detail-chains">
                {chainConsumers.map((ws) => (
                  <div key={ws.id} className="output-detail-chain-row">
                    <span className="output-detail-chain-icon">⛓</span>
                    <span className="output-detail-chain-name">{ws.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="output-detail-no-chains">
                No other workflows are currently chaining from this output.
                Add a Chain Input node in another workflow and select this workspace to connect them.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="output-detail-empty">
          <p>No output captured yet.</p>
          <p>Run this workflow — when the agent connected to this Output node completes, its result will appear here.</p>
        </div>
      )}
    </div>
  );
}
