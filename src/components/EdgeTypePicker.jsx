import { useEffect, useRef } from 'react';
import './EdgeTypePicker.css';

export default function EdgeTypePicker({ x, y, onChoose, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="edge-type-picker"
      style={{ left: x, top: y }}
      role="menu"
    >
      <div className="edge-type-picker-label">Connect as</div>
      <button className="edge-type-option" role="menuitem" onClick={() => onChoose('flow')}>
        <span className="edge-type-swatch edge-type-swatch-flow" aria-hidden="true" />
        <span>
          <span className="edge-type-option-title">Flow</span>
          <span className="edge-type-option-hint">Forward progress, output feeds in</span>
        </span>
      </button>
      <button className="edge-type-option" role="menuitem" onClick={() => onChoose('feedback')}>
        <span className="edge-type-swatch edge-type-swatch-feedback" aria-hidden="true" />
        <span>
          <span className="edge-type-option-title">Feedback</span>
          <span className="edge-type-option-hint">Retry loop back to a prior agent</span>
        </span>
      </button>
    </div>
  );
}
