// Core data model for Parlance workflows.
// This is the schema everything else (canvas, layout, API calls, retry logic)
// reads from and writes to. Kept framework-agnostic — no React imports here.

/**
 * @typedef {'pending' | 'running' | 'completed' | 'failed'} AgentStatus
 */

/**
 * @typedef {'flow' | 'feedback'} EdgeKind
 * 'flow'     - forward progress, A's output becomes B's input
 * 'feedback' - a retry/loop-back edge, e.g. Debugger -> Builder
 */

/**
 * Node type discriminator. All nodes share the Agent shape for
 * compatibility with the canvas and reducer, but nodeType controls
 * how the engine and UI treat them:
 *   'agent'   - a Claude-powered worker or the Overseer
 *   'import'  - a static file source node (user uploads a file)
 *   'output'  - a result collector node at the end of a chain
 *   'chain'   - pulls approved output from another workspace
 * @typedef {'agent' | 'import' | 'output' | 'chain'} NodeType
 */

/**
 * A single run of an agent (one attempt). Agents can have multiple runs
 * if they're retried.
 * @typedef {Object} AgentRun
 * @property {string} id
 * @property {number} attempt        - 1-indexed attempt number
 * @property {string} input          - prompt/context received, composed from upstream outputs
 * @property {string} output         - the agent's response text (empty until completed)
 * @property {string} reasoning      - optional visible reasoning/notes, separate from final output
 * @property {AgentStatus} status
 * @property {string|null} error     - error message if failed
 * @property {string|null} startedAt - ISO timestamp
 * @property {string|null} endedAt   - ISO timestamp
 * @property {AgentFile[]} files     - files written during this run, if the agent has file tools enabled
 */

/**
 * A file artifact produced by an agent run.
 * @typedef {Object} AgentFile
 * @property {string} path     - relative path/filename as written by the agent
 * @property {string} content  - full text content of the file
 * @property {string} language - best-guess language/extension for syntax display
 */

/**
 * @typedef {Object} Agent
 * @property {string} id
 * @property {string} name
 * @property {string} role           - short description shown on the node
 * @property {string} task           - the actual instruction sent to Claude as the system/task prompt
 * @property {AgentStatus} status    - current status of the latest run
 * @property {{x: number, y: number}} position
 * @property {number} maxIterations  - configurable retry cap for this agent
 * @property {AgentRun[]} runs       - history of attempts, most recent last
 * @property {boolean} isManager     - true for the overseer/manager agent
 * @property {string} model          - Claude model string used for this agent's calls
 * @property {boolean} canUseFiles   - whether this agent gets file/code tools (write, edit, run) vs text-only completion
 */

/**
 * @typedef {Object} WorkflowEdge
 * @property {string} id
 * @property {string} source
 * @property {string} target
 * @property {EdgeKind} kind
 */

/**
 * @typedef {Object} Workflow
 * @property {string} id
 * @property {string} name
 * @property {string} conditions     - the user-set conditions the Overseer checks final output against
 * @property {Agent[]} agents
 * @property {WorkflowEdge[]} edges
 * @property {'off' | 'truncated' | 'full'} fileContextMode - whether downstream agents see upstream
 *   file *contents* (not just text output) in their composed input. 'off' (default) matches original
 *   behavior — text only, cheapest. 'truncated' includes file content capped per file to control cost
 *   on every downstream call. 'full' always includes complete content, highest fidelity and highest cost.
 *   This is a real cost/quality tradeoff with no universally-correct default, so it's a workflow-level
 *   setting the person chooses, not a hardcoded constant.
 */

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

/** Creates a new agent with sensible defaults. */
export function createAgent({
  name = 'New agent',
  role = '',
  task = '',
  position = { x: 0, y: 0 },
  maxIterations = 3,
  isManager = false,
  model = 'claude-sonnet-4-6',
  canUseFiles = false,
  systemPrompt = '',
} = {}) {
  return {
    nodeType: 'agent',
    id: nextId('agent'),
    name,
    role,
    task,
    status: 'pending',
    position,
    maxIterations,
    runs: [],
    isManager,
    model,
    canUseFiles,
    systemPrompt,
  };
}

/**
 * Creates a File Import node — a static source node that injects a
 * user-uploaded file as input to connected agents. No model, no task,
 * no runs — it's a data source, not a Claude agent.
 */
export function createImportNode({ position = { x: 0, y: 0 } } = {}) {
  return {
    nodeType: 'import',
    id: nextId('agent'),
    name: 'File Import',
    role: 'Provides a file as input',
    status: 'pending',
    position,
    runs: [],
    // File data set by the user after creation
    importedFileName: null,   // comma-joined filenames for display
    importedFiles: [],         // array of { name, content } for batch uploads
    importedFileContent: null, // composed content string injected into downstream prompts
    // Unused agent fields — kept for shape compatibility with canvas/reducer
    task: '',
    maxIterations: 1,
    isManager: false,
    model: null,
    canUseFiles: false,
    systemPrompt: '',
  };
}

