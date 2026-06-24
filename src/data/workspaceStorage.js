// Workspace persistence — all workspace data lives in the user's own
// browser localStorage, never sent to or held by any server. Same
// reasoning as apiKeyStorage.js: we're never the holder of user data.
//
// Storage layout:
//   parlance.workspaces          → [{id, name, updatedAt}, ...]  (index)
//   parlance.workspace.{id}      → full workflow snapshot
//   parlance.activeWorkspaceId   → string id of the open workspace

const KEYS = {
  index: 'parlance.workspaces',
  active: 'parlance.activeWorkspaceId',
  workspace: (id) => `parlance.workspace.${id}`,
};

function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function generateId() {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Returns the ordered workspace index (lightweight metadata only). */
export function loadWorkspaceIndex() {
  return read(KEYS.index, []);
}

/** Returns the full snapshot for one workspace, or null if not found. */
export function loadWorkspace(id) {
  return read(KEYS.workspace(id), null);
}

/** Returns the currently active workspace id, or null. */
export function loadActiveWorkspaceId() {
  return read(KEYS.active, null);
}

/**
 * Strips transient runtime state from agents before persisting.
 * runs, status, chainLog are rebuilt at run time — saving them
 * wastes localStorage space and causes unnecessary autosave writes
 * during active runs. capturedOutput/capturedFiles ARE persisted
 * (Output nodes need them for chain caching across reloads).
 */
function stripRuntimeState(agents) {
  return agents.map((a) => {
    const { runs, status, chainLog, ...config } = a;  // eslint-disable-line no-unused-vars
    return { ...config, status: 'pending', runs: [], chainLog: [] };
  });
}

/**
 * Saves the full workflow state for a workspace and updates its metadata
 * in the index. Creates the workspace if it doesn't exist yet.
 * Returns the workspace id.
 */
export function saveWorkspace(id, snapshot) {
  const now = new Date().toISOString();
  const index = loadWorkspaceIndex();
  const existing = index.findIndex((w) => w.id === id);

  const meta = { id, name: snapshot.name || 'Untitled workflow', updatedAt: now };

  if (existing >= 0) {
    index[existing] = meta;
  } else {
    index.push(meta);
  }

  // Strip runtime state before writing — agents only save their config,
  // not their run history or live execution state.
  const clean = {
    ...snapshot,
    agents: stripRuntimeState(snapshot.agents ?? []),
    savedAt: now,
  };

  write(KEYS.index, index);
  write(KEYS.workspace(id), clean);
  return id;
}

/**
 * Creates a brand new empty workspace, saves it, sets it as active,
 * and returns its id.
 */
export function createWorkspace(name = 'Untitled workflow') {
  const id = generateId();
  const snapshot = {
    name,
    conditions: '',
    fileContextMode: 'truncated',
    agents: [],
    edges: [],
  };
  saveWorkspace(id, snapshot);
  setActiveWorkspaceId(id);
  return id;
}

/**
 * Deletes a workspace. If it was the active one, does NOT automatically
 * switch — caller is responsible for switching to another workspace first.
 */
export function deleteWorkspace(id) {
  try {
    const index = loadWorkspaceIndex().filter((w) => w.id !== id);
    write(KEYS.index, index);
    localStorage.removeItem(KEYS.workspace(id));
    return true;
  } catch {
    return false;
  }
}

export function setActiveWorkspaceId(id) {
  write(KEYS.active, id);
}

/**
 * Debounced auto-save. Returns a function that, when called with a
 * workspace id and snapshot, saves after a short delay — rapid successive
 * calls (e.g. dragging a node) collapse into one write.
 */
export function createAutoSave(delayMs = 800) {
  let timer = null;
  return function autoSave(id, snapshot) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveWorkspace(id, snapshot);
      timer = null;
    }, delayMs);
  };
}
