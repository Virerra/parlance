// POST /api/run-agent
//
// Proxies a single Messages API call to Anthropic on behalf of the
// frontend. This exists for one reason: the Files API (used to retrieve
// files created by file-tool agents) does not support direct browser
// CORS, confirmed by testing — only this proxy approach works for that
// part. Routing plain text/tool-use calls through here too keeps one
// consistent code path instead of half browser-direct, half proxied.
//
// SECURITY: the caller's Anthropic API key arrives in the
// x-parlance-api-key header on every request. It is used exactly once,
// to set the outgoing x-api-key header on the call to Anthropic, and is
// never logged, never written to disk, never stored in any variable that
// outlives this single request handler's execution. This is a stateless
// proxy — there is no session, no database, nothing to leak after the
// response is sent. This matters because Parlance is open source: a key
// that touched persistent storage anywhere in this codebase would be a
// real liability. It doesn't.

const API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

// Allowlist of models Parlance is designed to call.
// Prevents a rogue client from using the proxy to call arbitrarily
// expensive models (e.g. injecting "claude-opus-4-5" to drain the
// user's key faster than expected).
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
]);

// Top-level keys the proxy is permitted to forward to Anthropic.
// Any key not in this list is stripped before the upstream call —
// this prevents prompt-injection via unexpected body fields.
const ALLOWED_BODY_KEYS = new Set([
  'model', 'max_tokens', 'messages', 'system', 'tools',
  'tool_choice', 'temperature', 'stream', 'betas',
]);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: { message: 'Method not allowed' } });
      return;
    }

    const apiKey = req.headers['x-parlance-api-key'];
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk-ant-')) {
      res.status(401).json({ error: { message: 'Missing or invalid API key format' } });
      return;
    }

    const body = req.body ?? {};

    // Validate model is in the allowlist
    if (!body.model || !ALLOWED_MODELS.has(body.model)) {
      res.status(400).json({ error: { message: `Model not allowed: ${body.model}` } });
      return;
    }

    // Strip any keys not in the allowlist before forwarding
    const safeBody = {};
    for (const key of ALLOWED_BODY_KEYS) {
      if (body[key] !== undefined) safeBody[key] = body[key];
    }

    // Cap max_tokens to a reasonable limit (32K) to prevent accidental
    // runaway costs — the frontend should never need more than this.
    if (safeBody.max_tokens && safeBody.max_tokens > 32000) {
      safeBody.max_tokens = 32000;
    }

    const upstream = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...(safeBody.betas?.length ? { 'anthropic-beta': safeBody.betas.join(',') } : {}),
      },
      body: JSON.stringify(safeBody),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    // Never include the key or full request body in error output — logged
    // server-side only, generic message returned to the client.
    console.error('run-agent handler error:', err);
    res.status(502).json({ error: { message: 'Upstream request failed' } });
  }
}
