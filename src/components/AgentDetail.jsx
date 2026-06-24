import { useState } from 'react';
import './AgentDetail.css';

const STATUS_LABEL = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

function downloadFile(file) {
  const blob = new Blob([file.content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.path.split('/').pop() || 'file.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function FileEntry({ file }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the
      // download button is always available as a fallback, so this just
      // silently no-ops rather than showing an error for a minor feature.
    }
  }

  return (
    <div className="file-entry">
      <button className="file-entry-header" onClick={() => setExpanded((v) => !v)}>
        <span className="file-entry-caret">{expanded ? '▾' : '▸'}</span>
        <span className="file-entry-path">{file.path}</span>
        <span className="file-entry-actions">
          <span className="file-entry-action" onClick={handleCopy} role="button" tabIndex={-1}>
            {copied ? 'Copied' : 'Copy'}
          </span>
          <span
            className="file-entry-action"
            onClick={(e) => {
              e.stopPropagation();
              downloadFile(file);
            }}
            role="button"
            tabIndex={-1}
          >
            Download
          </span>
        </span>
      </button>
      {expanded && <pre className="file-entry-content">{file.content}</pre>}
    </div>
  );
}

export default function AgentDetail({ agent, onBack, onEdit }) {
  const runs = [...agent.runs].reverse(); // most recent first

  return (
    <div className="agent-detail">
      <div className="agent-detail-header">
        <button className="agent-detail-back" onClick={onBack} aria-label="Back to board">
          ←
        </button>
        <div className="agent-detail-title-group">
          <div className="agent-detail-name">{agent.name}</div>
          <div className="agent-detail-role">{agent.role}</div>
        </div>
        <button className="agent-detail-edit" onClick={() => onEdit(agent.id)}>
          Edit
        </button>
      </div>

      <div className="agent-detail-meta">
        <span className={`status-dot status-dot-${agent.status}`} aria-hidden="true" />
        <span>{STATUS_LABEL[agent.status]}</span>
        {agent.maxIterations > 1 && (
          <span className="agent-detail-meta-sep">
            {runs.length}/{agent.maxIterations} attempts
          </span>
        )}
      </div>

      <div className="agent-detail-runs">
        {runs.length === 0 && (
          <div className="agent-detail-empty">No runs yet. Run the workflow to see output here.</div>
        )}
        {runs.map((run) => (
          <div key={run.id} className={`run-card run-card-${run.status}`}>
            <div className="run-card-header">
              <span className="run-card-attempt">Attempt {run.attempt}</span>
              <span className={`run-card-status run-card-status-${run.status}`}>
                {STATUS_LABEL[run.status]}
              </span>
            </div>

            {run.status === 'failed' && run.error && (
              <div className="run-card-error">{run.error}</div>
            )}

            {run.files && run.files.length > 0 && (
              <div className="run-card-section">
                <div className="run-card-files-label">
                  Files ({run.files.length})
                </div>
                <div className="file-list">
                  {run.files.map((file) => (
                    <FileEntry key={file.path} file={file} />
                  ))}
                </div>
              </div>
            )}

            {run.input && (
              <details className="run-card-section">
                <summary>Input</summary>
                <div className="run-card-text">{run.input}</div>
              </details>
            )}

            {run.output && (
              <details className="run-card-section" open>
                <summary>Output</summary>
                <div className="run-card-text">{run.output}</div>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
