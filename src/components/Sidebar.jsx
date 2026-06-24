import { useEffect, useRef } from 'react';
import { attemptCount } from '../data/workflowModel';
import AgentDetail from './AgentDetail';
import OutputDetail from './OutputDetail';
import ChainDetail from './ChainDetail';
import { loadWorkspace } from '../data/workspaceStorage';
import { loadWorkspaceIndex } from '../data/workspaceStorage';
import './Sidebar.css';

const COLUMNS = [
  { key: 'pending', label: 'Pending' },
  { key: 'running', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
];

function RunLog({ runLog, runStatus }) {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [runLog.length]);

  if (runStatus === 'idle' && runLog.length === 0) return null;

  return (
    <div className="run-log">
      <div className="run-log-header">
        <span className={`run-log-status run-log-status-${runStatus}`}>
          {runStatus === 'running' && 'Running'}
          {runStatus === 'completed' && 'Completed'}
          {runStatus === 'halted' && 'Halted'}
          {runStatus === 'idle' && 'Last run'}
        </span>
      </div>
      <div className="run-log-entries">
        {runLog.map((entry) => (
          <div key={entry.id} className={`run-log-entry run-log-entry-${entry.kind}`}>
            {entry.text}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

export default function Sidebar({
  agents,
  open,
  selectedAgentId,
  onSelectAgent,
  onEditAgent,
  onConfigureChain,
  onToggleRerun,
  activeWorkspaceId,
  runStatus,
  runLog,
}) {
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  // For Output nodes: find which workspaces use this output as a chain source
  const chainConsumers = selectedAgent?.nodeType === 'output'
    ? loadWorkspaceIndex().filter((ws) => {
        if (ws.id === activeWorkspaceId) return false;
        const saved = loadWorkspace(ws.id);
        return saved?.agents?.some((a) => a.nodeType === 'chain' && a.sourceWorkspaceId === activeWorkspaceId);
      })
    : [];

  // For Chain nodes: load the linked workspace for preview
  const linkedWorkspace = selectedAgent?.nodeType === 'chain' && selectedAgent?.sourceWorkspaceId
    ? loadWorkspace(selectedAgent.sourceWorkspaceId)
    : null;

  return (
    <aside className={`sidebar ${open ? 'is-open' : 'is-closed'}`}>
      <div className="sidebar-inner">
        {selectedAgent?.nodeType === 'output' ? (
          <OutputDetail
            agent={selectedAgent}
            onBack={() => onSelectAgent(null)}
            chainConsumers={chainConsumers}
          />
        ) : selectedAgent?.nodeType === 'chain' ? (
          <ChainDetail
            agent={selectedAgent}
            onBack={() => onSelectAgent(null)}
            onConfigure={onConfigureChain}
            onToggleRerun={onToggleRerun}
            linkedWorkspace={linkedWorkspace}
          />
        ) : selectedAgent ? (
          <AgentDetail agent={selectedAgent} onBack={() => onSelectAgent(null)} onEdit={onEditAgent} />
        ) : (
          <>
            <div className="sidebar-header">
              <span className="sidebar-title">Agent status</span>
              <span className="sidebar-count">{agents.length} agents</span>
            </div>

            <RunLog runLog={runLog} runStatus={runStatus} />

            <div className="sidebar-columns">
              {COLUMNS.map((col) => {
                const colAgents = agents.filter((a) => a.status === col.key);
                return (
                  <div className="kanban-column" key={col.key}>
                    <div className="kanban-column-header">
                      <span className={`status-dot status-dot-${col.key}`} aria-hidden="true" />
                      <span className="kanban-column-label">{col.label}</span>
                      <span className="kanban-column-count">{colAgents.length}</span>
                    </div>

                    <div className="kanban-column-body">
                      {colAgents.length === 0 && (
                        <div className="kanban-empty">No agents</div>
                      )}
                      {colAgents.map((agent) => (
                        <div
                          key={agent.id}
                          className={`kanban-card ${agent.id === selectedAgentId ? 'is-selected' : ''}`}
                          onClick={() => onSelectAgent(agent.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') onSelectAgent(agent.id);
                          }}
                        >
                          <div className="kanban-card-top">
                            <span className="kanban-card-name">{agent.name}</span>
                            {agent.isManager && <span className="kanban-card-tag">Overseer</span>}
                            <button
                              className="kanban-card-edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditAgent?.(agent.id);
                              }}
                              aria-label={`Edit ${agent.name}`}
                              title="Edit agent"
                            >
                              Edit
                            </button>
                          </div>
                          <div className="kanban-card-role">{agent.role}</div>
                          {agent.maxIterations > 1 && (
                            <div className="kanban-card-iter">
                              {attemptCount(agent)}/{agent.maxIterations} attempts
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
