import PanelToggleIcon from './icons/PanelToggleIcon';
import './TopBar.css';

export default function TopBar({
  sidebarOpen,
  onToggleSidebar,
  workspaceSwitcher,
  onOpenConditions,
  hasConditions,
  onTidyUp,
  onRun,
  onCancelRun,
  isRunning,
  canRun,
  onOpenSettings,
  hasApiKey,
  hasApprovedResults,
  onOpenResults,
}) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="brand-lockup">
          <span className="brand-wordmark">Parlance</span>
          <span className="brand-connectors" aria-hidden="true">
            <span className="connector-a" />
            <span className="connector-b" />
          </span>
        </div>
        <span className="topbar-divider" />
        {workspaceSwitcher}
      </div>

      <div className="topbar-actions">
        <button className="topbar-btn topbar-btn-ghost" onClick={onTidyUp} disabled={isRunning}>
          Tidy up
        </button>
        <button className="topbar-btn topbar-btn-ghost" onClick={onOpenConditions}>
          Conditions
          {hasConditions && <span className="topbar-conditions-dot" aria-hidden="true" />}
        </button>
        <button
          className="topbar-btn topbar-btn-ghost"
          onClick={onOpenSettings}
          title={hasApiKey ? 'API key set' : 'No API key set — using mock agents'}
        >
          Settings
          {!hasApiKey && <span className="topbar-settings-dot" aria-hidden="true" />}
        </button>
        {hasApprovedResults && (
          <button className="topbar-btn topbar-btn-ghost" onClick={onOpenResults}>
            Results
            <span className="topbar-conditions-dot" aria-hidden="true" />
          </button>
        )}
        {isRunning ? (
          <button className="topbar-btn topbar-btn-danger" onClick={onCancelRun}>
            Cancel run
          </button>
        ) : (
          <button
            className="topbar-btn topbar-btn-accent"
            onClick={onRun}
            disabled={!canRun}
            title={canRun ? undefined : 'Add at least one agent to run the workflow'}
          >
            Run
          </button>
        )}
        <button
          className="topbar-btn topbar-btn-icon"
          onClick={onToggleSidebar}
          aria-pressed={sidebarOpen}
          aria-label={sidebarOpen ? 'Hide status panel' : 'Show status panel'}
          title={sidebarOpen ? 'Hide status panel' : 'Show status panel'}
        >
          <PanelToggleIcon open={sidebarOpen} />
        </button>
      </div>
    </header>
  );
}
