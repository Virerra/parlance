#!/usr/bin/env node
// Local dev server for Parlance's api/ functions.
// Replaces `vercel dev` for local iteration — starts in under a second
// instead of 5-10 minutes, calls the same handler functions directly,
// and produces identical request/response behavior.
//
// Usage: node server.js [port]   (default port: 3001)
//
// This file is NOT deployed — Vercel reads api/*.js directly on deploy.
// It exists purely to make local development fast.

import http from 'http';
import { URL } from 'url';

// Import handlers directly — same files Vercel deploys, no divergence.
import runAgent from './api/run-agent.js';
import fileContent from './api/file-content.js';
import fileMetadata from './api/file-metadata.js';

const PORT = parseInt(process.argv[2] ?? '3001', 10);

// Route table: match method + path prefix to handler.
// Dynamic segments (like a file ID) are extracted into req.query by
// the router below, matching Vercel's own req.query convention.
const ROUTES = [
  { method: 'POST', path: '/api/run-agent', handler: runAgent },
  { method: 'GET',  path: '/api/file-content', handler: fileContent },
  { method: 'GET',  path: '/api/file-metadata', handler: fileMetadata },
];

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Minimal res adapter so handlers can call res.status(n).json(obj)
// and res.status(n).send(text) — the same API Vercel exposes.
function makeRes(nodeRes) {
  let statusCode = 200;
  let headersSent = false;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(name, value) {
      nodeRes.setHeader(name, value);
      return res;
    },
    json(data) {
      if (headersSent) return;
      headersSent = true;
      nodeRes.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      nodeRes.end(JSON.stringify(data));
    },
    send(text) {
      if (headersSent) return;
      headersSent = true;
      nodeRes.writeHead(statusCode, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      });
      nodeRes.end(text ?? '');
    },
  };
  return res;
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  // Handle CORS preflight — the browser sends this before every real request.
  if (nodeReq.method === 'OPTIONS') {
    nodeRes.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-parlance-api-key',
    });
    nodeRes.end();
    return;
  }

  const url = new URL(nodeReq.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  const route = ROUTES.find(
    (r) => r.method === nodeReq.method && pathname === r.path
  );

  if (!route) {
    nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ error: { message: `No route for ${nodeReq.method} ${pathname}` } }));
    return;
  }

  try {
    const body = await parseBody(nodeReq);
    // Build a req object matching Vercel's handler contract.
    const req = {
      method: nodeReq.method,
      headers: nodeReq.headers,
      query: Object.fromEntries(url.searchParams.entries()),
      body,
    };
    const res = makeRes(nodeRes);
    await route.handler(req, res);
  } catch (err) {
    console.error(`[server] Unhandled error on ${nodeReq.method} ${pathname}:`, err);
    if (!nodeRes.headersSent) {
      nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
      nodeRes.end(JSON.stringify({ error: { message: 'Internal server error' } }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Parlance API server ready at http://localhost:${PORT}`);
  console.log('Routes:');
  ROUTES.forEach((r) => console.log(`  ${r.method.padEnd(6)} /api/${r.path.split('/api/')[1]}`));
});
