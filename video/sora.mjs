#!/usr/bin/env node
// Generates the clips a video spec needs with Sora 2 (deployment `thuma-video` on our Azure AI
// Foundry resource; see foundry.json). Jobs run in parallel, are resumable, and land in
// videos/<name>/clips/<shot>.mp4 (+ .v2.mp4 … for extra takes).
//
//   node sora.mjs videos/<name>                    generate every missing shot clip
//   node sora.mjs videos/<name> --only s1,s3       just these shots
//   node sora.mjs videos/<name> --force            regenerate even if the clip exists
//   node sora.mjs videos/<name> --more [N]         add N more takes (default 1; next free .vN)
//
// Shot fields used here: id, prompt (global `style` is appended), seconds (4|8|12; default: the
// smallest that covers the shot), takes (parallel variants, default 1), keyframe (optional image
// path, or an object built by keyframes.mjs; sent as input_reference so the clip starts from
// that exact frame/composition — use it to keep a real product exact), set (+ spec.sets / spec.characters).
// Auth: Entra ID via `az login`; no keys.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// network blips ("fetch failed") are retried instead of ending a long generation run
export const fetch = async (url, opts) => {
  for (let attempt = 0; ; attempt++) {
    try { return await globalThis.fetch(url, opts); }
    catch (e) { if (attempt >= 5) throw e; console.log(`  ${e.message}; retrying in 15s`); await new Promise((r) => setTimeout(r, 15000)); }
  }
};

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'foundry.json'), 'utf8'));
const ENDPOINT = (process.env.AZURE_FOUNDRY_VIDEO_ENDPOINT || cfg.endpoint).replace(/\/+$/, '');
const DEPLOYMENT = process.env.AZURE_FOUNDRY_VIDEO_DEPLOYMENT || cfg.deployment;
export const BASE = `${ENDPOINT}/openai/v1/videos`;
export { DEPLOYMENT };

let tok = { value: '', at: 0 };
export function auth() {
  // tokens last ~60 min; refresh every 40 so long polls never expire
  if (Date.now() - tok.at > 40 * 60e3) tok = { value: execSync(`az account get-access-token --resource ${cfg.scope} --query accessToken -o tsv`, { encoding: 'utf8' }).trim(), at: Date.now() };
  return { authorization: `Bearer ${tok.value}` };
}

export const SORA_SECONDS = [4, 8, 12];
export const soraSecondsFor = (dur) => SORA_SECONDS.find((s) => s >= dur) ?? 12;

