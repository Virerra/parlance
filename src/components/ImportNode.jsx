import { Handle, Position } from 'reactflow';
import './SpecialNode.css';

export default function ImportNode({ data }) {
  const { agent, selected, onUpload } = data;
  const files = agent.importedFiles ?? (agent.importedFileName ? [{ name: agent.importedFileName }] : []);
  const hasFiles = files.length > 0;

  return (
    <div className={`special-node import-node ${selected ? 'is-selected' : ''} ${hasFiles ? 'has-content' : ''}`}>
      <div className="special-node-type-label">File Import</div>

      <div className="special-node-name">{agent.name}</div>

      {hasFiles ? (
        <>
          <div className="special-node-files-list">
            {files.slice(0, 3).map((f, i) => (
              <div className="special-node-file-item" key={i}>
                <span className="special-node-file-icon">📄</span>
                <span className="special-node-filename">{f.name}</span>
              </div>
            ))}
            {files.length > 3 && (
              <div className="special-node-file-item">
                <span className="special-node-file-icon">+</span>
                <span className="special-node-filename">{files.length - 3} more</span>
              </div>
            )}
          </div>
          <button
            className="special-node-upload-btn"
            style={{ marginTop: 6 }}
            onClick={() => onUpload?.(agent.id)}
          >
            + Add more files
          </button>
        </>
      ) : (
        <button
          className="special-node-upload-btn"
          onClick={() => onUpload?.(agent.id)}
        >
          Click to upload files
        </button>
      )}

      <Handle type="source" position={Position.Right} className="agent-handle" />
    </div>
  );
}
