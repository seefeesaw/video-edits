#!/usr/bin/env node
// Reality check: is what the camera sees physically possible and consistent? Three layers:
//   node reality.mjs videos/<name>              lint + check the BUILT video shot by shot
//   node reality.mjs videos/<name> --takes s12  check every take of a setup (use before picking)
//   node reality.mjs videos/<name> --lint       static checks only (free, no model call)
//
// Lint (no model): every keyframed shot has a "state" ({start, end}); jump cuts taken from one take play
// its time forward (a later shot taken from an EARLIER moment rewinds the action: poured ice "un-pours").
// The model check (thuma-luna, the vision model on our Foundry) gets the reality rules (lib/reality.mjs),
// the video's own "physics", each shot's stated state, and frame sheets; it reports violations — counts
// or levels that change without an action, objects that appear/vanish/morph, labels that change, hands
// with wrong fingers, floating objects — with the shot and a severity. Results: out/reality.json; the
// built-video check exits 1 when a "high" violation is found.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RULES, stateOf } from './lib/reality.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dir = path.resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--takes') || '');
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'foundry.json'), 'utf8'));
const tmp = path.join(dir, 'out', '_reality');
fs.mkdirSync(tmp, { recursive: true });

// ---- lint ----
const lint = [];
for (const s of spec.shots) {
  if (s.takes && !s.state) lint.push(`${s.id}: no "state" ({start, end}): write the exact physical state (counts, levels, open/closed)`);
}
const byClip = {};
for (const s of spec.shots) if (s.clip || s.takes) (byClip[s.clip || `clips/${s.id}.mp4`] ||= []).push(s);
for (const [clip, ss] of Object.entries(byClip)) {
  let last = null;
  for (const s of ss.filter((x) => !x.reverse)) {
    const t0 = s.from ?? 0;
    if (last && t0 < last.t - 0.05) lint.push(`${s.id}: starts at ${t0}s of ${clip}, BEFORE ${last.id} (${last.t}s) ends: the action rewinds (what was poured un-pours)`);
    last = { id: s.id, t: t0 + (s.end - s.start) * (s.speed ?? 1) - (s.hold ?? 0) * (s.speed ?? 1) };
  }
}
for (const l of lint) console.log(`lint: ${l}`);
if (!lint.length) console.log('lint: ok');
if (argv.includes('--lint')) process.exit(lint.length ? 1 : 0);

