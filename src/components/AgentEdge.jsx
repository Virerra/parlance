import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from 'reactflow';
import './AgentEdge.css';

export default function AgentEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  selected,
  data,
}) {
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showDelete = selected || hovered;

  return (
    <>
      {/* BaseEdge renders the visible stroke plus its own wider, invisible
          interaction path (react-flow__edge-interaction) that React Flow's
          pointer-event system already uses for click/selection. We attach
          our hover tracking to that same group rather than adding a second,
          competing hit-target. */}
      <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} interactionWidth={24} />
      </g>
      {label && (
        <EdgeLabelRenderer>
          <div
            className="agent-edge-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 14}px)`,
              color: labelStyle?.fill,
              background: labelBgStyle?.fill,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
      {showDelete && (
        <EdgeLabelRenderer>
          <button
            className={`agent-edge-delete ${selected ? 'is-selected' : ''}`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + (label ? 16 : 0)}px)`,
              pointerEvents: 'all',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
              e.stopPropagation();
              data?.onDelete?.(id);
            }}
            aria-label="Delete connection"
            title="Delete connection"
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
