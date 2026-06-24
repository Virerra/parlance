import { useState, useEffect, useRef } from 'react';
import { loadWorkspaceIndex } from '../data/workspaceStorage';
import './WorkspaceSwitcher.css';

export default function WorkspaceSwitcher({
  activeWorkspaceId,
  workspaceName,
  onSwitch,
  onNew,
  onRename,
  onDelete,
  isRunning,
}) {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const dropdownRef = useRef(null);
  const nameInputRef = useRef(null);

  function handleToggle() {
    if (isRunning) return;
    if (!open) setWorkspaces(loadWorkspaceIndex());
    setOpen((o) => !o);
    setConfirmDeleteId(null);
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (!dropdownRef.current?.contains(e.target)) {
        setOpen(false);
        setConfirmDeleteId(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  function startRename() {
    setDraft(workspaceName);
    setEditingName(true);
    setOpen(false);
  }

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== workspaceName) onRename(trimmed);
    setEditingName(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setEditingName(false);
  }

  function handleSwitch(id) {
    setOpen(false);
    setConfirmDeleteId(null);
    if (id !== activeWorkspaceId) onSwitch(id);
  }

  function handleNew() {
    setOpen(false);
    onNew();
  }

  function handleDeleteClick(e, id) {
    e.stopPropagation();
    setConfirmDeleteId(id);
  }

  function handleDeleteConfirm(e, id) {
    e.stopPropagation();
    setConfirmDeleteId(null);
    setWorkspaces((ws) => ws.filter((w) => w.id !== id));
    onDelete?.(id);
    setOpen(workspaces.length > 1);
  }

  function handleDeleteCancel(e) {
    e.stopPropagation();
    setConfirmDeleteId(null);
  }

  return (
    <div className="workspace-switcher" ref={dropdownRef}>
      {editingName ? (
        <input
          ref={nameInputRef}
          className="workspace-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          maxLength={60}
          aria-label="Workspace name"
        />
      ) : (
        <button
          className="workspace-trigger"
          onClick={handleToggle}
          onDoubleClick={startRename}
          title="Click to switch workspace · Double-click to rename"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="workspace-name">{workspaceName}</span>
          <span className="workspace-chevron" aria-hidden="true">
            {open ? '▲' : '▼'}
          </span>
        </button>
      )}

      {open && (
        <div className="workspace-dropdown" role="listbox">
          <div className="workspace-dropdown-section-label">Workspaces</div>
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className={`workspace-item-row ${ws.id === activeWorkspaceId ? 'is-active' : ''}`}
            >
              {confirmDeleteId === ws.id ? (
                <div className="workspace-delete-confirm">
                  <span className="workspace-delete-confirm-text">Delete "{ws.name}"?</span>
                  <button className="workspace-delete-yes" onClick={(e) => handleDeleteConfirm(e, ws.id)}>Delete</button>
                  <button className="workspace-delete-no" onClick={handleDeleteCancel}>Cancel</button>
                </div>
              ) : (
                <>
                  <button
                    className="workspace-item-btn"
                    onClick={() => handleSwitch(ws.id)}
                    role="option"
                    aria-selected={ws.id === activeWorkspaceId}
                  >
                    <span className="workspace-item-name">{ws.name}</span>
                    {ws.id === activeWorkspaceId && (
                      <span className="workspace-item-active-dot" aria-hidden="true" />
                    )}
                  </button>
                  {workspaces.length > 1 && (
                    <button
                      className="workspace-delete-btn"
                      onClick={(e) => handleDeleteClick(e, ws.id)}
                      title={`Delete "${ws.name}"`}
                      aria-label={`Delete "${ws.name}"`}
                    >
                      ×
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <div className="workspace-dropdown-divider" />
          <button className="workspace-item workspace-item-new" onClick={handleNew}>
            + New workspace
          </button>
        </div>
      )}
    </div>
  );
}
