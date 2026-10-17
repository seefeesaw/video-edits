#!/usr/bin/env node
// Character library for series: the same generated person across shots and across videos.
//
// Sora refuses input images that show people (even generated ones: people-in-user-uploads), so a
// character cannot start from a picture. Instead a character is an ANCHOR: a Sora clip of that
// person in their place. Shots remix the anchor (sora.mjs does it for shots whose set maps to a
// character), which keeps face, hair, clothes, place and framing and changes only the action.
// Two Sora facts shape this:
//   - a remix keeps its source's length, so a character has one anchor per clip length (4, 8, 12 s)
//   - Sora keeps videos for 24 h; an expired anchor can't be remixed. `refresh` remixes each anchor
//     into an unchanged copy (a new 24 h) and records the chain; frames/ keeps the original look so
//     drift can be checked (`status` shows how close the current anchor still is).
//
//   node character.mjs create <name> --desc "<person + place>" [--action "<neutral action>"] [--seconds 4,8]
//   node character.mjs adopt <name> --id video_… [--desc "…"]     use an existing generated clip
//   node character.mjs refresh <name> [--force]                    renew anchors expiring within 6 h
//   node character.mjs status [<name>]
//
// characters/<name>/character.json: { description, anchors: { "4": { id, expiresAt, file, history } },
// frames: [...] }. A video uses it with "characters": { "A": "<name>" } and shots with "set": "A".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASE, DEPLOYMENT, auth, fetch, waitAndSave } from './sora.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const [cmd, name] = argv;
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const dirOf = (n) => path.join(ROOT, 'characters', n);
const load = (n) => JSON.parse(fs.readFileSync(path.join(dirOf(n), 'character.json'), 'utf8'));
const store = (n, c) => { fs.mkdirSync(dirOf(n), { recursive: true }); fs.writeFileSync(path.join(dirOf(n), 'character.json'), JSON.stringify(c, null, 2) + '\n'); };
const NEUTRAL = 'One continuous unedited take: no cuts, no zooms, static camera. Realistic, natural skin, crisp focus, no on-screen text, no logos.';

