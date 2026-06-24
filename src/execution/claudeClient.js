// Real Claude API client, implementing the same AgentClient contract as
// mockClient.js. Calls go through Parlance's own backend proxy
// (api/run-agent.js, api/file-content.js, api/file-metadata.js)
// rather than directly to api.anthropic.com.
//
// WHY A PROXY, NOT DIRECT BROWSER CALLS:
// /v1/messages supports direct browser access via Anthropic's documented
// anthropic-dangerous-direct-browser-access header. The Files API does
// not — confirmed directly via a CORS preflight test, which returned
// "Disallowed CORS origin" for every origin tried, with no wildcard
// support. Since canUseFiles agents need to download files Claude creates
// via the code_execution tool, and that step is unavoidably blocked
// browser-side, every call (not just the file download) is routed
// through our own backend for one consistent code path rather than half
// browser-direct, half proxied.
//
// KEY HANDLING / SECURITY:
// The user's key lives only in their own browser's localStorage (see
// data/apiKeyStorage.js) — Parlance is never the holder of it. Each
// request to our backend includes the key in the x-parlance-api-key
// header; the backend uses it once, in-flight, to call Anthropic, and
// never stores, logs, or persists it anywhere (see the api/ handlers for
// that side of the contract). No database, no session, nothing to leak.
//
// Two call shapes depending on the agent:
//   - canUseFiles agents: enables the code_execution_20250825 server
//     tool. Claude writes/runs files inside Anthropic's own sandbox; no
//     agentic loop is needed on our end since this is a server-executed
//     tool — one request, the response already contains the finished
//     work. Files come back as file_id references (only surfaced when
//     Claude runs a bash listing — see the system prompt below), which we
//     then download via our backend's files proxy.
//   - text-only agents (including the Overseer): a single plain
//     completion call, no tools.

import { getApiKey } from '../data/apiKeyStorage';

const BACKEND_BASE = '/api';
const MAX_TOKENS = 4096;

function authHeaders() {
  return {
    'content-type': 'application/json',
    'x-parlance-api-key': getApiKey(),
  };
}

/** Best-effort language guess from a file path, for syntax display. */
function guessLanguage(path) {
  const ext = path.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown',
    sh: 'bash', yml: 'yaml', yaml: 'yaml', sql: 'sql', rb: 'ruby', go: 'go',
  };
  return map[ext] ?? 'text';
}

