import './shared.css';
import './RunChoiceModal.css';

export default function RunChoiceModal({ agents, onChooseMock, onChooseReal, onClose }) {
  const fileAgentCount = agents.filter((a) => a.canUseFiles).length;
  const totalAgents = agents.length;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-shell run-choice-shell" role="dialog" aria-modal="true" aria-labelledby="run-choice-title">
        <div className="modal-header">
          <h2 id="run-choice-title" className="modal-title">Run this workflow</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <button className="run-choice-option" onClick={onChooseMock}>
            <span className="run-choice-option-title">Mock run</span>
            <span className="run-choice-option-desc">
              Simulated agents, no API calls, free. Good for testing the workflow structure and
              retry behavior.
            </span>
          </button>

          <button className="run-choice-option run-choice-option-real" onClick={onChooseReal}>
            <span className="run-choice-option-title">Real run — uses your API key</span>
            <span className="run-choice-option-desc">
              Calls the actual Claude API for all {totalAgents} agent{totalAgents === 1 ? '' : 's'}
              {fileAgentCount > 0 && (
                <>
                  {' '}({fileAgentCount} with file &amp; code tools enabled, which costs more per
                  call than plain text)
                </>
              )}
              . This is billed to your account, including every retry attempt.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
