import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import './ContextMenu.css';

/**
 * items: Array<
 *   { label: string, onSelect: () => void, danger?: boolean, accent?: boolean,
 *     disabled?: boolean, hint?: string, icon?: string } |
 *   'divider' |
 *   { type: 'label', text: string }
 * >
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [clampedPos, setClampedPos] = useState({ x, y, visible: false });

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !parent) {
      setClampedPos({ x, y, visible: true });
      return;
    }
    const menuRect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const maxX = parentRect.width - menuRect.width - 8;
    const maxY = parentRect.height - menuRect.height - 8;
    setClampedPos({
      x: Math.min(Math.max(x, 8), Math.max(maxX, 8)),
      y: Math.min(Math.max(y, 8), Math.max(maxY, 8)),
      visible: true,
    });
  }, [x, y]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    const id = setTimeout(() => {
      window.addEventListener('mousedown', onClickOutside);
      window.addEventListener('contextmenu', onClickOutside);
    }, 0);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('contextmenu', onClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: clampedPos.x, top: clampedPos.y, opacity: clampedPos.visible ? 1 : 0 }}
      role="menu"
    >
      {items.map((item, i) => {
        if (item === 'divider') {
          return <div key={`divider-${i}`} className="context-menu-divider" />;
        }
        if (item?.type === 'label') {
          return <div key={`label-${i}`} className="context-menu-label">{item.text}</div>;
        }
        const cls = [
          'context-menu-item',
          item.danger ? 'is-danger' : '',
          item.accent ? 'is-accent' : '',
          item.disabled ? 'is-disabled' : '',
        ].filter(Boolean).join(' ');
        return (
          <button
            key={item.label}
            className={cls}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            {item.icon && (
              <span className="context-menu-item-icon">
                {typeof item.icon === 'string' ? item.icon : item.icon}
              </span>
            )}
            <span className="context-menu-item-label">{item.label}</span>
            {item.hint && <span className="context-menu-item-hint">{item.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