/** Downloads a single file's raw text content via our backend's files proxy. */
async function downloadFileContent(fileId, signal) {
  const response = await fetch(`${BACKEND_BASE}/file-content?id=${encodeURIComponent(fileId)}`, {
    method: 'GET',
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to download file ${fileId}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/** Fetches file metadata (filename) via our backend's metadata proxy. */
async function fetchFileMetadata(fileId, signal) {
  const response = await fetch(`${BACKEND_BASE}/file-metadata?id=${encodeURIComponent(fileId)}`, {
    method: 'GET',
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) return null;
  return response.json();
}

/**
 * Extracts AgentFile entries from a code_execution response.
 *
 * IMPORTANT (found via live testing, confirmed against Anthropic's docs):
 * the text_editor_code_execution "create" result does NOT carry a file_id
 * or path — it only confirms { is_file_update: false }. Downloadable
 * file_ids only appear elsewhere in the response, typically attached to
 * bash command output once Claude lists the workspace (e.g. `ls`) — the
 * system prompt below asks agents to do this. Anthropic's own
 * documentation has two slightly different examples of exactly where the
 * file_id ends up nested, so rather than assume one specific shape, this
 * walks the entire response tree and collects every file_id it finds,
 * wherever it is. This is more robust than matching one exact path and
 * silently finding nothing if the real shape differs even slightly.
 */
async function extractFiles(content, signal) {
  const fileIds = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node.file_id === 'string') {
      fileIds.add(node.file_id);
    }
    Object.values(node).forEach(walk);
  }
  walk(content);

  const files = await Promise.all(
    Array.from(fileIds).map(async (fileId) => {
      try {
        const [text, meta] = await Promise.all([
          downloadFileContent(fileId, signal),
          fetchFileMetadata(fileId, signal),
        ]);
        const path = meta?.filename ?? fileId;
        return { path, content: text, language: guessLanguage(path) };
      } catch (err) {
        // A failed file download shouldn't take down the whole agent run —
        // surface it as a visible placeholder instead of silently dropping
        // the file or throwing past the caller's success/failure framing.
        return { path: fileId, content: `[Failed to download this file: ${err.message}]`, language: 'text' };
      }
    })
  );

  return files;
}

/** Concatenates all top-level text blocks in a response into one string. */
function extractText(content) {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
    .trim();
}

async function callMessages(body, signal) {
  const response = await fetch(`${BACKEND_BASE}/run-agent`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

/**
 * @returns {import('./agentClient').AgentClient}
 */
export function createClaudeClient() {
  return async function claudeAgentClient({ agent, input, signal }) {
    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        success: false,
        output: '',
        reasoning: '',
        error: 'No Anthropic API key set. Add one in Settings before running with real agents.',
      };
    }

    try {
      const body = {
        model: agent.model || 'claude-sonnet-4-6',
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: input }],
      };

      const systemParts = [];

      if (agent.canUseFiles) {
        // The text-editor "create file" result does not itself expose a
        // downloadable file_id (confirmed against Anthropic's docs and via
        // live testing) — file_ids only surface through a bash command's
        // output. Without this instruction, files get written inside the
        // sandbox successfully but are invisible to anything outside it.
        systemParts.push(
          'When you create or modify files, after finishing your file work run a bash command ' +
          "(e.g. `ls -la`) so the files are surfaced and downloadable. Do this even for a single " +
          'file — it is required for the file to be retrievable outside the sandbox.'
        );
        body.tools = [{ type: 'code_execution_20250825', name: 'code_execution' }];
      }

      if (agent.isManager) {
        systemParts.push(
          'You are the Overseer for this workflow. Your only job is to compare the work you ' +
          "receive against the stated conditions and decide whether they're met. Do not require " +
          'evidence, proof, or a particular format beyond what the conditions actually ask for — ' +
          'verifying and testing the work is the upstream agents\' job, not yours. If the stated ' +
          'conditions are met, approve. If not, explain specifically which condition is unmet and ' +
          'what needs to change.\n\n' +
          'The input you receive is labelled by source (e.g. "From Builder:", "From Tester:", ' +
          '"From workspace \\"name\\" (via Chain Input):"). Sources labelled as "imported file" ' +
          'or "via Chain Input" or "via File Import" are read-only external inputs — you cannot ' +
          'target them for rework. Only target agents that produced work in THIS workflow.\n\n' +
          'When rejecting, identify which specific agent in this workflow produced the work that ' +
          'needs to change. If the only input came from an external source (imported file or ' +
          'chained workspace) and it does not meet the conditions, reject with no TARGET line — ' +
          'the workflow has no agent that can fix it.\n\n' +
          'End your response with exactly these lines and nothing else after them:\n' +
          '"DECISION: APPROVED" or "DECISION: REJECTED"\n' +
          '"TARGET: [agent name]" — only when a specific agent in this workflow can fix the issue.\n' +
          'Example rejection ending:\n' +
          'DECISION: REJECTED\n' +
          'TARGET: Builder'
        );
      }

      // User-defined system prompt — appended after any built-in system
      // instructions so the fixed constraints come first and user
      // customization refines within them rather than overriding them.
      if (agent.systemPrompt?.trim()) {
        systemParts.push(agent.systemPrompt.trim());
      }

      if (systemParts.length > 0) {
        body.system = systemParts.join('\n\n');
      }

      const data = await callMessages(body, signal);
      const content = data.content ?? [];
      const output = extractText(content);

      if (data.stop_reason === 'refusal') {
        return {
          success: false,
          output: '',
          reasoning: '',
          error: 'Claude declined to complete this task.',
        };
      }

      let files = [];
      if (agent.canUseFiles) {
        files = await extractFiles(content, signal);
      }

      return { success: true, output, reasoning: '', error: null, files };
    } catch (err) {
      const isAbort = err?.name === 'AbortError' || signal?.aborted;
      return {
        success: false,
        output: '',
        reasoning: '',
        error: isAbort ? 'Cancelled' : err?.message || 'Unknown error calling the Claude API.',
      };
    }
  };
}
