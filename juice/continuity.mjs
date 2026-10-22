#!/usr/bin/env node
// Continuity check: ranks the takes of a performance (or shot) by how well they keep everything
// that must not change — the person's face and outfit, every prop, the set — against the
// references, using the vision model on our Foundry (thuma-luna). Judging takes side by side is
// far more reliable than scoring one image alone (a lone pair of faces gets a lenient 8/10).
//
//   node continuity.mjs videos/<name> --takes A2 [--apply]
//
// References: the bible's set frame and prop images (bible.mjs) for the take's set, plus a face
// reference: the chosen take of the performance it remixes (remixOf), the performance a shot is cut
// from, or the library character's frames (characters/<name>/frames). Each take is shown as a 2×2
// sheet of frames from the span it is used for. --apply sets "clip" to the winner (not over a
// "pick": "manual" choice). Scores are written to <perf>.continuity in video.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dir = path.resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--takes') || '');
const id = argv[argv.indexOf('--takes') + 1];
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'foundry.json'), 'utf8'));
const perf = (spec.performances || []).find((p) => p.id === id);
const item = perf || spec.shots.find((s) => s.id === id);
if (!item) throw new Error(`no performance or shot ${id}`);
const setId = item.set || (perf?.remixOf && spec.performances.find((p) => p.id === perf.remixOf)?.set);
const tmp = path.join(dir, 'out', '_continuity');
fs.mkdirSync(tmp, { recursive: true });
const b64 = (f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`;
const jpg = (src, out, w = 360) => { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:-2`, '-q:v', '4', out]); return out; };
// a 2×2 sheet of 4 frames between from and from+len of a clip
function sheet(clip, from, len, out) {
  const ts = [0.1, 0.37, 0.63, 0.9].map((k) => from + k * len);
  const parts = ts.map((t, i) => { const f = path.join(tmp, `_f${i}.jpg`); execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', clip, '-frames:v', '1', '-vf', 'scale=270:480', f]); return f; });
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...parts.flatMap((p) => ['-i', p]), '-filter_complex', '[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack', '-q:v', '4', out]);
  return out;
}

// references
const refs = [];
const bdir = path.join(dir, 'bible');
if (setId && fs.existsSync(path.join(bdir, `set-${setId}.png`))) refs.push(['the set (empty, before the person steps in): place, layout and props', jpg(path.join(bdir, `set-${setId}.png`), path.join(tmp, 'set.jpg'))]);
for (const pid of spec.bible?.sets?.[setId]?.props || []) {
  const f = path.join(bdir, `prop-${pid}.png`);
  if (fs.existsSync(f)) refs.push([`prop "${pid}": ${spec.bible.props[pid].desc}`, jpg(f, path.join(tmp, `prop-${pid}.jpg`), 240)]);
}
const faceSrc = perf?.remixOf ? spec.performances.find((p) => p.id === perf.remixOf) : !perf && item.performance ? spec.performances.find((p) => p.id === item.performance) : null;
if (faceSrc) {
  const clip = path.join(dir, faceSrc.clip || `clips/${faceSrc.id}.mp4`);
  refs.push([`the person and objects as already established in this video (chosen take of ${faceSrc.id})`, sheet(clip, 0, faceSrc.seconds || 12, path.join(tmp, 'face.jpg'))]);
  // state carries over: what the containers hold, spills, mess at the END of the source take
  const L = faceSrc.seconds || 12;
  refs.push([`the END of ${faceSrc.id} (last 2 s): the state this take must continue from (contents of every container, spills, mess)`, sheet(clip, L - 2.2, 2, path.join(tmp, 'state.jpg'))]);
} else if (item.set && spec.characters?.[item.set]) {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', spec.characters[item.set], 'character.json'), 'utf8'));
  refs.push([`the person (library character ${spec.characters[item.set]})`, jpg(path.join(ROOT, 'characters', spec.characters[item.set], c.frames[0]), path.join(tmp, 'char.jpg'))]);
}