/**
 * Creates an Output node — a result collector that captures the output
 * of whichever agent feeds into it. Triggers the Results panel without
 * requiring an Overseer. Multiple output nodes can exist in one workflow.
 */
export function createOutputNode({ position = { x: 0, y: 0 }, name = 'Output' } = {}) {
  return {
    nodeType: 'output',
    id: nextId('agent'),
    name,
    role: 'Collects and chains workflow output',
    status: 'pending',
    position,
    runs: [],
    capturedOutput: null,   // text output captured from upstream agent
    capturedFiles: [],       // files captured from upstream agent
    savedAt: null,           // ISO timestamp of last capture — shown in Chain Input picker
    task: '',
    maxIterations: 1,
    isManager: false,
    model: null,
    canUseFiles: false,
    systemPrompt: '',
  };
}

/**
 * Creates a Workspace Chain node — pulls the approved output from
 * another saved workspace and injects it as input to connected agents.
 * Like an Import node but dynamic (reads from localStorage at run time).
 */
export function createChainNode({ position = { x: 0, y: 0 } } = {}) {
  return {
    nodeType: 'chain',
    id: nextId('agent'),
    name: 'Chain Input',
    role: 'Imports from another workflow',
    status: 'pending',
    position,
    runs: [],
    sourceWorkspaceId: null,    // the workspace to read/run
    sourceWorkspaceName: null,  // display name, cached at config time
    importedFileContent: null,  // content loaded from the linked workflow's Output node
    rerunLinked: false,         // toggle: true = always re-run linked workflow, false = use cache
    chainLog: [],               // [{text, kind}] mini log shown while linked workflow runs
    task: '',
    maxIterations: 1,
    isManager: false,
    model: null,
    canUseFiles: false,
    systemPrompt: '',
  };
}

/** Creates a new edge between two agents. */
export function createEdge({ source, target, kind = 'flow' }) {
  if (!source || !target) {
    throw new Error('createEdge requires both source and target agent ids');
  }
  if (source === target) {
    throw new Error('createEdge cannot connect an agent to itself');
  }
  return {
    id: nextId('edge'),
    source,
    target,
    kind,
  };
}

/** Creates a new empty workflow. */
export function createWorkflow({ name = 'Untitled workflow', conditions = '', fileContextMode = 'truncated' } = {}) {
  return {
    id: nextId('workflow'),
    name,
    conditions,
    agents: [],
    edges: [],
    fileContextMode,
  };
}

/** Returns the most recent run for an agent, or null if it hasn't run yet. */
export function latestRun(agent) {
  if (!agent.runs.length) return null;
  return agent.runs[agent.runs.length - 1];
}

/** Returns the current attempt count (number of runs so far). */
export function attemptCount(agent) {
  return agent.runs.length;
}

/** Whether an agent has exhausted its configured retry cap. */
export function hasExhaustedRetries(agent) {
  return attemptCount(agent) >= agent.maxIterations;
}

/** Returns all agents that feed directly into the given agent (upstream). */
export function upstreamAgents(workflow, agentId) {
  const upstreamIds = workflow.edges
    .filter((e) => e.target === agentId && e.kind === 'flow')
    .map((e) => e.source);
  return workflow.agents.filter((a) => upstreamIds.includes(a.id));
}

/**
 * Returns agents the given agent has explicit feedback edges pointing to.
 * These are the user-defined retry targets — "when I fail or get rejected,
 * route back here" — and take priority over auto-detected flow-upstream
 * in both the worker escalation logic and the Overseer rejection loop.
 */
export function feedbackTargets(workflow, agentId) {
  const feedbackIds = workflow.edges
    .filter((e) => e.source === agentId && e.kind === 'feedback')
    .map((e) => e.target);
  return workflow.agents.filter((a) => feedbackIds.includes(a.id));
}

/** Returns all agents the given agent feeds into (downstream). */
export function downstreamAgents(workflow, agentId) {
  const downstreamIds = workflow.edges
    .filter((e) => e.source === agentId && e.kind === 'flow')
    .map((e) => e.target);
  return workflow.agents.filter((a) => downstreamIds.includes(a.id));
}

/** Returns the single manager/overseer agent, if one exists. */
export function getManagerAgent(workflow) {
  return workflow.agents.find((a) => a.isManager) ?? null;
}

/** Validates that a workflow has at most one manager agent. */
export function validateSingleManager(workflow) {
  const managers = workflow.agents.filter((a) => a.isManager);
  return managers.length <= 1;
}

/**
 * Collects every file from every agent's most recent run, grouped by
 * agent. Used by the Results panel after an approved run — deliberately
 * includes everything rather than guessing which files are "real" output
 * vs. scratch work; the person picks what they actually want, since
 * that's a situational judgment the app can't make reliably on its own.
 * Returns [] entries omitted (agents with no files don't appear).
 * @returns {Array<{agentId: string, agentName: string, files: AgentFile[]}>}
 */
export function collectAllFiles(workflow) {
  return workflow.agents
    .map((agent) => {
      const run = latestRun(agent);
      const files = run?.files ?? [];
      return { agentId: agent.id, agentName: agent.name, files };
    })
    .filter((group) => group.files.length > 0);
}
