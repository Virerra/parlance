// The orchestration engine. Pure logic, no React — takes a workflow and an
// AgentClient, returns events as it runs so the UI layer can react without
// the engine knowing anything about React state.
//
// Retry/backtrack model (confirmed spec):
//   1. Self-retry   — a failing agent retries itself up to its own
//                      maxIterations.
//   2. Upstream      — once self-retries are exhausted, back up one step:
//      escalation      re-run whichever upstream agent most recently fed
//                      it input, then retry the failing agent fresh
//                      (its own counter resets, since the input actually
//                      changed). This consumes the upstream agent's own
//                      maxIterations.
//   3. Overseer      — if upstream escalation also can't resolve it
//      escalation      (upstream has no more retries, or there's no
//                      upstream to escalate to), the Overseer is invoked
//                      specifically to investigate and decide whether to
//                      push further back or accept/halt.
//   4. Halt          — if nothing resolves it, the run halts and the
//                      error is surfaced.
//
// Caps: every agent has its own maxIterations. A global workflow cap acts
// as the *default* ceiling but never lowers an agent's explicit, higher
// cap — per-agent maxIterations always wins when set above the global.

import {
  upstreamAgents,
  downstreamAgents,
  getManagerAgent,
  attemptCount,
  feedbackTargets,
} from '../data/workflowModel';

export const DEFAULT_GLOBAL_RETRY_CAP = 5;

/**
 * Effective cap for an agent. An agent's own maxIterations is always its
 * real limit — the global cap never inflates it. The global cap only
 * matters as a *default* when an agent hasn't been given an explicit
 * higher value; per the confirmed spec, a per-agent cap set ABOVE the
 * global wins for that agent, but the global never overrides a lower,
 * deliberately-set per-agent cap.
 */
function effectiveCap(agent, globalCap) {
  return agent.maxIterations ?? globalCap ?? DEFAULT_GLOBAL_RETRY_CAP;
}

/**
 * Topologically sorts agents using only `flow` edges (feedback edges are
 * loops by design and excluded, same reasoning as auto-layout). Throws if
 * a cycle is found in the flow-only graph, which would indicate malformed
 * workflow data rather than a legitimate retry loop.
 *
 * Only agents that are part of a connected flow subgraph are included —
 * isolated nodes (no flow edges at all) are excluded rather than run as
 * phantom root nodes, which would produce confusing results (all isolated
 * nodes would run as if they were the start of the workflow).
 */
export function topologicalOrder(agents, edges) {
  const flowEdges = edges.filter((e) => e.kind === 'flow');

  // Agents with at least one flow edge (incoming or outgoing) are
  // considered part of the connected workflow. Isolated agents are
  // excluded entirely — they won't run as part of this workflow.
  // Import, Output, and Chain nodes are always excluded from the
  // Claude execution queue (they don't make API calls) but are
  // included in the topology so composeInput can read their content.
  const connectedIds = new Set();
  flowEdges.forEach((e) => {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  });

  const connectedAgents = connectedIds.size > 0
    ? agents.filter((a) => connectedIds.has(a.id))
    : agents;

  const inDegree = new Map(connectedAgents.map((a) => [a.id, 0]));
  const adjacency = new Map(connectedAgents.map((a) => [a.id, []]));

  flowEdges.forEach((e) => {
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) return;
    inDegree.set(e.target, inDegree.get(e.target) + 1);
    adjacency.get(e.source).push(e.target);
  });

  const queue = connectedAgents.filter((a) => inDegree.get(a.id) === 0).map((a) => a.id);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    adjacency.get(id).forEach((neighborId) => {
      inDegree.set(neighborId, inDegree.get(neighborId) - 1);
      if (inDegree.get(neighborId) === 0) queue.push(neighborId);
    });
  }

  if (order.length !== connectedAgents.length) {
    throw new Error(
      'Workflow has a cycle in its flow edges (excluding feedback/retry edges). Check agent connections.'
    );
  }

  return order.map((id) => agents.find((a) => a.id === id));
}

