// Produces a demo workflow using the real data model (not static display data).
// Used to seed the app on first load so the canvas always reflects what
// createAgent/createEdge actually produce.

import { createAgent, createEdge } from './workflowModel';

export function buildDemoWorkflow() {
  const builder = createAgent({
    name: 'Builder',
    role: 'Writes the implementation',
    task: 'Implement the requested feature based on the brief and any prior debugging notes.',
    position: { x: 60, y: 200 },
    maxIterations: 3,
  });

  const tester = createAgent({
    name: 'Tester',
    role: 'Runs the test suite',
    task: 'Run the test suite against the latest implementation and report pass/fail results.',
    position: { x: 380, y: 60 },
    maxIterations: 3,
  });

  const debugger_ = createAgent({
    name: 'Debugger',
    role: 'Diagnoses failing cases',
    task: 'Diagnose failing test cases and produce concrete notes for the Builder to fix.',
    position: { x: 380, y: 340 },
    maxIterations: 3,
  });

  const overseer = createAgent({
    name: 'Overseer',
    role: 'Checks output against conditions',
    task: 'Check the final output against the workflow conditions and approve or reject it.',
    position: { x: 720, y: 200 },
    maxIterations: 1,
    isManager: true,
  });

  // Demo agents start clean — no fake pre-populated runs. Earlier in this
  // build, before the run engine existed, this seeded fake "completed" and
  // "running" runs just to have something to look at on the canvas. Now
  // that Run actually works, leaving a permanently-"running" Debugger card
  // here would be actively misleading (it looks like a stuck run, not a
  // fresh workflow). All four agents start at their real default: pending,
  // no runs, exactly like any workflow you build yourself.

  const agents = [builder, tester, debugger_, overseer];

  const edges = [
    createEdge({ source: builder.id, target: tester.id, kind: 'flow' }),
    createEdge({ source: tester.id, target: debugger_.id, kind: 'flow' }),
    createEdge({ source: debugger_.id, target: builder.id, kind: 'feedback' }),
    createEdge({ source: tester.id, target: overseer.id, kind: 'flow' }),
  ];

  return {
    name: 'Untitled workflow',
    conditions: 'All tests pass and the login form handles invalid credentials gracefully.',
    agents,
    edges,
  };
}
