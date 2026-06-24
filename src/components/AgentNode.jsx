import { Handle, Position } from 'reactflow';
import { attemptCount } from '../data/workflowModel';
import './AgentNode.css';

const STATUS_LABEL = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export default function AgentNode({ data }) {
  const { agent, selected } = data;
  const { name, role, status, maxIterations, isManager, canUseFiles } = agent;
  const attempts = attemptCount(agent);

  return (
    <div className={`agent-node status-${status} ${selected ? 'is-selected' : ''} ${isManager ? 'is-manager' : ''}`}>
      <Handle type="target" position={Position.Left} className="agent-handle" />

      <div className="agent-node-header">
        <span className={`status-dot status-dot-${status}`} aria-hidden="true" />
        <span className="agent-status-label">{STATUS_LABEL[status]}</span>
        {isManager && <span className="agent-manager-tag">Overseer</span>}
        {canUseFiles && !isManager && (
          <span className="agent-files-tag" title="Has file & code tools">
            Files
          </span>
        )}
      </div>

      <div className="agent-node-name">{name}</div>
      <div className="agent-node-role">{role}</div>

      {maxIterations > 1 && (
        <div className="agent-node-footer">
          <span className="agent-iter">
            {attempts}/{maxIterations} attempts
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="agent-handle" />
    </div>
  );
}
