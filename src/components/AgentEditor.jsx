import { useState, useEffect, useRef } from 'react';
import './shared.css';
import './AgentEditor.css';

const MODELS = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

const emptyForm = {
  name: '',
  role: '',
  task: '',
  systemPrompt: '',
  maxIterations: 3,
  isManager: false,
  model: 'claude-sonnet-4-6',
  canUseFiles: false,
};

export default function AgentEditor({ agent, preset, onSave, onDelete, onClose }) {
  const isNew = !agent;
  const [form, setForm] = useState(() => {
    if (agent) {
      return {
        name: agent.name,
        role: agent.role,
        task: agent.task,
        systemPrompt: agent.systemPrompt ?? '',
        maxIterations: agent.maxIterations,
        isManager: agent.isManager,
        model: agent.model,
        canUseFiles: agent.canUseFiles ?? false,
      };
    }
    if (preset === 'overseer') {
      return {
        ...emptyForm,
        name: 'Overseer',
        role: 'Overseer',
        task: 'Review the work against the workflow conditions and approve or reject.',
        isManager: true,
        maxIterations: 3,
      };
    }
    return emptyForm;
  });
  const [errors, setErrors] = useState({});
  // System prompt starts collapsed — visible when needed, not in the way
  // for users who don't need it.
  const [systemPromptOpen, setSystemPromptOpen] = useState(
    () => !!(agent?.systemPrompt?.trim())
  );
  const nameInputRef = useRef(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = 'Name is required';
    // Task is system-defined for Overseer agents — not user-configurable,
    // not shown in the form, so not validated here.
    if (!form.isManager && !form.task.trim()) {
      next.task = 'Describe what this agent should do';
    }
    if (form.maxIterations < 1 || form.maxIterations > 10) {
      next.maxIterations = 'Must be between 1 and 10';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    // Overseer task is system-defined — enforce it on save so a previously
    // saved custom task can't persist through an edit.
    const toSave = form.isManager
      ? { ...form, task: 'Review the work against the workflow conditions and approve or reject.' }
      : form;
    onSave(toSave);
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="agent-editor-title">
        <div className="modal-header">
          <h2 id="agent-editor-title" className="modal-title">
            {isNew ? 'New agent' : 'Edit agent'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={`modal-body ${form.isManager ? 'modal-body-compact' : ''}`}>
          <div className="form-field">
            <label htmlFor="agent-name">Name</label>
            <input
              id="agent-name"
              ref={nameInputRef}
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Builder"
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="agent-role">Role (shown on the node)</label>
            <input
              id="agent-role"
              type="text"
              value={form.role}
              onChange={(e) => update('role', e.target.value)}
              placeholder="e.g. Writes the implementation"
            />
          </div>

          {form.isManager ? (
            <div className="overseer-task-info">
              <p className="overseer-task-info-title">What the Overseer does</p>
              <p className="overseer-task-info-body">
                The Overseer compares the final output against the{' '}
                <strong>workflow conditions</strong> you've set and decides whether
                to approve or send work back for another pass. Its behaviour is
                fixed — set your success criteria in the{' '}
                <strong>Conditions</strong> button in the top bar.
              </p>
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="agent-task">Task</label>
              <textarea
                id="agent-task"
                value={form.task}
                onChange={(e) => update('task', e.target.value)}
                placeholder="What should this agent do with the input it receives?"
                rows={4}
              />
              {errors.task && <span className="form-error">{errors.task}</span>}
            </div>
          )}

          <div className="system-prompt-section">
            <button
              type="button"
              className="system-prompt-toggle"
              onClick={() => setSystemPromptOpen((o) => !o)}
              aria-expanded={systemPromptOpen}
            >
              <span className="system-prompt-toggle-chevron">
                {systemPromptOpen ? '▾' : '▸'}
              </span>
              System prompt
              {form.systemPrompt.trim() && (
                <span className="system-prompt-set-dot" aria-label="set" />
              )}
            </button>
            {systemPromptOpen && (
              <div className="system-prompt-body">
                <p className="form-hint" style={{ marginBottom: 6 }}>
                  Shapes how the model behaves — its persona, constraints, and
                  style. Separate from the task, which tells it what to do.
                  {form.isManager && ' Added after the built-in Overseer instructions.'}
                </p>
                <textarea
                  className="system-prompt-textarea"
                  value={form.systemPrompt}
                  onChange={(e) => update('systemPrompt', e.target.value)}
                  placeholder={
                    form.isManager
                      ? 'e.g. Be concise in your feedback. Always cite which condition was unmet.'
                      : 'e.g. You are a senior Python engineer. Write clean, well-commented code. Prefer stdlib over third-party libraries.'
                  }
                  rows={4}
                />
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="agent-model">Model</label>
              <select
                id="agent-model"
                value={form.model}
                onChange={(e) => update('model', e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field form-field-narrow">
              <label htmlFor="agent-max-iter">
                {form.isManager ? 'Max evaluations' : 'Retry cap'}
              </label>
              <input
                id="agent-max-iter"
                type="number"
                min={1}
                max={10}
                value={form.maxIterations}
                onChange={(e) => update('maxIterations', Number(e.target.value))}
              />
              {form.isManager && (
                <span className="form-hint">
                  Total times the Overseer evaluates output. 1 = evaluate once only, 3 = evaluate
                  up to 3 times (2 rejection loops).
                </span>
              )}
              {errors.maxIterations && <span className="form-error">{errors.maxIterations}</span>}
            </div>
          </div>

          {!form.isManager && (
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={form.canUseFiles}
                onChange={(e) => update('canUseFiles', e.target.checked)}
              />
              <span>
                File &amp; code tools
                <span className="form-checkbox-hint">
                  {' — lets this agent write, edit, and run files instead of just replying with text'}
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="modal-footer agent-editor-footer">
          {!isNew && (
            <button className="btn btn-danger-ghost" onClick={() => onDelete(agent.id)}>
              Delete agent
            </button>
          )}
          <div className="agent-editor-footer-right">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-accent" onClick={handleSave}>
              {isNew ? 'Add agent' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