async function info(id) {
  const r = await fetch(`${BASE}/${id}`, { headers: auth() });
  const j = await r.json();
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
// waits out 429s (the deployment allows ~2 jobs in flight, shared with any other run)
async function submit(body, remixOf) {
  for (let attempt = 0; ; attempt++) {
    try { return await submitOnce(body, remixOf); } catch (e) {
      if (!/HTTP 429/.test(e.message) || attempt > 60) throw e;
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
}
async function submitOnce(body, remixOf) {
  const r = remixOf
    ? await fetch(`${BASE}/${remixOf}/remix`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(body) })
    : await fetch(BASE, { method: 'POST', headers: auth(), body: (() => { const fd = new FormData(); for (const [k, v] of Object.entries(body)) fd.set(k, String(v)); return fd; })() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.id;
}
// reference frames of the first anchor: what the character must keep looking like
function frames(n, file) {
  const out = path.join(dirOf(n), 'frames');
  fs.mkdirSync(out, { recursive: true });
  const list = [0.3, 1.5, 3].map((t, i) => {
    const f = path.join(out, `ref-${i + 1}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', '-q:v', '3', f]);
    return path.relative(dirOf(n), f).replace(/\\/g, '/');
  });
  return list;
}
// mean colour difference of two images at 9×16 (100 = identical): a cheap drift check
function similarity(a, b) {
  const px = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-frames:v', '1', '-vf', 'scale=9:16:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
  const x = px(a), y = px(b);
  let d = 0; for (let i = 0; i < x.length; i++) d += Math.abs(x[i] - y[i]);
  return 100 - (100 * d) / x.length / 255;
}
async function anchorFrom(n, secs, id, extra = {}) {
  const file = path.join(dirOf(n), 'anchors', `${secs}s.mp4`);
  const st = await waitAndSave(id, file, `${n} ${secs}s anchor`);
  return { id, seconds: secs, expiresAt: st.expires_at ?? null, file: path.relative(dirOf(n), file).replace(/\\/g, '/'), createdAt: new Date().toISOString(), ...extra };
}
const hoursLeft = (a) => (a.expiresAt ? (a.expiresAt - Date.now() / 1000) / 3600 : Infinity);

async function main() {
  if (cmd === 'create') {
    const desc = opt('--desc');
    if (!name || !desc) throw new Error('usage: node character.mjs create <name> --desc "<person + place>" [--action "…"] [--seconds 4,8]');
    const action = opt('--action') || 'He stands (or sits) naturally in his place, facing the camera, breathing, with a small relaxed smile; the whole set is visible.';
    const secsList = (opt('--seconds') || '4,8').split(',').map(Number);
    const c = fs.existsSync(path.join(dirOf(name), 'character.json')) ? load(name) : { description: desc, anchors: {} };
    c.description = desc;
    await Promise.all(secsList.map(async (secs) => {
      const id = await submit({ model: DEPLOYMENT, prompt: `${desc}\n\n${action}\n\n${NEUTRAL}`, size: '720x1280', seconds: secs });
      console.log(`${name}: ${secs}s anchor submitted (${id})`);
      c.anchors[secs] = await anchorFrom(name, secs, id, { history: [id] });
    }));
    const first = c.anchors[Math.min(...Object.keys(c.anchors).map(Number))];
    c.frames ??= frames(name, path.join(dirOf(name), first.file));
    store(name, c);
    console.log(`created character ${name}: anchors ${Object.keys(c.anchors).join(', ')}s; reference frames in characters/${name}/frames/`);
  } else if (cmd === 'adopt') {
    const id = opt('--id');
    if (!name || !id) throw new Error('usage: node character.mjs adopt <name> --id video_… [--desc "…"]');
    const j = await info(id);
    const secs = +j.seconds;
    const c = fs.existsSync(path.join(dirOf(name), 'character.json')) ? load(name) : { description: opt('--desc') || '', anchors: {} };
    if (opt('--desc')) c.description = opt('--desc');
    c.anchors[secs] = await anchorFrom(name, secs, id, { history: [id], adopted: true });
    c.frames ??= frames(name, path.join(dirOf(name), c.anchors[secs].file));
    store(name, c);
    console.log(`adopted ${id} as ${name}'s ${secs}s anchor (${hoursLeft(c.anchors[secs]).toFixed(1)} h left)`);
  } else if (cmd === 'refresh') {
    const c = load(name);
    for (const [secs, a] of Object.entries(c.anchors)) {
      if (!argv.includes('--force') && hoursLeft(a) > 6) { console.log(`${name} ${secs}s: ${hoursLeft(a).toFixed(1)} h left, kept`); continue; }
      if (hoursLeft(a) <= 0) throw new Error(`${name} ${secs}s anchor already expired: recreate it (create ${name} --seconds ${secs}) or adopt a good recent clip`);
      const id = await submit({ prompt: 'The exact same video: the same person, clothes, location, lighting, camera framing and action. Change nothing.' }, a.id);
      const next = await anchorFrom(name, secs, id, { history: [...(a.history || [a.id]), id] });
      const ref = path.join(dirOf(name), c.frames[0]), tmp = path.join(dirOf(name), 'anchors', `_check.jpg`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '0.3', '-i', path.join(dirOf(name), next.file), '-frames:v', '1', tmp]);
      next.similarity = +similarity(ref, tmp).toFixed(1);
      fs.rmSync(tmp);
      c.anchors[secs] = next;
      console.log(`${name} ${secs}s: refreshed (${id}), similarity to the original look ${next.similarity}`);
    }
    store(name, c);
  } else if (cmd === 'status') {
    const names = name ? [name] : fs.existsSync(path.join(ROOT, 'characters')) ? fs.readdirSync(path.join(ROOT, 'characters')) : [];
    for (const n of names) {
      const c = load(n);
      console.log(`${n}: ${c.description.slice(0, 80)}…`);
      for (const [secs, a] of Object.entries(c.anchors)) console.log(`  ${secs}s ${a.id}  ${hoursLeft(a) > 0 ? `${hoursLeft(a).toFixed(1)} h left` : 'EXPIRED'}  refreshes ${(a.history?.length || 1) - 1}${a.similarity != null ? `  similarity ${a.similarity}` : ''}`);
    }
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
