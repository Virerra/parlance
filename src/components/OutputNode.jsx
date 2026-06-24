import { Handle, Position } from 'reactflow';
import { CacheIcon, ChainConnectedIcon } from './icons/WorkflowIcons';
import './SpecialNode.css';

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

export default function OutputNode({ data }) {
  const { agent, selected, isChainConnected } = data;
  const { capturedOutput, capturedFiles, savedAt } = agent;
  const hasOutput = !!capturedOutput;
  const files = capturedFiles ?? [];
  const hasCachedOutput = hasOutput; // 💾 symbol — has saved data from a run

  function handleCopyText() {
    if (capturedOutput) navigator.clipboard.writeText(capturedOutput);
  }

  function handleDownloadText() {
    if (capturedOutput) downloadText(capturedOutput, `${agent.name}.txt`);
  }

  return (
    <div className={`special-node output-node ${selected ? 'is-selected' : ''} ${hasOutput ? 'has-content' : ''}`}>
      <Handle type="target" position={Position.Left} className="agent-handle" />

      <div className="output-node-header">
        <div className="special-node-type-label">OUTPUT</div>
        <div className="output-node-badges">
          {isChainConnected && (
            <span className="output-node-chain-badge" title="Connected to a Chain Input node">
              <ChainConnectedIcon />
            </span>
          )}
          {hasCachedOutput && (
            <span className="output-node-cache-badge" title="Has cached output from last run">
              <CacheIcon />
            </span>
          )}
        </div>
      </div>

      <div className="special-node-name">{agent.name}</div>

      {hasOutput ? (
        <>
          <div className="output-node-preview">
            {capturedOutput.slice(0, 80)}{capturedOutput.length > 80 ? '…' : ''}
          </div>

          <div className="output-node-actions">
            <button className="output-node-action-btn" onClick={handleCopyText} title="Copy text">
              Copy
            </button>
            <button className="output-node-action-btn" onClick={handleDownloadText} title="Download as .txt">
              ↓ Text
            </button>
          </div>

          {files.length > 0 && (
            <div className="output-node-files">
              <div className="output-node-files-label">Files</div>
              {files.map((f, i) => (
                <div key={i} className="output-node-file-row">
                  <span className="output-node-file-name">{f.path ?? `file-${i + 1}`}</span>
                  <button
                    className="output-node-action-btn"
                    onClick={() => downloadText(f.content ?? '', f.path ?? `file-${i + 1}`)}
                    title={`Download ${f.path}`}
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
          )}

          {savedAt && (
            <div className="output-node-timestamp">
              Saved {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </>
      ) : (
        <div className="special-node-empty">Awaiting run</div>
      )}
    </div>
  );
}
