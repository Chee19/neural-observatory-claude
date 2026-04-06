import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadClaudeMetrics, loadSessionProjectLogDetails } from './claudeMetrics.mjs';

const PORT = Number(process.env.PORT || 4310);
const DIST_DIR = path.resolve(process.cwd(), 'dist');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

async function serveStatic(req, res, pathname) {
  const urlPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(DIST_DIR, urlPath);

  let real;
  try {
    real = await fs.realpath(filePath);
  } catch {
    const fallback = path.join(DIST_DIR, 'index.html');
    try {
      const html = await fs.readFile(fallback);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      sendJson(res, 500, { error: 'Build output not found. Run: npm run build' });
    }
    return;
  }

  if (!real.startsWith(DIST_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const data = await fs.readFile(real);
    const ext = path.extname(real).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Invalid request' });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Read-only server. Only GET is allowed.' });
    return;
  }

  if (requestUrl.pathname === '/api/metrics') {
    try {
      const result = await loadClaudeMetrics();
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        error: 'Failed to load .claude metrics',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/session-details' || requestUrl.pathname === '/api/session-details/') {
    const sessionId = requestUrl.searchParams.get('sessionId') || '';
    const projectPath = requestUrl.searchParams.get('projectPath') || '';
    if (!sessionId) {
      sendJson(res, 400, { error: 'sessionId query parameter is required.' });
      return;
    }

    try {
      const details = await loadSessionProjectLogDetails(sessionId, projectPath);
      sendJson(res, 200, details);
    } catch (error) {
      sendJson(res, 500, {
        error: 'Failed to load session project log details',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, readOnlyMode: true });
    return;
  }

  await serveStatic(req, res, requestUrl.pathname);
});

server.listen(PORT, () => {
  console.log(`Read-only Claude dashboard running at http://localhost:${PORT}`);
});