// candidates
const takes = fs.readdirSync(path.join(dir, 'clips')).filter((f) => f === `${id}.mp4` || (f.startsWith(`${id}.v`) && f.endsWith('.mp4')));
if (!takes.length) throw new Error(`no takes of ${id} in clips/`);
const from = perf ? 0 : item.from ?? 0, len = perf ? perf.seconds : (item.end - item.start) * (item.speed ?? 1);
const cands = takes.map((f, i) => [f, sheet(path.join(dir, 'clips', f), from, len, path.join(tmp, `take${i}.jpg`))]);

// a person is only judged when there is one to judge (a performance, a library character, a remix
// source); hands-and-product shots score the props and set only (a missing face scored a free 10)
const hasPerson = !!(perf || faceSrc || (item.set && spec.characters?.[item.set]));
const elements = [...(hasPerson ? ['face', 'hair', 'outfit'] : []), ...(spec.bible?.sets?.[setId]?.props || []), 'set', ...(faceSrc && perf ? ['state'] : [])];
const content = [
  { type: 'text', text: `You are a strict film continuity supervisor. Below are REFERENCE images, then ${cands.length} CANDIDATE takes (each a 2x2 sheet of frames over time). Score every candidate 0-10 for how exactly it keeps each element identical to the references: ${elements.join(', ')}. Be harsh: a different skin tone, face shape, beard, hair length or hairstyle is a different person (face <= 4); a prop with a different shape, size, colour, cap or material is <= 4; an element that changes between the frames of one take also loses points. "state" (when present) is whether the take CONTINUES the end of the source take: same contents in every container, same spills and mess (an empty or clean jar after it was full is <= 2). Score only continuity, not the action. Return JSON only: {"takes":[{"take":"<file>","scores":{${elements.map((e) => `"${e}":0`).join(',')}},"issues":"<short>"}]}` },
  ...refs.flatMap(([label, f]) => [{ type: 'text', text: `REFERENCE: ${label}` }, { type: 'image_url', image_url: { url: b64(f) } }]),
  ...cands.flatMap(([f, img]) => [{ type: 'text', text: `CANDIDATE take "${f}"` }, { type: 'image_url', image_url: { url: b64(img) } }]),
];
const tok = execSync(`az account get-access-token --resource ${cfg.scope} --query accessToken -o tsv`, { encoding: 'utf8' }).trim();
const r = await fetch(`${cfg.endpoint.replace(/\/+$/, '')}/openai/v1/chat/completions`, {
  method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model: process.env.CONTINUITY_MODEL || 'thuma-luna', messages: [{ role: 'user', content }], max_completion_tokens: 2000, response_format: { type: 'json_object' } }),
});
const j = await r.json();
if (!r.ok) throw new Error(`continuity: HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
const res = JSON.parse(j.choices[0].message.content).takes;
// people elements weigh double: a wrong face breaks the video, a slightly different bowl may not
const weight = (e) => (['face', 'hair', 'outfit'].includes(e) ? 2 : 1);
for (const t of res) t.total = +(Object.entries(t.scores).reduce((a, [e, v]) => a + v * weight(e), 0) / Object.keys(t.scores).reduce((a, e) => a + weight(e), 0)).toFixed(2);
res.sort((a, b) => b.total - a.total);
for (const t of res) console.log(`${t.take.padEnd(12)} ${t.total.toFixed(2)}  ${Object.entries(t.scores).map(([e, v]) => `${e} ${v}`).join('  ')}${t.issues ? `  — ${t.issues}` : ''}`);
item.continuity = Object.fromEntries(res.map((t) => [t.take, { total: t.total, ...t.scores }]));
if (argv.includes('--apply')) {
  if (item.pick === 'manual' && !perf) console.log(`${id}: "pick": "manual", clip kept (${item.clip})`);
  else { item.clip = `clips/${res[0].take}`; console.log(`${id}: clip = ${item.clip}`); }
}
fs.writeFileSync(path.join(dir, 'video.json'), JSON.stringify(spec, null, 2) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
