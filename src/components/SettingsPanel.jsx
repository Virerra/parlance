import { useState, useEffect, useRef } from 'react';
import { getApiKey, setApiKey, maskApiKey } from '../data/apiKeyStorage';
import './shared.css';
import './SettingsPanel.css';

function isPlausibleKeyFormat(key) {
  // Loose sanity check, not real validation (we can't validate a key
  // without calling the API, which we deliberately avoid doing just for
  // a UI save). Anthropic keys start with 'sk-ant-'.
  return key.trim().length === 0 || key.trim().startsWith('sk-ant-');
}

export default function SettingsPanel({ onClose }) {
  const [existingKey, setExistingKey] = useState(() => getApiKey());
  const [value, setValue] = useState(existingKey);
  const [revealed, setRevealed] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const trimmed = value.trim();
  const formatWarning = !isPlausibleKeyFormat(trimmed);
  const hasExistingKey = existingKey.trim().length > 0;

  function handleSave() {
    setApiKey(trimmed);
    setExistingKey(trimmed);
    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 1800);
  }

  function handleClear() {
    setApiKey('');
    setExistingKey('');
    setValue('');
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-header">
          <h2 id="settings-title" className="modal-title">Settings</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label htmlFor="api-key-input">Anthropic API key</label>
            <p className="settings-help">
              Used to run your agents against the real Claude API. Stored only in this browser —
              never sent anywhere except directly to Anthropic when a workflow runs.
            </p>
            <div className="settings-key-row">
              <input
                id="api-key-input"
                ref={inputRef}
                type={revealed ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="settings-reveal-btn"
                onClick={() => setRevealed((v) => !v)}
                aria-label={revealed ? 'Hide key' : 'Show key'}
              >
                {revealed ? 'Hide' : 'Show'}
              </button>
            </div>
            {formatWarning && (
              <p className="form-error">
                Anthropic API keys normally start with "sk-ant-". Double-check before saving.
              </p>
            )}
            {hasExistingKey && !formatWarning && (
              <p className="settings-current">
                Currently saved: <code>{maskApiKey(existingKey)}</code>
              </p>
            )}
          </div>

          <div className="settings-cost-note">
            <strong>A note on cost:</strong> running a workflow makes real, billed API calls — one
            per agent attempt, including retries. Start with a small workflow to see typical usage
            before running anything large.
          </div>
        </div>

        <div className="modal-footer">
          {hasExistingKey && (
            <button className="btn btn-ghost" onClick={handleClear}>
              Remove key
            </button>
          )}
          <span style={{ flex: 1 }} />
          {savedJustNow && <span className="settings-saved-tag">Saved</span>}
          <button className="btn btn-accent" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
