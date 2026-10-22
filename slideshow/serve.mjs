#!/usr/bin/env node
// Static server for the review page: node serve.mjs [port]
// Open http://localhost:5179/review.html?post=<name> to compare out/*.png with reference images.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] || process.env.PORT || 5179);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4' };

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    // CORS so other origins (e.g. a YouTube tab running video/tools/yt-compare.js) can read renders
    res.setHeader('access-control-allow-origin', '*');
    // /video/... and /juice/... serve the sibling video pipelines (renders, tools)
    const pipe = ['video', 'juice'].find((d) => url.pathname.startsWith(`/${d}/`));
    const VROOT = pipe ? path.join(ROOT, '..', pipe) : ROOT;
    let p = pipe ? path.normalize(path.join(VROOT, decodeURIComponent(url.pathname.slice(pipe.length + 2)))) : path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!p.startsWith(VROOT)) return res.writeHead(403).end();
    if (url.pathname === '/') p = path.join(ROOT, 'review.html');
    // POST /api/put?file=<path under slideshow/, video/ or juice/> writes the request body. Lets a capture
    // script running in another site's tab hand its JSON to the pipeline (form POST in a new window,
    // since page CSPs usually block fetch to localhost). Only .json files, only inside the repo dirs.
    if (url.pathname === '/api/put') {
      const rel = url.searchParams.get('file') || '';
      const sib = ['video/', 'juice/'].some((d) => rel.startsWith(d));
      const target = path.normalize(sib ? path.join(ROOT, '..', rel) : path.join(ROOT, rel));
      const okRoot = target.startsWith(ROOT + path.sep) || ['video', 'juice'].some((d) => target.startsWith(path.join(ROOT, '..', d) + path.sep));
      if (!okRoot || !target.endsWith('.json')) return res.writeHead(400).end('bad file');
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const ct = req.headers['content-type'] || '';
        const data = ct.includes('application/x-www-form-urlencoded') ? new URLSearchParams(body).get('data') : body;
        try { JSON.parse(data); } catch { return res.writeHead(400).end('not json'); }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, data);
        res.writeHead(200, { 'content-type': 'text/html' }).end(`<p>saved ${rel} (${data.length} bytes). You can close this tab.</p>`);
      });
      return;
    }
    if (url.pathname === '/api/posts') {
      const posts = fs.readdirSync(path.join(ROOT, 'posts')).filter((d) => fs.existsSync(path.join(ROOT, 'posts', d, 'post.json')));
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(posts));
    }
    if (url.pathname.startsWith('/api/ls/')) {
      const dir = path.join(ROOT, decodeURIComponent(url.pathname.slice(8)));
      const list = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(list));
    }
    fs.readFile(p, (err, buf) => {
      if (err) return res.writeHead(404).end('not found');
      res.writeHead(200, { 'content-type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }).end(buf);
    });
  })
  .listen(PORT, () => console.log(`slideshow review on http://localhost:${PORT}/review.html`));