const frame = (src, t, out, w = 240) => { execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', Math.max(0, t).toFixed(2), '-i', src, '-frames:v', '1', '-vf', `scale=${w}:-2`, '-q:v', '4', out]); return out; };
const row = (files, out) => { execFileSync('ffmpeg', ['-v', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `hstack=inputs=${files.length}`, '-q:v', '4', out]); return out; };
const b64 = (f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`;
const rules = [...RULES, ...(spec.physics || [])].map((r, i) => `${i + 1}. ${r}`).join('\n');

async function ask(content) {
  const tok = execSync(`az account get-access-token --resource ${cfg.scope} --query accessToken -o tsv`, { encoding: 'utf8' }).trim();
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${cfg.endpoint.replace(/\/+$/, '')}/openai/v1/chat/completions`, {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.REALITY_MODEL || 'thuma-luna', messages: [{ role: 'user', content }], max_completion_tokens: 3000, response_format: { type: 'json_object' } }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return JSON.parse(j.choices[0].message.content);
    if (j?.error?.code === 'content_policy_violation') { const e = new Error('content filter'); e.filtered = true; throw e; }
    if (attempt >= 4 || ![429, 408, 500, 502, 503].includes(r.status)) throw new Error(`reality: HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    await new Promise((x) => setTimeout(x, 15000));
  }
}
const ROLE = `You are a strict physical-continuity and realism inspector for a short product video that must look filmed in real life, not AI-generated. Hard rules:\n${rules}\nReport every violation you can see. On-screen caption text and emoji (the video's title overlay, added in editing) are not physical objects: ignore them. Clear water in a clear bottle or glass is nearly invisible: judge its level by the water line, bubbles and refraction, and only flag a level that visibly CHANGES without an action. Severity "high" = a viewer would notice something impossible or inconsistent (a count or level that changes without an action, an object that appears, vanishes or morphs, a label that changes, a deformed hand); "low" = subtle.`;

if (argv.includes('--takes')) {
  const id = argv[argv.indexOf('--takes') + 1];
  const s = spec.shots.find((x) => x.id === id);
  if (!s) throw new Error(`no shot ${id}`);
  const takes = fs.readdirSync(path.join(dir, 'clips')).filter((f) => f === `${id}.mp4` || (f.startsWith(`${id}.v`) && f.endsWith('.mp4')));
  // the whole span the video uses from this take: this shot and the jump cuts cut from it
  const users = spec.shots.filter((x) => x === s || (x.takes === 0 && x.clip?.startsWith(`clips/${id}.`)));
  const span = [Math.min(...users.map((u) => u.from ?? 0)), Math.max(...users.map((u) => (u.from ?? 0) + (u.end - u.start) * (u.speed ?? 1)))];
  const st = stateOf(spec, s);
  const content = [{ type: 'text', text: `${ROLE}\nBelow are ${takes.length} takes of the same shot, each a row of 6 frames in time order (${span[0].toFixed(1)}-${span[1].toFixed(1)} s). The action: ${s.prompt}\nState at start: ${st?.start || '(not given)'}\nState at end: ${st?.end || '(not given)'}\nFor each take list the violations (what, at which frame 1-6, severity) and give a realism score 0-10 (10 = nothing impossible, matches the stated states). Return JSON only: {"takes":[{"take":"<file>","score":0,"violations":[{"frame":1,"what":"","severity":"high|low"}]}]}` }];
  for (const [i, f] of takes.entries()) {
    const fs6 = Array.from({ length: 6 }, (_, k) => frame(path.join(dir, 'clips', f), span[0] + ((k + 0.5) / 6) * (span[1] - span[0]), path.join(tmp, `t${i}_${k}.jpg`)));
    content.push({ type: 'text', text: `TAKE "${f}"` }, { type: 'image_url', image_url: { url: b64(row(fs6, path.join(tmp, `take${i}.jpg`))) } });
  }
  const res = (await ask(content)).takes.sort((a, b) => b.score - a.score);
  for (const t of res) console.log(`${t.take.padEnd(12)} realism ${t.score}/10${t.violations?.length ? '\n' + t.violations.map((v) => `   [${v.severity}] frame ${v.frame}: ${v.what}`).join('\n') : ''}`);
  s.reality = Object.fromEntries(res.map((t) => [t.take, t.score]));
  fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify(spec, null, 2) + '\n');
} else {
  // the built video: for every shot, its first and last frame next to the previous shot's last frame,
  // in batches so the model sees the whole chain of states
  const file = path.join(dir, 'out', `${path.basename(dir)}.mp4`);
  if (!fs.existsSync(file)) throw new Error('no build: run build.mjs first');
  const all = [];
  // the model's content filter sometimes refuses a harmless batch (a false positive): check that batch
  // shot by shot, and report a shot it still refuses as unchecked instead of failing the whole run
  const runBatch = async (batch) => {
    const content = [{ type: 'text', text: `${ROLE}\nBelow are consecutive shots of the finished video. For each shot: a row of 3 frames (first, middle, last). A cut may change the camera angle (e.g. top-down), the distance, or cut away to another object (the bottle while it is opened): that is normal editing, not a violation — the stated state of each shot says what is in frame. What must carry over is the PHYSICAL STATE of the same objects (what was poured into the glass stays in it, counts and levels never drop by themselves, the same glass, bottle and lid). Check each shot on its own AND against the shots before it. Return JSON only: {"violations":[{"shot":"<id>","what":"","severity":"high|low"}]}` }];
    for (const s of batch) {
      const st = stateOf(spec, s, { slot: true });
      const ts = [s.start + 0.03, (s.start + s.end) / 2, s.end - 0.04];
      const fr = ts.map((t, k) => frame(file, t, path.join(tmp, `${s.id}_${k}.jpg`), 200));
      content.push({ type: 'text', text: `SHOT ${s.id} (${s.start.toFixed(2)}-${s.end.toFixed(2)} s)${st ? ` — stated state: start "${st.start}", end "${st.end}"` : ''}` }, { type: 'image_url', image_url: { url: b64(row(fr, path.join(tmp, `${s.id}.jpg`))) } });
    }
    return (await ask(content)).violations || [];
  };
  for (let b = 0; b < spec.shots.length; b += 8) {
    const batch = spec.shots.slice(b, b + 8);
    try { all.push(...await runBatch(batch)); }
    catch (e) {
      if (!e.filtered) throw e;
      for (const s of batch) {
        try { all.push(...await runBatch([s])); }
        catch (e2) { if (!e2.filtered) throw e2; all.push({ shot: s.id, what: "not checked: the vision model's content filter refused this shot's frames (check it by eye)", severity: 'low' }); }
      }
    }
  }
  fs.writeFileSync(path.join(dir, 'out', 'reality.json'), JSON.stringify({ lint, violations: all }, null, 2));
  for (const v of all) console.log(`[${v.severity}] ${v.shot}: ${v.what}`);
  const high = all.filter((v) => v.severity === 'high');
  console.log(`reality: ${high.length} high, ${all.length - high.length} low (out/reality.json)`);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (high.length || lint.length) process.exit(1);
}
fs.rmSync(tmp, { recursive: true, force: true });
