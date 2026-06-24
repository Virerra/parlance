import { useState, useMemo } from 'react';
import { collectAllFiles } from '../data/workflowModel';
import './shared.css';
import './ResultsPanel.css';

/**
 * Shown after a run completes with Overseer approval. Deliberately does
 * NOT try to guess which files are "real" output vs. scratch/temp work an
 * agent produced along the way — that's a situational judgment call (per
 * explicit decision) the app can't make reliably. Every file from every
 * agent is listed, grouped by agent, nothing pre-selected — the person
 * picks what they actually want before downloading.
 */
export default function ResultsPanel({ workflow, overseerOutput, onClose }) {
  const fileGroups = useMemo(() => collectAllFiles(workflow), [workflow]);

  // Output nodes are explicit delivery points — show their content first
  const outputNodes = useMemo(
    () => workflow.agents.filter((a) => a.nodeType === 'output' && a.capturedOutput),
    [workflow]
  );

  const [selected, setSelected] = useState(() => new Set());

  const allFilesFlat = useMemo(
    () => fileGroups.flatMap((g) => g.files.map((f) => ({ ...f, agentName: g.agentName }))),
    [fileGroups]
  );

  function toggle(path) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allFilesFlat.map((f) => f.path)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handleDownload() {
    const chosen = allFilesFlat.filter((f) => selected.has(f.path));
    if (chosen.length === 0) return;

    if (chosen.length === 1) {
      downloadSingleFile(chosen[0]);
      return;
    }

    const zip = new (await import('jszip')).default();
    chosen.forEach((f) => {
      // Files from different agents could share a path (e.g. two agents
      // both write a file called notes.txt) — prefix with agent name to
      // avoid silently overwriting one inside the zip.
      const safeAgent = f.agentName.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'agent';
      zip.file(`${safeAgent}/${f.path}`, f.content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `${workflow.name || 'parlance-results'}.zip`);
  }

  const hasFiles = allFilesFlat.length > 0;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-shell results-shell" role="dialog" aria-modal="true" aria-labelledby="results-title">
        <div className="modal-header">
          <h2 id="results-title" className="modal-title">
            {overseerOutput ? 'Run approved' : 'Run results'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {overseerOutput && (
            <div className="results-overseer-note">
              <p className="results-section-label">Overseer's decision</p>
              <p className="results-overseer-text">{overseerOutput}</p>
            </div>
          )}

          {outputNodes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p className="results-section-label">Output nodes</p>
              {outputNodes.map((node) => (
                <div key={node.id} className="results-overseer-note" style={{ marginBottom: 8 }}>
                  <p className="results-section-label" style={{ color: '#1a7a6e' }}>{node.name}</p>
                  <p className="results-overseer-text">{node.capturedOutput}</p>
                </div>
              ))}
            </div>
          )}

          {hasFiles ? (
            <>
              <div className="results-files-header">
                <p className="results-section-label">Files from this run</p>
                <div className="results-select-actions">
                  <button className="results-select-link" onClick={selectAll}>Select all</button>
                  <span className="results-select-sep">·</span>
                  <button className="results-select-link" onClick={selectNone}>Select none</button>
                </div>
              </div>

              {fileGroups.map((group) => (
                <div className="results-agent-group" key={group.agentId}>
                  <p className="results-agent-name">{group.agentName}</p>
                  {group.files.map((f) => (
                    <label className="results-file-row" key={`${group.agentId}:${f.path}`}>
                      <input
                        type="checkbox"
                        checked={selected.has(f.path)}
                        onChange={() => toggle(f.path)}
                      />
                      <span className="results-file-path">{f.path}</span>
                    </label>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <p className="results-no-files">
              No files were produced in this run — only text output, shown above.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {hasFiles && (
            <button
              className="btn btn-accent"
              onClick={handleDownload}
              disabled={selected.size === 0}
            >
              Download selected ({selected.size})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadSingleFile(file) {
  const blob = new Blob([file.content], { type: 'text/plain' });
  downloadBlob(blob, file.path);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
