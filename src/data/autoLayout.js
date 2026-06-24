// Auto-layout engine for the workflow canvas.
// Uses dagre to compute a left-to-right tree layout. Only `flow` edges are
// fed into the ranking algorithm — `feedback` edges (retry loops) are
// excluded, since they create cycles that would confuse dagre's ranking
// and produce a degenerate or erroring layout. Feedback edges are purely
// visual once node positions are computed.
//
// dagre is imported dynamically so it's code-split out of the main bundle
// and only loaded the first time Tidy Up is triggered (~20KB saved on boot).

const NODE_WIDTH = 220;
const NODE_HEIGHT = 110;
const RANK_SEP = 90;
const NODE_SEP = 40;

/**
 * Computes new positions for every agent using a left-to-right tree layout.
/**
 * Computes auto-layout positions for all agents using dagre.
 * Returns a Map of agentId -> {x, y}. Does not mutate the input.
 * Async because dagre is loaded dynamically on first call.
 *
 * @param {Array} agents - workflow agents (must have `id`)
 * @param {Array} edges - workflow edges (must have `source`, `target`, `kind`)
 */
export async function computeAutoLayout(agents, edges) {
  if (agents.length === 0) return new Map();

  // Dynamic import — dagre is only bundled in a separate chunk and loaded
  // on demand, shaving ~20KB from the initial parse cost.
  const dagre = (await import('dagre')).default;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  agents.forEach((agent) => {
    g.setNode(agent.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  const structuralEdges = edges.filter((e) => e.kind === 'flow');
  structuralEdges.forEach((edge) => {
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) return;
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const positions = new Map();
  agents.forEach((agent) => {
    const node = g.node(agent.id);
    if (!node) {
      positions.set(agent.id, agent.position);
      return;
    }
    positions.set(agent.id, {
      x: node.x - NODE_WIDTH / 2,
      y: node.y - NODE_HEIGHT / 2,
    });
  });

  return positions;
}
