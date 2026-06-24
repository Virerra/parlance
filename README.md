<div align="center">

<img src="public/parlance-logo.svg" height="52" alt="Parlance" />

<br/>
<br/>

**A no-code visual workspace for orchestrating multi-agent Claude workflows.**

Build on a canvas. Run with real AI. Bring your own key.

<br/>

[![MIT License](https://img.shields.io/badge/license-MIT-1985A1?style=flat-square)](LICENSE)
[![Built with Claude](https://img.shields.io/badge/built%20with-Claude-1985A1?style=flat-square)](https://anthropic.com)
[![Live demo](https://img.shields.io/badge/live%20demo-parlance--project.vercel.app-4C5C68?style=flat-square)](https://parlance-project.vercel.app)

</div>

---

## What is Parlance?

Parlance is an open-source, browser-based canvas for building and running multi-agent Claude workflows — without writing code.

Drag nodes onto a canvas, connect them with edges, and run. Parlance handles the orchestration: passing outputs from one agent to the next, running independent branches in parallel, retrying failures, escalating to an Overseer when conditions aren't met, and sending targeted feedback to the exact agent responsible when something needs fixing.

It runs entirely in the browser. Your API key never touches a server persistently.

---

## Quick start

```bash
git clone https://github.com/Virerra/parlance.git
cd parlance
npm install
```

You need two terminals:

```bash
# Terminal 1 — frontend
npm run dev          # → http://localhost:5173

# Terminal 2 — backend proxy
npm run dev:api      # → http://localhost:3001
```

Open [localhost:5173](http://localhost:5173), enter your Anthropic API key in Settings, and start building.

> **Why two processes?** Anthropic's Files API does not support direct browser requests due to CORS. The thin backend proxy (`api/`) handles this — every Claude API call routes through it for one consistent path. In production this deploys as Vercel serverless functions alongside the static frontend.

---

## How it works

### The canvas

Right-click anywhere to add nodes. Connect them by dragging from one node's handle to another.

**Agent nodes** are Claude-powered workers. Each has a name, role, task, model, optional system prompt, and retry cap. Connect them with flow edges and they pass their output downstream automatically — labeled by agent name so every downstream agent knows exactly who produced what.

**The Overseer** is a special evaluation node that sits at the end of a workflow. It checks the final output against the conditions you've set and either approves or rejects — triggering a targeted feedback loop if something doesn't meet the bar.

**Special nodes** extend what workflows can do:

| Node | Purpose |
|---|---|
| File Import | Upload files (text, code, PDFs, CSVs) as context for connected agents |
| Output | Captures the final result for download, copy, or chaining into another workflow |
| Chain Input | Pulls the approved output from another workspace and uses it as input |

### Execution model

When you run a workflow, the engine:

1. **Computes execution waves** — agents with no shared dependencies run in parallel; sequential ordering only where the graph requires it
2. **Labels all outputs** — each agent's result flows downstream as `From Builder:`, `From Tester:`, etc.
3. **Retries failures** — per-agent retry caps, upstream escalation, Overseer intervention as a last resort
4. **Targeted backchaining** — when the Overseer rejects, it names the responsible agent (`TARGET: Builder`); only that agent and everything downstream re-runs

### Workspace chaining

Workflows can feed into each other. Add an Output node to make a workflow chainable. In another workflow, add a Chain Input and select the source. When the second workflow runs, it triggers the first automatically and uses its approved output as context.

A toggle on the Chain Input controls whether to re-run the source or use its cached output — keeping token costs down when nothing has changed.

---

## Features

- Visual canvas with right-click menus, auto-layout, drag-to-connect
- Parallel execution — independent agents run simultaneously within each wave
- Retry + escalation — per-agent caps, upstream re-run, Overseer rejection loops
- Targeted backchaining — `TARGET:` parsing sends feedback to the exact responsible agent
- Workspace chaining with cache toggle for cost control
- File import and output nodes — upload context, download results
- Multi-workspace — multiple workflows saved locally, switchable instantly
- Per-agent system prompts — control model behaviour beyond the task field
- File & code tools — agents can write, edit, and run files via Claude's code execution
- BYOK — your key, your browser, nothing stored server-side
- MIT licensed, self-hostable, no accounts required

---

## Deployment

Parlance deploys to Vercel with no additional configuration beyond one environment variable.

**1. Fork and import**

Fork this repo, then import it in [Vercel](https://vercel.com). Build settings are auto-detected from `vercel.json`.

**2. Set environment variables**

| Variable | Value |
|---|---|
| `PARLANCE_ORIGIN` | Your deployed URL — e.g. `https://parlance-project.vercel.app` |

This restricts the backend proxy to requests from your domain only.

**3. Push to deploy**

Every push to `main` triggers an automatic deploy. Vercel builds the frontend and deploys `api/` as serverless functions.

---

## Project structure

```
parlance/
├── api/                        # Vercel serverless functions (backend proxy)
│   ├── run-agent.js            #   Proxies Claude Messages API calls
│   ├── file-content.js         #   Retrieves files created by tool-use agents
│   └── file-metadata.js        #   File metadata for the file viewer
├── public/
│   ├── favicon.svg             # Parlance P favicon
│   └── parlance-logo.svg       # Full wordmark
├── src/
│   ├── components/             # React UI components
│   │   ├── icons/              #   SVG icon system (WorkflowIcons.jsx)
│   │   ├── Canvas.jsx          #   ReactFlow canvas + context menus
│   │   ├── AgentNode.jsx       #   Agent node renderer
│   │   ├── Sidebar.jsx         #   Kanban sidebar + detail panels
│   │   └── ...
│   ├── data/                   # State management + persistence
│   │   ├── workflowModel.js    #   Node typedefs + factory functions
│   │   ├── workflowReducer.js  #   All state transitions
│   │   └── workspaceStorage.js #   localStorage persistence
│   └── execution/              # Orchestration engine
│       ├── runEngine.js        #   Wave-based parallel execution loop
│       ├── orchestrator.js     #   Topology, input composition, decisions
│       ├── claudeClient.js     #   Real Claude API client (via proxy)
│       └── mockClient.js       #   Mock client for local testing
├── server.js                   # Local dev server (replaces vercel dev)
└── vercel.json                 # Deployment config + CORS headers
```

---

## Security

Parlance is designed so your API key never persists anywhere outside your own browser.

**Your key:**
- Lives only in your browser's `localStorage`
- Is sent per-request in the `x-parlance-api-key` header — never stored server-side
- Is validated for format (`sk-ant-` prefix) at the proxy before use
- Is never logged, never written to disk, never held past a single request

**The backend proxy:**
- Has no `.env` and no secrets of its own — nothing to misconfigure or leak
- Validates the model against an allowlist before forwarding to Anthropic
- Strips unexpected request body fields
- Returns generic error messages — no stack traces, no internal details

If you're auditing: `src/data/apiKeyStorage.js` and `api/run-agent.js` are the relevant files.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Canvas | ReactFlow |
| Layout | Dagre (dynamic import — loads only on Tidy Up) |
| Zip download | JSZip (dynamic import — loads only on download) |
| Backend | Node.js serverless via Vercel |
| Persistence | Browser localStorage |
| AI | Anthropic Claude API |

---

## License

MIT — Copyright (c) 2026 Shayan Samimi Sadeh. See [LICENSE](LICENSE).

---

## Contributing

Issues and PRs welcome. The orchestration engine (`src/execution/`) and the data model (`src/data/`) are the most interesting parts to dig into.
