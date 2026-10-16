#!/usr/bin/env node
// Generates image assets a post needs (photos that cannot be rebuilt in HTML) with the
// gpt-image-2 deployment on our Azure AI Foundry resource.
//
//   node generate.mjs posts/<name>            generate every missing asset in post.json "generate"
//   node generate.mjs posts/<name> --force    regenerate even if the file exists
//   node generate.mjs posts/<name> --only hook-photo
//
// post.json:
//   "generate": [{ "id": "hook-photo", "out": "assets/hook-photo.png", "prompt": "…",
//                  "size": "1024x1536", "quality": "high", "variants": 1, "background": "transparent"? }]
//
// Auth is Entra ID through the Azure CLI (`az login`); no keys. Endpoint/deployment come from
// foundry.json, overridable with AZURE_FOUNDRY_IMAGE_ENDPOINT / AZURE_FOUNDRY_IMAGE_DEPLOYMENT /
// AZURE_FOUNDRY_IMAGE_API_VERSION.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'foundry.json'), 'utf8'));
const ENDPOINT = (process.env.AZURE_FOUNDRY_IMAGE_ENDPOINT || cfg.endpoint).replace(/\/+$/, '');
const DEPLOYMENT = process.env.AZURE_FOUNDRY_IMAGE_DEPLOYMENT || cfg.deployment;
const API_VERSION = process.env.AZURE_FOUNDRY_IMAGE_API_VERSION || cfg.apiVersion;

function token() {
  return execSync('az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv', { encoding: 'utf8' }).trim();
}

async function generate(job, bearer) {
  const url = `${ENDPOINT}/openai/deployments/${encodeURIComponent(DEPLOYMENT)}/images/generations?api-version=${API_VERSION}`;
  const body = { prompt: job.prompt, size: job.size || '1024x1536', quality: job.quality || 'high', n: job.variants || 1, output_format: job.format || 'png' };
  // "background": "transparent" for cut-out art (stickers, map watermarks); png/webp only
  if (job.background) body.background = job.background;
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${job.id}: HTTP ${res.status} ${text.slice(0, 400)}`);
  return JSON.parse(text).data.map((d) => Buffer.from(d.b64_json, 'base64'));
}

async function main() {
  const argv = process.argv.slice(2);
  const oi = argv.indexOf('--only');
  const only = oi >= 0 ? argv[oi + 1].split(',') : null;
  const force = argv.includes('--force');
  const dir = path.resolve(argv.find((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1)) || '');
  const post = JSON.parse(fs.readFileSync(path.join(dir, 'post.json'), 'utf8'));
  const jobs = (post.generate || []).filter((j) => (!only || only.includes(j.id)) && (force || !fs.existsSync(path.join(dir, j.out))));
  if (!jobs.length) return console.log('nothing to generate');
  const bearer = token();
  for (const job of jobs) {
    const t0 = Date.now();
    const imgs = await generate(job, bearer);
    imgs.forEach((buf, i) => {
      // extra variants are kept next to the chosen one so a better take can be swapped in
      const out = path.join(dir, i === 0 ? job.out : job.out.replace(/(\.\w+)$/, `.v${i + 1}$1`));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      console.log(`generated ${path.relative(process.cwd(), out)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    });
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
