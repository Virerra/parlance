// Bridges the pure orchestration engine (runEngine.js) to the React
// reducer. The engine knows nothing about React or Redux-style actions;
// this module is the one place that translates its event stream into
// dispatches, including human-readable log text for escalation events.

const ESCALATION_TEXT = {
  'self-retry': (agentName) => `${agentName} is retrying`,
  'escalate-upstream': (agentName, targetName) =>
    `${agentName} kept failing — backing up to re-run ${targetName}`,
  'escalate-overseer': (agentName) => `${agentName} kept failing — the Overseer is investigating`,
  'overseer-rejection-loop': (_overseerName, targetName) =>
    `Overseer rejected — sending feedback back to ${targetName} for another pass`,
};

/**
 * Creates an onEvent callback for runWorkflow that dispatches the
 * corresponding reducer actions. `agentName` lookups use the workflow
 * snapshot taken at run start, since agent identity doesn't change mid-run
 * (only their run history/status does).
 */
export function createEngineEventBridge(dispatch, agents) {
  const nameOf = (id) => agents.find((a) => a.id === id)?.name ?? 'Agent';

  return function onEngineEvent(event) {
    switch (event.type) {
      case 'agent-started': {
        dispatch({
          type: 'AGENT_RUN_STARTED',
          payload: { agentId: event.agentId, agentName: nameOf(event.agentId) },
        });
        break;
      }
      case 'agent-completed':
      case 'agent-failed': {
        dispatch({
          type: 'AGENT_RUN_FINISHED',
          payload: { agentId: event.agentId, agentName: nameOf(event.agentId), run: event.run },
        });
        break;
      }
      case 'escalation': {
        const textFn = ESCALATION_TEXT[event.action];
        const text = textFn
          ? textFn(nameOf(event.from), event.detail ? nameOf(event.detail) : undefined)
          : `${nameOf(event.from)}: ${event.action}`;
        dispatch({ type: 'RUN_ESCALATION', payload: { text } });
        break;
      }
      case 'run-halted': {
        dispatch({ type: 'RUN_HALTED', payload: { reason: event.reason } });
        break;
      }
      case 'output-captured': {
        dispatch({
          type: 'OUTPUT_CAPTURED',
          payload: { outputNodeId: event.outputNodeId, run: event.run },
        });
        break;
      }
      case 'run-completed': {
        dispatch({
          type: 'RUN_COMPLETED',
          payload: { approved: event.approved, overseerOutput: event.overseerOutput ?? null },
        });
        break;
      }
      default:
        break;
    }
  };
}
