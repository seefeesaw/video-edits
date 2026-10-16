#!/usr/bin/env node
// Static server for the review page: node serve.mjs [port]
// Open http://localhost:5179/review.html?post=<name> to compare out/*.png with reference images.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] || process.env.PORT || 5179);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!p.startsWith(ROOT)) return res.writeHead(403).end();
    if (url.pathname === '/') p = path.join(ROOT, 'review.html');
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
