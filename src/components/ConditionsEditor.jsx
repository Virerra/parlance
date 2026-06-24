import { useState, useEffect, useRef } from 'react';
import './shared.css';
import './ConditionsEditor.css';

const FILE_CONTEXT_OPTIONS = [
  {
    value: 'off',
    label: 'Off',
    description: 'Downstream agents see only text output, never file contents. Cheapest, lowest fidelity.',
  },
  {
    value: 'truncated',
    label: 'Truncated (default)',
    description: 'Downstream agents see real file contents, capped per file to control cost on every call.',
  },
  {
    value: 'full',
    label: 'Full',
    description: 'Downstream agents always see complete file contents. Highest fidelity, highest cost — large files get resent on every downstream call.',
  },
];

export default function ConditionsEditor({ conditions, fileContextMode, onSave, onClose }) {
  const [value, setValue] = useState(conditions);
  const [mode, setMode] = useState(fileContextMode ?? 'truncated');
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSave() {
    onSave({ conditions: value, fileContextMode: mode });
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="conditions-title">
        <div className="modal-header">
          <h2 id="conditions-title" className="modal-title">Conditions</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="conditions-help">
            Describe what a successful result looks like. The Overseer checks the final output
            against this before approving the run.
          </p>
          <textarea
            ref={textareaRef}
            className="conditions-textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. All tests pass and the API handles malformed requests without crashing."
            rows={6}
          />

          <div className="file-context-section">
            <p className="conditions-help">
              File visibility downstream — whether agents like Overseer or Debugger see the actual
              contents of files written by upstream agents, not just their text description of what
              they built. This is a real cost/quality tradeoff: more context helps catch real
              problems, but resends file content on every downstream call.
            </p>
            <div className="file-context-options" role="radiogroup" aria-label="File context mode">
              {FILE_CONTEXT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`file-context-option ${mode === opt.value ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="file-context-mode"
                    value={opt.value}
                    checked={mode === opt.value}
                    onChange={() => setMode(opt.value)}
                  />
                  <span className="file-context-option-label">{opt.label}</span>
                  <span className="file-context-option-desc">{opt.description}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-accent" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

