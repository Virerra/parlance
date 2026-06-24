// GET /api/file-content?id=<file_id>
//
// Proxies a single file download from Anthropic's Files API. This route
// is the actual reason this backend exists: Anthropic's Files API content
// endpoint returns "Disallowed CORS origin" for every browser origin
// tested (confirmed directly, not assumed) — unlike /v1/messages, which
// supports direct browser access. There is no client-side fix for this;
// it has to be proxied through a server.
//
// NOTE: this used to live at api/files/[id].js. A sibling folder
// api/files/[id]/ (for the metadata route) had the exact same bracket
// name, which broke route resolution under `vercel dev` on Windows —
// confirmed via direct curl testing showing FUNCTION_INVOCATION_FAILED
// before the handler ever ran. Flattened both file routes to query-param
// based paths to remove any possibility of a similar collision.
//
// SECURITY: same contract as run-agent.js — the key arrives per-request
// in x-parlance-api-key, is used once to authenticate the outgoing
// request, and is never stored, logged, or persisted anywhere.

const API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const FILES_API_BETA = 'files-api-2025-04-14';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: { message: 'Method not allowed' } });
      return;
    }

    const apiKey = req.headers['x-parlance-api-key'];
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(401).json({ error: { message: 'Missing API key' } });
      return;
    }

    const id = req.query?.id;
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: { message: 'Missing file id' } });
      return;
    }

    const upstream = await fetch(`${API_BASE}/files/${encodeURIComponent(id)}/content`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': FILES_API_BETA,
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).json({ error: { message: text || `Upstream returned ${upstream.status}` } });
      return;
    }

    const text = await upstream.text();
    res.status(200).send(text);
  } catch (err) {
    // Caught at the top level so any unexpected error produces a real
    // diagnosable response instead of a bare platform 500 with no
    // message. Logged server-side only; the message returned to the
    // client is generic and never includes the key.
    console.error('file-content handler error:', err);
    res.status(500).json({ error: { message: 'Internal error retrieving file.' } });
  }
}
