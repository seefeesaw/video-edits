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
    try {
      const r = await globalThis.fetch(url, opts);
      if (r.status === 401 && opts?.headers?.authorization && attempt === 0) { opts = { ...opts, headers: { ...opts.headers, ...auth(true) } }; continue; }
      return r;
    }
    catch (e) { if (attempt >= 5) throw e; console.log(`  ${e.message}; retrying in 15s`); await new Promise((r) => setTimeout(r, 15000)); }
  }
};

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'foundry.json'), 'utf8'));
const ENDPOINT = (process.env.AZURE_FOUNDRY_VIDEO_ENDPOINT || cfg.endpoint).replace(/\/+$/, '');
const DEPLOYMENT = process.env.AZURE_FOUNDRY_VIDEO_DEPLOYMENT || cfg.deployment;
export const BASE = `${ENDPOINT}/openai/v1/videos`;
export { DEPLOYMENT };

// az hands out a CACHED token that may have only minutes left: track its real expiry and renew
// with 10 min to spare (a 40-minute timer still hit 401s on long runs); `auth(true)` forces a renewal
let tok = { value: '', exp: 0 };
export function auth(force = false) {
  if (force || Date.now() > tok.exp - 10 * 60e3) {
    const j = JSON.parse(execSync(`az account get-access-token --resource ${cfg.scope} -o json`, { encoding: 'utf8' }));
    tok = { value: j.accessToken, exp: j.expires_on ? j.expires_on * 1000 : Date.parse(j.expiresOn) || Date.now() + 30 * 60e3 };
  }
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

// Continuity bible (bible.mjs): the exact words for every prop of a set, appended to every prompt
// that uses that set, so the objects are described identically in every generation and remix
export function propWords(spec, setId) {
  const set = spec.bible?.sets?.[setId];
  if (!set?.props?.length) return '';
  return `These objects must look exactly like this in every frame (same shape, proportions, colour, material, caps and handles; never swap or restyle them): ${set.props.map((id) => `${id}: ${spec.bible.props[id].desc}`).join('; ')}.`;
}
// the set of a performance that remixes another: the source's set
const setOf = (shot, spec) => shot.set || (shot.remixOf && spec.performances?.find((x) => x.id === shot.remixOf)?.set);

async function remix(shot, spec, ch) {
  const secs = soraSecondsFor(shot.end - shot.start + (shot.from ?? 0));
  const a = ch.anchors?.[secs];
  if (!a) throw new Error(`${shot.id}: character ${ch.name} has no ${secs}s anchor (a remix keeps its source's length): node character.mjs create ${ch.name} --seconds ${secs}`);
  if (a.expiresAt && Date.now() / 1000 > a.expiresAt - 900) throw new Error(`${shot.id}: ${ch.name}'s ${secs}s anchor has expired (Sora keeps videos 24h): node character.mjs refresh ${ch.name}`);
  // identity first: a vague "same person" lets the face drift between remixes
  const prompt = [`Keep exactly the same person as in this video: the identical face (face shape, eyes, eyebrows, nose, mouth, skin tone, facial hair), the same hairline, hair length and hairstyle, the same body and clothes. Do not replace, age or restyle him. Same location, lighting and camera framing. New action for this clip: ${shot.prompt}`, propWords(spec, shot.set), spec.style].filter(Boolean).join('\n\n');
  const r = await fetch(`${BASE}/${a.id}/remix`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${shot.id}: remix HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.id;
}

// A performance that continues another one: remix that performance's chosen take (one hop from a
// face already in the video, instead of one hop per shot from the anchor)
async function remixPerformance(p, spec, dir) {
  // "remixOf": "character:<name>" starts from a library character's anchor (another video of the
  // series): same person; describe the new clothes/props/place in the prompt
  if (p.remixOf.startsWith('character:')) {
    const name = p.remixOf.slice(10), c = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', name, 'character.json'), 'utf8'));
    const a = c.anchors?.[p.seconds];
    if (!a) throw new Error(`${p.id}: ${name} has no ${p.seconds}s anchor (a remix keeps its source's length)`);
    if (a.expiresAt && Date.now() / 1000 > a.expiresAt - 900) throw new Error(`${p.id}: ${name}'s ${p.seconds}s anchor has expired: node character.mjs refresh ${name}`);
    const prompt = [`Keep exactly the same person as in this video: the identical face (face shape, eyes, eyebrows, nose, mouth, skin tone, facial hair), the same hairline, hair length and hairstyle. Do not replace, age or restyle him. Everything else is new and replaces what is in this video: ${p.prompt}`, propWords(spec, p.set), spec.style].filter(Boolean).join('\n\n');
    const r = await fetch(`${BASE}/${a.id}/remix`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${p.id}: remix HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j.id;
  }
  const src = spec.performances.find((x) => x.id === p.remixOf);
  if (!src) throw new Error(`${p.id}: remixOf ${p.remixOf} is not a performance`);
  const clip = (src.clip || `clips/${src.id}.mp4`).replace(/\\/g, '/');
  const idsFile = path.join(dir, 'clips', 'ids.json');
  const id = fs.existsSync(idsFile) ? JSON.parse(fs.readFileSync(idsFile, 'utf8'))[clip]?.id : null;
  if (!id) throw new Error(`${p.id}: no Sora id recorded for ${clip} (generate ${src.id} first and set its "clip")`);
  const prompt = [`Continue with exactly the same person as in this video: the identical face (face shape, eyes, eyebrows, nose, mouth, skin tone, facial hair), the same hairline, hair length and hairstyle, the same body and clothes. Do not replace, age or restyle him. Same location, lighting and camera framing. New actions for this clip: ${p.prompt}`, propWords(spec, setOf(p, spec)), spec.style].filter(Boolean).join('\n\n');
  const r = await fetch(`${BASE}/${id}/remix`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p.id}: remix HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.id;
}

async function create(shot, spec, dir) {
  if (shot.remixOf) return remixPerformance(shot, spec, dir);
  const ch = characterFor(shot, spec);
  if (ch) return remix(shot, spec, ch);
  const fd = new FormData();
  fd.set('model', DEPLOYMENT);
  // "sets": named recurring characters + locations (e.g. the two sides of a contrast video); a shot's
  // "set": "A" adds that exact description, so every shot of a character uses the same words
  // a "screen" shot: the device must stay keyable for build.mjs's composite
  const screenWords = shot.screen && `The device screen stays lit flat, uniform, pure chroma-key green for the whole clip: no picture, no interface, no reflections.${shot.screen.whole ? ' The whole device stays fully inside the frame and uncovered the whole time: static camera, no push-in, no zoom, no pan.' : ''}`;
  fd.set('prompt', [shot.prompt, shot.set && spec.sets?.[shot.set], propWords(spec, shot.set), screenWords, spec.style].filter(Boolean).join('\n\n'));
  fd.set('size', spec.soraSize || '720x1280');
  fd.set('seconds', String(shot.seconds ?? soraSecondsFor(shot.end - shot.start + (shot.from ?? 0))));
  // "startFrom": "set" — begin from the set's people-free bible frame (bible.mjs): the place and
  // every prop are pinned by the first frame; the prompt must have the person step in
  if (shot.startFrom === 'set') {
    const file = path.join(dir, 'bible', `set-${shot.set}.${spec.soraSize || '720x1280'}.png`);
    if (!fs.existsSync(file)) throw new Error(`${shot.id}: bible frame ${path.relative(dir, file)} missing (run bible.mjs)`);
    fd.set('input_reference', new Blob([fs.readFileSync(file)], { type: 'image/png' }), path.basename(file));
  } else if (shot.keyframe) {
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

// a request whose BODY read can also drop ("terminated"): retry the whole request + read
async function reread(url, read, label) {
  for (let attempt = 0; ; attempt++) {
    try { return await read(await fetch(url, { headers: auth() })); }
    catch (e) { if (attempt >= 8) throw new Error(`${label}: ${e.message} (network; the job id is kept in jobs.json, re-run to resume)`); console.log(`  ${label}: ${e.message}; retrying in 15s`); await new Promise((r) => setTimeout(r, 15000)); }
  }
}
export class JobFailed extends Error {}

export async function waitAndSave(id, file, label) {
  const t0 = Date.now();
  let s;
  for (;;) {
    s = await reread(`${BASE}/${id}`, (r) => r.json(), label);
    if (['completed', 'failed', 'cancelled'].includes(s.status)) break;
    await new Promise((x) => setTimeout(x, 10000));
  }
  if (s.status !== 'completed') {
    const hint = /people-in-user-uploads/.test(JSON.stringify(s.error || {})) ? ' — the keyframe shows a person or face (screens included); regenerate it people-free (only hands)' : '';
    throw new JobFailed(`${label}: ${s.status} ${JSON.stringify(s.error || {}).slice(0, 300)}${hint}`);
  }
  const buf = await reread(`${BASE}/${id}/content`, async (v) => { if (!v.ok) throw new Error(`download HTTP ${v.status}`); return Buffer.from(await v.arrayBuffer()); }, label);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
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
  // "performances": long takes that several shots are cut from (the face can't drift inside one
  // clip): { id, set?, prompt (timed actions), seconds, takes?, remixOf?: "<performance id>" }. They
  // land in clips/<id>.mp4 (.vN); shots use them with "takes": 0, "clip": "clips/<id>.mp4", "from".
  const perfShots = (spec.performances || []).map((p) => ({ ...p, start: 0, end: p.seconds, from: 0, seconds: p.seconds }));
  for (const shot of [...perfShots, ...spec.shots]) {
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
      // forget a job only when Sora says it failed; on a network error keep its id so a re-run
      // resumes it instead of paying for a new one
      try { await runOne(w); } catch (e) {
        if (e instanceof JobFailed && pending[w.rel]) { delete pending[w.rel]; saveJobs(); }
        // the input check is flaky: a hands-only keyframe blocked as people-in-user-uploads often
        // passes on the next try (a blocked job costs nothing), so resubmit twice before giving up
        if (e instanceof JobFailed && /people-in-user-uploads/.test(e.message) && w.shot && (w.blocked = (w.blocked || 0) + 1) <= 2) {
          console.log(`  ${w.rel}: blocked by the input check; resubmitting (${w.blocked}/2)`); w.id = null; queue.push(w); continue;
        }
        failed.push(e); console.error(e.message);
      }
    }
  }));
  if (failed.length) { console.error(`${failed.length} job(s) did not finish (see above); re-run the same command to resume`); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