/**
 * Returns the same nodes as topologicalOrder but grouped into "waves" —
 * each wave is an array of agents that can run in parallel because all
 * their dependencies belong to earlier waves. Within a wave, order is
 * arbitrary (no dependency between members). Between waves, order is
 * strict (wave N must fully complete before wave N+1 starts).
 *
 * Example:  A → C → D
 *           B ↗
 * Waves: [[A, B], [C], [D]]  — A and B run simultaneously, then C, then D.
 */
export function topologicalWaves(agents, edges) {
  const flowEdges = edges.filter((e) => e.kind === 'flow');

  const connectedIds = new Set();
  flowEdges.forEach((e) => {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  });

  const connectedAgents = connectedIds.size > 0
    ? agents.filter((a) => connectedIds.has(a.id))
    : agents;

  const inDegree = new Map(connectedAgents.map((a) => [a.id, 0]));
  const adjacency = new Map(connectedAgents.map((a) => [a.id, []]));

  flowEdges.forEach((e) => {
    if (!inDegree.has(e.source) || !inDegree.has(e.target)) return;
    inDegree.set(e.target, inDegree.get(e.target) + 1);
    adjacency.get(e.source).push(e.target);
  });

  const waves = [];
  let frontier = connectedAgents.filter((a) => inDegree.get(a.id) === 0);

  while (frontier.length > 0) {
    waves.push(frontier.map((a) => a.id));
    const next = [];
    frontier.forEach((a) => {
      adjacency.get(a.id).forEach((neighborId) => {
        inDegree.set(neighborId, inDegree.get(neighborId) - 1);
        if (inDegree.get(neighborId) === 0) {
          next.push(agents.find((ag) => ag.id === neighborId));
        }
      });
    });
    frontier = next;
  }

  const totalInWaves = waves.reduce((sum, w) => sum + w.length, 0);
  if (totalInWaves !== connectedAgents.length) {
    throw new Error(
      'Workflow has a cycle in its flow edges (excluding feedback/retry edges). Check agent connections.'
    );
  }

  // Return waves as arrays of full agent objects (consistent with topologicalOrder)
  return waves.map((ids) => ids.map((id) => agents.find((a) => a.id === id)));
}

const TRUNCATE_CHARS_PER_FILE = 2000;

/**
 * Formats a single upstream agent's files for inclusion in a downstream
 * prompt, respecting the workflow's fileContextMode. Returns '' if there
 * are no files or mode is 'off' — composeInput skips empty sections.
 */
function formatUpstreamFiles(files, mode) {
  if (mode === 'off' || !files || files.length === 0) return '';

  return files
    .map((f) => {
      let content = f.content ?? '';
      let note = '';
      if (mode === 'truncated' && content.length > TRUNCATE_CHARS_PER_FILE) {
        const remaining = content.length - TRUNCATE_CHARS_PER_FILE;
        content = content.slice(0, TRUNCATE_CHARS_PER_FILE);
        note = `\n[...truncated, ${remaining} more characters]`;
      }
      return `\`\`\`${f.language ?? ''} ${f.path}\n${content}${note}\n\`\`\``;
    })
    .join('\n\n');
}

/**
 * Composes the input prompt for an agent from its upstream outputs plus
 * its own task description. If there are no upstream agents, the task
 * alone is the input (this is a root/starting agent).
 *
 * When the workflow's fileContextMode isn't 'off', upstream agents' file
 * contents (not just their text output) are included too — this is what
 * lets a downstream agent (Debugger, Overseer, anything) actually verify
 * what was built instead of trusting an upstream agent's prose description
 * of it. Files are wrapped in fenced code blocks with filename headers so
 * the model can clearly distinguish real file content from narrative text.
 *
 * @param {string} [overseerFeedback] - When the Overseer has rejected output
 *   and the engine is re-running this agent, pass the Overseer's rejection
 *   text here so it's included explicitly in the prompt. There is no flow
 *   edge from Overseer back to workers (Overseer sits at the end of the
 *   graph), so composeInput can't pick this up automatically — it must be
 *   passed directly by the rejection loop in runEngine.js.
 */
