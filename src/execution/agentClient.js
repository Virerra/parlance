// The execution engine talks to agent-calling "clients" through this one
// shape. A mock client and a real Claude API client both implement the
// same function signature, so the orchestrator never needs to know or
// care which one it's running against.

/**
 * @typedef {Object} AgentCallResult
 * @property {boolean} success
 * @property {string} output      - the agent's response text (empty on failure)
 * @property {string} reasoning   - optional visible reasoning, separate from output
 * @property {string|null} error  - human-readable error message if success is false
 * @property {import('../data/workflowModel').AgentFile[]} [files] - files produced, only present for canUseFiles agents
 */

/**
 * @callback AgentClient
 * @param {Object} params
 * @param {import('../data/workflowModel').Agent} params.agent - the agent being run
 * @param {string} params.input - composed prompt/context for this run
 * @param {AbortSignal} [params.signal] - allows the orchestrator to cancel an in-flight call
 * @returns {Promise<AgentCallResult>}
 */

// No runtime code here — this file exists to document and centralize the
// contract. Implementations live in mockClient.js and claudeClient.js.
export {};
