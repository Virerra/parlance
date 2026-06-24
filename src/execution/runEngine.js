// Drives a workflow run end-to-end using the decision logic in
// orchestrator.js. Emits events via an onEvent callback so the UI layer
// can mirror live status without the engine knowing about React state.
//
// IMPORTANT correctness note: the engine keeps its own authoritative copy
// of the workflow's agents/runs while a run is in progress, and applies
// each result to that copy itself before deciding the next step. It does
// NOT read state back from the caller (e.g. via a getter into React
// state), because React state updates triggered by onEvent are
// asynchronous/batched — reading "current" state immediately after
// dispatching an update is not guaranteed to reflect that update yet.
// That race would silently corrupt retry-cap counting. The engine is the
// single source of truth for the duration of a run; onEvent is purely a
// notification for the UI to mirror, not a round-trip read path.
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
  topologicalOrder,
  topologicalWaves,
  composeInput,
  decideNextStep,
  DEFAULT_GLOBAL_RETRY_CAP,
} from './orchestrator';
import { getManagerAgent, attemptCount, upstreamAgents, feedbackTargets } from '../data/workflowModel';

/**
 * Executes one agent against the engine's own working copy of the
 * workflow, appends the resulting run to that agent's run history, and
 * returns the new run. Mutates `workingWorkflow.agents` in place (the
 * working copy is private to a single runWorkflow call, never the
 * caller's React state) so subsequent composeInput/decideNextStep calls
 * see it immediately.
 *
 * Never throws. A client that rejects (cancellation, network error, rate
 * limit, anything) is converted into a normal failed run rather than an
 * unhandled rejection — this matters most for AbortError, since cancelling
 * a run intentionally triggers a rejection inside the client's wait/fetch,
 * and the caller (App.jsx) needs that to surface as a clean "Run
 * cancelled" event rather than crash the run loop.
 */
async function executeOne(agentId, workingWorkflow, client, signal, overseerFeedback) {
  const agent = workingWorkflow.agents.find((a) => a.id === agentId);
  const input = composeInput(agent, workingWorkflow, overseerFeedback);
  const attempt = attemptCount(agent) + 1;
  const startedAt = new Date().toISOString();

  let result;
  try {
    result = await client({ agent, input, signal, attempt });
  } catch (err) {
    const isAbort = err?.name === 'AbortError' || signal?.aborted;
    result = {
      success: false,
      output: '',
      reasoning: '',
      error: isAbort ? 'Cancelled' : err?.message || 'Unknown error calling agent client.',
    };
  }

  const run = {
    id: `run_${agent.id}_${attempt}_${Date.now().toString(36)}`,
    attempt,
    input,
    output: result.output ?? '',
    reasoning: result.reasoning ?? '',
    status: result.success ? 'completed' : 'failed',
    error: result.error ?? null,
    startedAt,
    endedAt: new Date().toISOString(),
    files: result.files ?? [],
  };

  agent.runs = [...agent.runs, run];
  agent.status = run.status;

  return run;
}

/**
 * Runs the full workflow. `initialWorkflow` is read once at the start;
 * from then on the engine tracks its own copy and only ever notifies the
 * caller of changes via onEvent — see the correctness note above for why.
 *
 * @param {import('../data/workflowModel').Workflow} initialWorkflow
 * @param {import('./agentClient').AgentClient} client
 * @param {(event: object) => void} onEvent
 * @param {{ signal?: AbortSignal, globalCap?: number }} [options]
 */