export function composeInput(agent, workflow, overseerFeedback) {
  const mode = workflow.fileContextMode ?? 'truncated';

  // The Overseer needs to see every agent's contribution with clear
  // attribution so it can accurately identify TARGET when rejecting.
  // Regular agents only see their direct upstream — flooding them with
  // the full chain would add noise and cost without benefit.
  let upstreamSections;
  if (agent.isManager) {
    // Collect all non-manager nodes in topological order so the Overseer
    // sees the complete picture with full attribution. Special nodes
    // (import, chain) are included even though they have no runs — they're
    // data sources whose content should be visible to the Overseer.
    const order = topologicalOrder(workflow.agents, workflow.edges);
    const workers = order.filter((a) => !a.isManager);
    upstreamSections = workers
      .map((u) => {
        // Import nodes — show uploaded file content
        if (u.nodeType === 'import') {
          if (!u.importedFileContent) return null;
          return `From ${u.name} (imported file):\n${u.importedFileContent}`;
        }
        // Chain nodes — show content pulled from linked workspace
        if (u.nodeType === 'chain') {
          if (!u.importedFileContent) return null;
          return `From workspace "${u.sourceWorkspaceName ?? 'linked workspace'}" (via ${u.name}):\n${u.importedFileContent}`;
        }
        // Output nodes — nothing to show, they're receivers not sources
        if (u.nodeType === 'output') return null;
        // Regular agent — read its latest run output
        if (!u.runs.length) return null;
        const run = u.runs[u.runs.length - 1];
        const output = run?.output?.trim();
        const filesText = formatUpstreamFiles(run?.files, mode);
        const parts = [output ? output : null, filesText || null].filter(Boolean);
        if (parts.length === 0) return null;
        return `From ${u.name}:\n${parts.join('\n\n')}`;
      })
      .filter(Boolean)
      .join('\n\n');
  } else {
    const upstream = upstreamAgents(workflow, agent.id);
    upstreamSections = upstream
      .map((u) => {
        // Import nodes inject their uploaded file content directly
        if (u.nodeType === 'import') {
          if (!u.importedFileContent) return null;
          return `Imported file (${u.importedFileName ?? 'file'}):\n${u.importedFileContent}`;
        }
        // Chain nodes inject the approved output from another workspace
        if (u.nodeType === 'chain') {
          if (!u.importedFileContent) return null;
          return `From workspace "${u.sourceWorkspaceName ?? 'linked workspace'}":\n${u.importedFileContent}`;
        }
        // Regular agent — read its latest run output
        const run = u.runs[u.runs.length - 1];
        const output = run?.output?.trim();
        const filesText = formatUpstreamFiles(run?.files, mode);
        const parts = [output ? output : null, filesText || null].filter(Boolean);
        if (parts.length === 0) return null;
        return `From ${u.name}:\n${parts.join('\n\n')}`;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  const feedbackSection = overseerFeedback
    ? `Overseer feedback from the previous attempt (address this before submitting again):\n${overseerFeedback}`
    : null;

  // For the Overseer, prepend the workflow's global conditions so the
  // Conditions button is actually useful — otherwise conditions only
  // affect the run if manually copied into the Overseer's task field.
  const conditionsSection =
    agent.isManager && workflow.conditions?.trim()
      ? `Workflow conditions to evaluate against:\n${workflow.conditions.trim()}`
      : null;

  const parts = [
    conditionsSection,
    agent.task,
    upstreamSections || null,
    feedbackSection,
  ].filter(Boolean);

  return parts.join('\n\n').trim();
}

/**
 * Finds the upstream agent to escalate to when `agent` has exhausted its
 * own self-retries. Explicit feedback edges take priority over auto-detected
 * flow-upstream — if the user drew a feedback edge from this agent to a
 * specific target, that's their explicit intent and the engine honours it.
 * Falls back to the most-recently-run flow-upstream agent if no feedback
 * edge exists.
 */
export function findEscalationTarget(agent, workflow) {
  // Explicit feedback edges take priority
  const explicit = feedbackTargets(workflow, agent.id);
  if (explicit.length > 0) {
    // If multiple feedback targets exist, pick the most recently run one
    // (same heuristic as the flow-upstream fallback below)
    return explicit.reduce((latest, candidate) => {
      const candidateRun = candidate.runs[candidate.runs.length - 1];
      const latestRun = latest?.runs[latest.runs.length - 1];
      const candidateTime = candidateRun?.endedAt ? new Date(candidateRun.endedAt).getTime() : 0;
      const latestTime = latestRun?.endedAt ? new Date(latestRun.endedAt).getTime() : 0;
      return candidateTime >= latestTime ? candidate : latest;
    }, explicit[0]);
  }

  // Fallback: auto-detect from flow-upstream
  const upstream = upstreamAgents(workflow, agent.id);
  if (upstream.length === 0) return null;

  return upstream.reduce((latest, candidate) => {
    const candidateRun = candidate.runs[candidate.runs.length - 1];
    const latestRun = latest?.runs[latest.runs.length - 1];
    const candidateTime = candidateRun?.endedAt ? new Date(candidateRun.endedAt).getTime() : 0;
    const latestTime = latestRun?.endedAt ? new Date(latestRun.endedAt).getTime() : 0;
    return candidateTime >= latestTime ? candidate : latest;
  }, upstream[0]);
}

/**
 * Counts how many consecutive trailing runs share the same input as the
 * most recent run. This is the agent's "attempts against its current
 * input" — the number that should actually be checked against its cap.
 * Once an upstream escalation changes what feeds this agent, its input
 * string changes, and the count naturally resets to reflect that this is
 * a fresh attempt budget rather than a continuation of failures against
 * stale input. Derived from existing run data rather than separate
 * counter state, so it can't drift out of sync.
 */
function attemptsAgainstCurrentInput(agent) {
  if (agent.runs.length === 0) return 0;
  const currentInput = agent.runs[agent.runs.length - 1].input;
  let count = 0;
  for (let i = agent.runs.length - 1; i >= 0; i -= 1) {
    if (agent.runs[i].input !== currentInput) break;
    count += 1;
  }
  return count;
}

/**
 * Decides what should happen next for an agent that just failed a run.
 * Returns one of:
 *   { action: 'self-retry' }
 *   { action: 'escalate-upstream', targetAgentId }
 *   { action: 'escalate-overseer', overseerId }
 *   { action: 'halt', reason }
 */
export function decideNextStep(agent, workflow, globalCap) {
  const cap = effectiveCap(agent, globalCap);
  const attempts = attemptsAgainstCurrentInput(agent);

  if (attempts < cap) {
    return { action: 'self-retry' };
  }

  const escalationTarget = findEscalationTarget(agent, workflow);
  if (escalationTarget) {
    const targetCap = effectiveCap(escalationTarget, globalCap);
    const targetAttempts = attemptsAgainstCurrentInput(escalationTarget);
    if (targetAttempts < targetCap) {
      return { action: 'escalate-upstream', targetAgentId: escalationTarget.id };
    }
    // Upstream is also exhausted — fall through to Overseer.
  }

  const overseer = getManagerAgent(workflow);
  if (overseer && overseer.id !== agent.id) {
    return { action: 'escalate-overseer', overseerId: overseer.id };
  }

  return {
    action: 'halt',
    reason: `${agent.name} failed after ${attemptCount(agent)} total attempt(s) with no further escalation path available.`,
  };
}

/**
 * Returns the list of agents that need fresh runs once `agentId` has been
 * re-run with new input — i.e. everything downstream that already ran and
 * whose input is now stale. Used after an upstream escalation succeeds.
 */
export function staleDownstream(agentId, workflow) {
  return downstreamAgents(workflow, agentId).filter((a) => a.runs.length > 0);
}