// A shot whose set maps to a library character (spec.characters: {"A": "<name>"} →
// characters/<name>/character.json) is a REMIX of that character's anchor clip of the right
// length: Sora keeps the person, clothes, place and framing, and only the action changes. (Sora
// refuses input images with people, even generated ones; a remix of its own clip is not an upload.)
export function characterFor(shot, spec) {
  const name = shot.set && spec.characters?.[shot.set];
  if (!name) return null;
  const file = path.join(ROOT, 'characters', name, 'character.json');
  if (!fs.existsSync(file)) throw new Error(`${shot.id}: character "${name}" not found (node character.mjs create ${name} …)`);
  return { name, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

async function remix(shot, spec, ch) {
  const secs = soraSecondsFor(shot.end - shot.start + (shot.from ?? 0));
  const a = ch.anchors?.[secs];
  if (!a) throw new Error(`${shot.id}: character ${ch.name} has no ${secs}s anchor (a remix keeps its source's length): node character.mjs create ${ch.name} --seconds ${secs}`);
  if (a.expiresAt && Date.now() / 1000 > a.expiresAt - 900) throw new Error(`${shot.id}: ${ch.name}'s ${secs}s anchor has expired (Sora keeps videos 24h): node character.mjs refresh ${ch.name}`);
  const prompt = [`Keep exactly the same person (face, hair, body, clothes), the same location, lighting and camera framing as this video. New action for this clip: ${shot.prompt}`, spec.style].filter(Boolean).join('\n\n');
  const r = await fetch(`${BASE}/${a.id}/remix`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${shot.id}: remix HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.id;
}

async function create(shot, spec, dir) {
  const ch = characterFor(shot, spec);
  if (ch) return remix(shot, spec, ch);
  const fd = new FormData();
  fd.set('model', DEPLOYMENT);
  // "sets": named recurring characters + locations (e.g. the two sides of a contrast video); a shot's
  // "set": "A" adds that exact description, so every shot of a character uses the same words
  fd.set('prompt', [shot.prompt, shot.set && spec.sets?.[shot.set], spec.style].filter(Boolean).join('\n\n'));
  fd.set('size', spec.soraSize || '720x1280');
  fd.set('seconds', String(shot.seconds ?? soraSecondsFor(shot.end - shot.start + (shot.from ?? 0))));
  if (shot.keyframe) {
    // object keyframes are built by keyframes.mjs; send the Sora-sized version
    const file = typeof shot.keyframe === 'string' ? path.join(dir, shot.keyframe) : path.join(dir, 'assets', 'keyframes', `${shot.id}.${(spec.soraSize || '720x1280')}.png`);
    if (!fs.existsSync(file)) throw new Error(`${shot.id}: keyframe ${path.relative(dir, file)} missing (run keyframes.mjs)`);
    const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    fd.set('input_reference', new Blob([fs.readFileSync(file)], { type }), path.basename(file));
  }
  const r = await fetch(BASE, { method: 'POST', headers: auth(), body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${shot.id}: create HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.id;
}

export async function waitAndSave(id, file, label) {
  const t0 = Date.now();
  let s;
  for (;;) {
    s = await (await fetch(`${BASE}/${id}`, { headers: auth() })).json();
    if (['completed', 'failed', 'cancelled'].includes(s.status)) break;
    await new Promise((x) => setTimeout(x, 10000));
  }
  if (s.status !== 'completed') {
    const hint = /people-in-user-uploads/.test(JSON.stringify(s.error || {})) ? ' — the keyframe shows a person or face (screens included); regenerate it people-free (only hands)' : '';
    throw new Error(`${label}: ${s.status} ${JSON.stringify(s.error || {}).slice(0, 300)}${hint}`);
  }
  const v = await fetch(`${BASE}/${id}/content`, { headers: auth() });
  if (!v.ok) throw new Error(`${label}: download HTTP ${v.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await v.arrayBuffer()));
  console.log(`clip ${path.relative(process.cwd(), file)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  return s;
}

const takeFile = (dir, id, n) => path.join(dir, 'clips', n === 1 ? `${id}.mp4` : `${id}.v${n}.mp4`);

async function main() {
  const argv = process.argv.slice(2);
  const oi = argv.indexOf('--only');
  const only = oi >= 0 ? argv[oi + 1].split(',') : null;
  const force = argv.includes('--force'), more = argv.includes('--more');
  const mi = argv.indexOf('--more');
  const dir = path.resolve(argv.find((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1) && (mi < 0 || i !== mi + 1 || isNaN(+a))) || '');
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  const jobsFile = path.join(dir, 'clips', 'jobs.json');
  fs.mkdirSync(path.dirname(jobsFile), { recursive: true });
  const pending = fs.existsSync(jobsFile) ? JSON.parse(fs.readFileSync(jobsFile, 'utf8')) : {}; // file -> job id
  const saveJobs = () => fs.writeFileSync(jobsFile, JSON.stringify(pending, null, 2));

  const work = [];
  for (const shot of spec.shots) {
    if (only && !only.includes(shot.id)) continue;
    const takes = shot.takes ?? 1;
    let n0 = 1;
    if (more) while (fs.existsSync(takeFile(dir, shot.id, n0))) n0++;
    // --more [N]: N extra takes (default 1) after the existing ones
    const moreN = more ? Math.max(1, +(argv[argv.indexOf('--more') + 1]) || 1) : 0;
    for (let n = n0; n < n0 + (more ? moreN : takes); n++) {
      const file = takeFile(dir, shot.id, n);
      const rel = path.relative(dir, file);
      if (!force && !more && fs.existsSync(file)) continue;
      work.push({ shot, file, rel });
    }
  }
  // resume jobs that were submitted by an earlier (interrupted) run
  for (const [rel, id] of Object.entries(pending)) if (!work.find((w) => w.rel === rel) && !fs.existsSync(path.join(dir, rel))) work.push({ rel, file: path.join(dir, rel), id });
  if (!work.length) return console.log('nothing to generate');

  // Sora's rate limit allows only a couple of jobs in flight: run a small worker pool and back off
  // on 429 instead of failing. Resumed jobs (already submitted) just wait.
  const limit = +(process.env.SORA_CONCURRENCY || spec.concurrency || 2);
  const queue = [...work];
  const failed = [];
  const runOne = async (w) => {
    w.id ??= pending[w.rel];
    if (!w.id) {
      for (let attempt = 0; ; attempt++) {
        try { w.id = await create(w.shot, spec, dir); break; } catch (e) {
          if (!/HTTP 429/.test(e.message) || attempt > 40) throw e;
          await new Promise((x) => setTimeout(x, 15000));
        }
      }
      pending[w.rel] = w.id; saveJobs();
      console.log(`submitted ${w.rel} (${w.id})`);
    }
    const st = await waitAndSave(w.id, w.file, w.rel);
    delete pending[w.rel]; saveJobs();
    // keep every clip's Sora id (jobs.json forgets finished jobs): a good take can become a
    // character anchor (node character.mjs adopt), within Sora's 24h retention
    const idsFile = path.join(dir, 'clips', 'ids.json');
    const ids = fs.existsSync(idsFile) ? JSON.parse(fs.readFileSync(idsFile, 'utf8')) : {};
    ids[w.rel.replace(/\\/g, '/')] = { id: w.id, at: new Date().toISOString(), expiresAt: st.expires_at ?? null };
    fs.writeFileSync(idsFile, JSON.stringify(ids, null, 2));
  };
  await Promise.all(Array.from({ length: limit }, async () => {
    while (queue.length) {
      const w = queue.shift();
      try { await runOne(w); } catch (e) { failed.push(e); console.error(e.message); if (pending[w.rel]) { delete pending[w.rel]; saveJobs(); } }
    }
  }));
  if (failed.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
