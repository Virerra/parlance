// GET /api/file-metadata?id=<file_id>
//
// Proxies a file metadata lookup (mainly for the filename) from
// Anthropic's Files API. Same CORS limitation and security contract as
// files/[id].js — see that file for the full explanation.
//
// NOTE: this used to live at api/files/[id]/metadata.js, nested in a
// folder with the same bracket name as files/[id].js (a file). That
// file/folder name collision broke route resolution under `vercel dev`
// on Windows — requests to the dynamic content route failed with
// FUNCTION_INVOCATION_FAILED before the handler code ever ran, confirmed
// via direct curl testing (a 401 check at the very top of the handler
// never fired). Moved here as a flat route with a query param instead, to
// remove the ambiguous file/folder pairing entirely.

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

    const upstream = await fetch(`${API_BASE}/files/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': FILES_API_BETA,
      },
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('file-metadata handler error:', err);
    res.status(500).json({ error: { message: 'Internal error retrieving file metadata.' } });
  }
}
