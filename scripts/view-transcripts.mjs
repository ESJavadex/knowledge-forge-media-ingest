#!/usr/bin/env node
// Lightweight transcript viewer: directory listing + Markdown-as-text preview.
// No dependencies. Usage: PORT=8130 ROOT=/path/to/raw/media node view-transcripts.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';

const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : process.cwd();
const PORT = Number(process.env.PORT || 8130);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderTree(rel, base) {
  const abs = path.join(ROOT, rel);
  const entries = fs.readdirSync(abs, { withFileTypes: true })
    .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  const rows = entries.map((e) => {
    const href = `${base}${encodeURIComponent(e.name)}${e.isDirectory() ? '/' : ''}`;
    const icon = e.isDirectory() ? '📁' : '📝';
    return `<li><a href="${href}">${icon} ${esc(e.name)}</a></li>`;
  }).join('\n');
  const up = rel ? `<li><a href="${base}..">⬆️ ..</a></li>` : '';
  return `<ul>${up}${rows}</ul>`;
}

function renderMarkdown(rel) {
  const abs = path.join(ROOT, rel);
  const text = fs.readFileSync(abs, 'utf8');
  return `<pre style="white-space:pre-wrap">${esc(text)}</pre>`;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const abs = path.join(ROOT, rel);
    if (!abs.startsWith(ROOT)) throw new Error('forbidden');
    const isDir = fs.existsSync(abs) && fs.statSync(abs).isDirectory();
    const title = rel || 'Transcripciones';
    const body = isDir ? renderTree(rel, url.pathname) : renderMarkdown(rel);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;margin:24px;max-width:900px}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}li{margin:6px 0}pre{background:#f6f8fa;padding:16px;border-radius:8px;line-height:1.5}</style></head><body><h1>🎙️ ${esc(title)}</h1>${body}</body></html>`);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Serving ${ROOT} on http://0.0.0.0:${PORT}`);
});