export async function runWorkflow(initialWorkflow, client, onEvent, options = {}) {
  const { signal, globalCap = DEFAULT_GLOBAL_RETRY_CAP } = options;

  // Deep-enough copy: agents and their run arrays are what mutate during a
  // run, so those need fresh arrays/objects. Edges and other workflow
  // fields don't change mid-run, so a shallow copy of those is fine.
  const workingWorkflow = {
    ...initialWorkflow,
    agents: initialWorkflow.agents.map((a) => ({ ...a, runs: [...a.runs] })),
    edges: [...initialWorkflow.edges],
  };

  try {
    topologicalOrder(workingWorkflow.agents, workingWorkflow.edges);
  } catch (err) {
    onEvent({ type: 'run-halted', reason: err.message });
    return;
  }

  // Build execution waves. Each wave contains agents that can run in
  // parallel — all their dependencies completed in earlier waves.
  // A linear chain produces single-agent waves (identical to sequential).
  // A diamond (A→C, B→C) produces [[A,B],[C]] — A and B run in parallel.
  let waves;
  try {
    waves = topologicalWaves(workingWorkflow.agents, workingWorkflow.edges);
  } catch (err) {
    onEvent({ type: 'run-halted', reason: err.message });
    return;
  }

  // The Overseer runs as the final step, not as part of the worker waves.
  const overseer = getManagerAgent(workingWorkflow);

  // Filter each wave to only real Claude agents (not Import/Output/Chain).
  const workerWaves = waves
    .map((wave) => wave
      .filter((a) => !overseer || a.id !== overseer.id)
      .filter((a) => !a.nodeType || a.nodeType === 'agent'))
    .filter((wave) => wave.length > 0);

  // Flat ordered list used for rejection-loop targeting (TARGET: parsing).
  const workerQueue = workerWaves.flat();

  /**
   * Run one agent and capture output. Returns the run object.
   * Emits agent-started / agent-completed / agent-failed / output-captured.
   */
  async function runOne(agentId, feedbackText = null) {
    onEvent({ type: 'agent-started', agentId });
    const run = await executeOne(agentId, workingWorkflow, client, signal, feedbackText);

    if (run.status === 'completed') {
      onEvent({ type: 'agent-completed', agentId, run });
      // Capture into any directly downstream Output nodes
      workingWorkflow.agents
        .filter((a) =>
          a.nodeType === 'output' &&
          workingWorkflow.edges.some((e) => e.source === agentId && e.target === a.id && e.kind === 'flow')
        )
        .forEach((outputNode) => {
          outputNode.capturedOutput = run.output;
          outputNode.capturedFiles = run.files ?? [];
          outputNode.status = 'completed';
          onEvent({ type: 'output-captured', outputNodeId: outputNode.id, run });
        });
    } else {
      onEvent({ type: 'agent-failed', agentId, run });
    }
    return run;
  }

  // Execute waves sequentially. Within each wave, all agents run in parallel.
  for (let waveIdx = 0; waveIdx < workerWaves.length; waveIdx++) {
    const wave = workerWaves[waveIdx];

    if (signal?.aborted) {
      onEvent({ type: 'run-halted', reason: 'Run cancelled.' });
      return;
    }

    // All agents in this wave start simultaneously.
    const waveRuns = await Promise.all(wave.map((a) => runOne(a.id)));

    if (signal?.aborted) {
      onEvent({ type: 'run-halted', reason: 'Run cancelled.' });
      return;
    }

    // Check for failures. Retry/escalation logic applies per failing agent.
    for (let i = 0; i < wave.length; i++) {
      const run = waveRuns[i];
      if (run.status === 'completed') continue;

      const agent = wave[i];
      const agentId = agent.id;
      const decision = decideNextStep(agent, workingWorkflow, globalCap);

      if (decision.action === 'self-retry') {
        onEvent({ type: 'escalation', from: agentId, action: 'self-retry' });
        // Retry just this agent, then re-check this wave from its position
        const retryRun = await runOne(agentId);
        if (retryRun.status !== 'completed') {
          onEvent({ type: 'run-halted', reason: `${agent.name} failed and self-retry did not recover.` });
          return;
        }
        continue;
      }

      if (decision.action === 'escalate-upstream') {
        onEvent({ type: 'escalation', from: agentId, action: 'escalate-upstream', detail: decision.targetAgentId });
        const upstreamRun = await runOne(decision.targetAgentId);
        if (upstreamRun.status !== 'completed') {
          onEvent({ type: 'run-halted', reason: `Upstream escalation failed for ${agent.name}.` });
          return;
        }
        const retryRun = await runOne(agentId);
        if (retryRun.status !== 'completed') {
          onEvent({ type: 'run-halted', reason: `${agent.name} failed even after upstream escalation.` });
          return;
        }
        continue;
      }

      if (decision.action === 'escalate-overseer') {
        onEvent({ type: 'escalation', from: agentId, action: 'escalate-overseer', detail: decision.overseerId });
        const overseerAgent = workingWorkflow.agents.find((a) => a.id === decision.overseerId);
        if (!overseerAgent) {
          onEvent({ type: 'run-halted', reason: decision.reason ?? `${agent.name} failed and no Overseer is available.` });
          return;
        }
        onEvent({ type: 'agent-started', agentId: overseerAgent.id });
        const overseerRun = await executeOne(overseerAgent.id, workingWorkflow, client, signal);
        const overseerEvt = overseerRun.status === 'completed' ? 'agent-completed' : 'agent-failed';
        onEvent({ type: overseerEvt, agentId: overseerAgent.id, run: overseerRun });
        if (overseerRun.status !== 'completed') {
          onEvent({ type: 'run-halted', reason: `Overseer could not resolve the failure in ${agent.name}.` });
          return;
        }
        const finalRun = await runOne(agentId);
        if (finalRun.status !== 'completed') {
          onEvent({ type: 'run-halted', reason: `Overseer could not resolve the failure in ${agent.name}.` });
          return;
        }
        continue;
      }

      onEvent({ type: 'run-halted', reason: decision.reason });
      return;
    }
  }

  // Worker agents all completed — run the Overseer as the final approval
  // gate, if one exists. On rejection, loop back with feedback: re-run
  // the last worker explicitly including the Overseer's rejection text,
  // then re-evaluate. The Overseer's maxIterations is the TOTAL number
  // of evaluations allowed, checked BEFORE each run so the count is
  // exact (cap=3 → exactly 3 Overseer runs, 2 rejection loops max).
  if (overseer) {
    // Determine the rejection loop target — where the Overseer sends
    // feedback when it rejects. Explicit feedback edges from the Overseer
    // take priority (user's explicit intent). Falls back to whoever feeds
    // into the Overseer via flow edges (the direct upstream agent).
    const overseerFeedbackTargets = feedbackTargets(workingWorkflow, overseer.id)
      .filter((a) => !a.nodeType || a.nodeType === 'agent');
    const overseerFlowUpstream = upstreamAgents(workingWorkflow, overseer.id)
      .filter((a) => !a.nodeType || a.nodeType === 'agent');

    const lastWorker = overseerFeedbackTargets.length > 0
      ? overseerFeedbackTargets[overseerFeedbackTargets.length - 1]
      : overseerFlowUpstream.length > 0
        ? overseerFlowUpstream[overseerFlowUpstream.length - 1]
        : workerQueue.length > 0 ? workerQueue[workerQueue.length - 1] : null;
    const overseerAgent = workingWorkflow.agents.find((a) => a.id === overseer.id);
    const overseerCap = overseerAgent?.maxIterations ?? globalCap ?? DEFAULT_GLOBAL_RETRY_CAP;

    while (true) {
      if (signal?.aborted) {
        onEvent({ type: 'run-halted', reason: 'Run cancelled.' });
        return;
      }

      // Check cap BEFORE running — so maxIterations=3 means exactly 3
      // Overseer runs, not 4. If cap is exhausted, halt with whatever
      // the last rejection was.
      const overseerRunsSoFar = overseerAgent?.runs?.length ?? 0;
      if (overseerRunsSoFar >= overseerCap) {
        const lastOverseerRun = overseerAgent?.runs?.[overseerAgent.runs.length - 1];
        const lastText = lastOverseerRun?.output?.replace(/\n*DECISION:\s*(APPROVED|REJECTED)\s*$/i, '').trim() ?? '';
        onEvent({ type: 'run-completed', approved: false, overseerOutput: lastText });
        return;
      }

      // Run the Overseer.
      onEvent({ type: 'agent-started', agentId: overseer.id });
      const overseerRun = await executeOne(overseer.id, workingWorkflow, client, signal);
      const overseerEventType = overseerRun.status === 'completed' ? 'agent-completed' : 'agent-failed';
      onEvent({ type: overseerEventType, agentId: overseer.id, run: overseerRun });

      if (overseerRun.status !== 'completed') {
        onEvent({ type: 'run-halted', reason: 'Overseer failed to evaluate the final output.' });
        return;
      }

      const decisionMatch = overseerRun.output.match(/DECISION:\s*(APPROVED|REJECTED)/i);
      const approved = decisionMatch ? decisionMatch[1].toUpperCase() === 'APPROVED' : false;
      // Strip both the DECISION and TARGET lines from the display text —
      // they're machine-readable markers, not human-readable output.
      const displayText = overseerRun.output
        .replace(/\n*DECISION:\s*(APPROVED|REJECTED)[^\n]*/i, '')
        .replace(/\n*TARGET:\s*[^\n]*/i, '')
        .trim();

      if (approved) {
        // When the Overseer approves, capture the last worker's output
        // into any Output nodes that are downstream of the Overseer.
        // The Overseer's own text is its evaluation — Chain Input nodes
        // in other workflows want the actual work product, not "DECISION: APPROVED".
        const outputsDownstreamOfOverseer = workingWorkflow.agents.filter((a) =>
          a.nodeType === 'output' &&
          workingWorkflow.edges.some((e) => e.source === overseer.id && e.target === a.id && e.kind === 'flow')
        );
        if (outputsDownstreamOfOverseer.length > 0 && lastWorker) {
          const lastWorkerAgent = workingWorkflow.agents.find((a) => a.id === lastWorker.id);
          const lastWorkerRun = lastWorkerAgent?.runs?.[lastWorkerAgent.runs.length - 1];
          if (lastWorkerRun) {
            outputsDownstreamOfOverseer.forEach((outputNode) => {
              outputNode.capturedOutput = lastWorkerRun.output;
              outputNode.capturedFiles = lastWorkerRun.files ?? [];
              outputNode.status = 'completed';
              onEvent({ type: 'output-captured', outputNodeId: outputNode.id, run: lastWorkerRun });
            });
          }
        }
        onEvent({ type: 'run-completed', approved: true, overseerOutput: displayText });
        return;
      }

      // Rejected and cap not yet exhausted — check we have a worker to
      // loop back to AND that there's budget for the Overseer to re-evaluate
      // after the worker's fix. If the next Overseer run would hit the cap
      // anyway, don't re-run the worker — that work would be immediately
      // discarded, costing a real API call for nothing.
      const runsAfterThis = (overseerAgent?.runs?.length ?? 0);
      const hasRoomForReeval = runsAfterThis < overseerCap;
      if (!lastWorker || !hasRoomForReeval) {
        onEvent({ type: 'run-completed', approved: false, overseerOutput: displayText });
        return;
      }

      // Parse TARGET to find the precise agent the Overseer identified as
      // responsible — this allows feedback to go directly to that agent
      // rather than blindly backchaining through every intermediate node.
      // Falls back to lastWorker if TARGET is absent or doesn't match.
      const targetMatch = overseerRun.output.match(/TARGET:\s*([^\n]+)/i);
      const targetName = targetMatch ? targetMatch[1].trim().toLowerCase() : null;
      const targetAgent = targetName
        ? workerQueue.find((a) => a.name.toLowerCase() === targetName) ?? lastWorker
        : lastWorker;

      const targetIndex = workerQueue.findIndex((a) => a.id === targetAgent.id);
      const agentsToRerun = targetIndex >= 0
        ? workerQueue.slice(targetIndex)
        : [targetAgent];

      // Signal the rejection loop in the run log.
      onEvent({
        type: 'escalation',
        from: overseer.id,
        action: 'overseer-rejection-loop',
        detail: targetAgent.id,
      });

      // Re-run from the target fix point forward. The target agent gets
      // the Overseer's feedback injected directly. Each subsequent agent
      // in the chain re-runs normally — their composeInput picks up the
      // updated output from the fixed agent automatically.
      if (signal?.aborted) {
        onEvent({ type: 'run-halted', reason: 'Run cancelled.' });
        return;
      }

      for (let i = 0; i < agentsToRerun.length; i++) {
        const rerunAgent = agentsToRerun[i];
        const isFixPoint = i === 0;

        if (signal?.aborted) {
          onEvent({ type: 'run-halted', reason: 'Run cancelled.' });
          return;
        }

        const agentRun = await runOne(rerunAgent.id, isFixPoint ? displayText : null);

        if (agentRun.status !== 'completed') {
          onEvent({
            type: 'run-halted',
            reason: `${rerunAgent.name} failed during an Overseer-directed re-run.`,
          });
          return;
        }
      }
      // Worker succeeded — loop back up to re-run the Overseer.
    }
  }

  onEvent({ type: 'run-completed', approved: true, overseerOutput: null });
}