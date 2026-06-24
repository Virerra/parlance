// Mock implementation of the AgentClient contract. Simulates latency and
// occasional failures so the orchestrator's retry/halt logic actually gets
// exercised during testing, not just the happy path.

const MOCK_LATENCY_MS = [400, 1100]; // randomized range, feels like a real call without being slow to test
const DEFAULT_FAILURE_RATE = 0; // overridden per-call by config below

function randomLatency() {
  const [min, max] = MOCK_LATENCY_MS;
  return min + Math.random() * (max - min);
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/**
 * Produces plausible-looking mock output for an agent based on its role/task,
 * so a person watching a mock run can sanity-check that data is actually
 * flowing between agents (not just that the UI updates).
 */
function generateMockOutput(agent, input, attempt) {
  const taskSnippet = agent.task ? agent.task.slice(0, 80) : 'the assigned task';
  const inputSnippet = input ? input.slice(0, 60).replace(/\s+/g, ' ').trim() : '(no upstream input)';

  if (agent.isManager) {
    // Overseer-style agents produce an approve/reject style response so the
    // downstream "does the run pass conditions" logic has something real
    // to branch on, even in mock mode. Mirrors the DECISION: marker the
    // real client's system prompt requires (see claudeClient.js) so mock
    // runs exercise the same parsing logic as real ones, rather than
    // always reading as rejected because the marker's missing.
    const approved = attempt >= 1 && Math.random() > 0.35;
    // For mock rejections we don't know the actual agent names so we
    // omit TARGET — the engine falls back to lastWorker gracefully.
    return approved
      ? `Reviewed the output against the stated conditions. Requirements appear satisfied. Approving.\n\nDECISION: APPROVED`
      : `Reviewed the output against the stated conditions. Found gaps: the result does not fully address "${taskSnippet}". Requesting another pass.\n\nDECISION: REJECTED`;
  }

  return `[Mock attempt ${attempt}] Completed: ${taskSnippet}. Based on input: "${inputSnippet}${input && input.length > 60 ? '…' : ''}"`;
}

/**
 * Creates a mock AgentClient with a configurable failure rate. Useful for
 * deliberately exercising the retry/escalation logic during testing —
 * e.g. mockAgentClient({ failureRate: 0.4 }) to see backtracking in
 * action, or the default (0) for a clean happy-path run.
 *
 * @param {{ failureRate?: number }} [config]
 * @returns {import('./agentClient').AgentClient}
 */
export function createMockClient({ failureRate = DEFAULT_FAILURE_RATE } = {}) {
  return async function mockAgentClient({ agent, input, signal, attempt = 1 }) {
    await wait(randomLatency(), signal);

    if (signal?.aborted) {
      return { success: false, output: '', reasoning: '', error: 'Cancelled' };
    }

    const shouldFail = Math.random() < failureRate;
    if (shouldFail) {
      const reasons = [
        'Output did not match the expected format.',
        'Upstream input was insufficient to complete the task.',
        'Simulated transient error.',
      ];
      const error = reasons[Math.floor(Math.random() * reasons.length)];
      return { success: false, output: '', reasoning: '', error };
    }

    const output = generateMockOutput(agent, input, attempt);
    return { success: true, output, reasoning: '', error: null };
  };
}
