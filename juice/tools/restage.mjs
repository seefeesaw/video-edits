#!/usr/bin/env node
// Restage a replica: the same video (shots, timing, actions, captions' places) with another product
// variant, another home setting and a reworded hook. Fills a template's {{placeholders}} from a run
// file and sets up the new video folder, so each restaged version starts from the latest fixed spec.
//
//   node tools/restage.mjs templates/<video>.json videos/<name> runs/<run>.json [--from videos/<prev>]
//
// run.json: {
//   "title": "…", "notes": "…",
//   "brand": "<brand>", "variant": "<variant>",                 (products/<brand>/variants.json + photos)
//   "reference": "videos/<capture>",                           (reference.json + out/ref-*.jpg come from here)
//   "hook": ["line 1", "line 2", "🍂🪄🕯️✨"],
//   "setting": {
//     "surface": "kitchen island counter",                     ({{surface}}: what everything stands on)
//     "behind": "the dim kitchen cabinets behind",             ({{behind}}: the background, in shot 1)
//     "style": "…", "setDesc": "…", "layoutTail": "…",         (whole-video style, bible set, set layout end)
//     "props": { "<id>": { "desc": "…" } }                     (the setting's own bible props)
//   }
// }
// --from videos/<prev>: copy prop/screen images whose descriptions are word for word the same as in
// <prev> (with their bible/made.json records), so only the new setting's images are made.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--from');
const [tplFile, dstArg, runFile] = pos;
if (!runFile) throw new Error('usage: node tools/restage.mjs <template.json> videos/<name> <run.json> [--from videos/<prev>]');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
// products/<brand>/variants.json: { "name": "<product name>", "variants": { "<id>": { "word": "…",
//   "photos": ["front.png", …] (in products/<brand>/<id>/), "desc": "<exact product words>",
//   …any other {{placeholder}} words the template uses } } }
const brandFile = path.join(root, 'products', run.brand || '', 'variants.json');
if (!run.brand || !fs.existsSync(brandFile)) throw new Error(`run file needs "brand" with products/<brand>/variants.json (looked for ${brandFile})`);
const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
const v = brand.variants[run.variant];
if (!v) throw new Error(`variant must be one of ${Object.keys(brand.variants).join(', ')}`);
const dst = path.resolve(dstArg);
const from = argv.includes('--from') ? path.resolve(argv[argv.indexOf('--from') + 1]) : null;

const S = run.setting;
const words = {
  // every variant field is a placeholder ({{word}}, {{WORD}} upper-cased, plus the brand's own fields)
  ...Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')), WORD: v.word.toUpperCase(),
  surface: S.surface, behind: S.behind, layoutTail: S.layoutTail,
  hook1: run.hook[0], hook2: run.hook[1], emoji: run.hook[2],
  title: run.title, notes: run.notes, style: S.style, setDesc: S.setDesc,
};
const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (!(k in words)) throw new Error(`template placeholder ${m} has no value in the run file`);
  return words[k];
});
const walk = (x) => (typeof x === 'string' ? fill(x) : Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x);

const tpl = JSON.parse(fs.readFileSync(tplFile, 'utf8'));
// objects the template can't hold as strings
const product = { name: `${brand.name}, ${v.word}`, refs: v.photos.map((p) => `assets/product/${p}`), description: v.desc };
tpl.product = product;
// the template's product prop (bible.props.product) is the store photo itself
if (tpl.bible?.props) tpl.bible.props.product = { image: `assets/product/${v.photos[0]}`, desc: v.desc };
const spec = walk(tpl);
for (const [id, p] of Object.entries(S.props || {})) spec.bible.props[id] = p;
spec.bible.sets.A.props = [...new Set([...spec.bible.sets.A.props, ...Object.keys(S.props || {})])];

fs.mkdirSync(path.join(dst, 'out'), { recursive: true });
fs.mkdirSync(path.join(dst, 'bible'), { recursive: true });
fs.mkdirSync(path.join(dst, 'assets', 'product'), { recursive: true });
fs.writeFileSync(path.join(dst, 'video.json'), JSON.stringify(spec, null, 2) + '\n');
for (const p of v.photos) fs.copyFileSync(path.join(root, 'products', run.brand, run.variant, p), path.join(dst, 'assets', 'product', p));
const ref = path.resolve(root, run.reference);
fs.copyFileSync(path.join(ref, 'reference.json'), path.join(dst, 'reference.json'));
for (const f of ['ref-shots.jpg', 'ref-every.jpg']) if (fs.existsSync(path.join(ref, 'out', f))) fs.copyFileSync(path.join(ref, 'out', f), path.join(dst, 'out', f));

// reuse identical prop/screen images from the previous restage (with their made.json records)
const reused = [];
if (from) {
  const prev = JSON.parse(fs.readFileSync(path.join(from, 'video.json'), 'utf8'));
  const made = fs.existsSync(path.join(from, 'bible', 'made.json')) ? JSON.parse(fs.readFileSync(path.join(from, 'bible', 'made.json'), 'utf8')) : {};
  const keep = {};
  const same = (kind, id, a, b) => {
    const f = `${kind}-${id}.png`;
    if (!a || !b || a.image || a.desc !== b.desc || !fs.existsSync(path.join(from, 'bible', f)) || made[f] === undefined) return;
    fs.copyFileSync(path.join(from, 'bible', f), path.join(dst, 'bible', f));
    keep[f] = made[f]; reused.push(f);
  };
  for (const [id, p] of Object.entries(spec.bible.props)) same('prop', id, p, prev.bible?.props?.[id]);
  for (const [id, p] of Object.entries(spec.bible.screens || {})) same('screen', id, p, prev.bible?.screens?.[id]);
  fs.writeFileSync(path.join(dst, 'bible', 'made.json'), JSON.stringify(keep, null, 2));
}
const left = JSON.stringify(spec).match(/\{\{\w+\}\}/g);
if (left) throw new Error(`unfilled placeholders: ${[...new Set(left)].join(' ')}`);
console.log(`restaged ${path.relative(process.cwd(), dst)}: ${v.word} ${brand.name}, on the ${S.surface}; hook "${run.hook[0]} / ${run.hook[1]}"${reused.length ? `; reused ${reused.join(', ')}` : ''}`);
console.log(`next: node bible.mjs → keyframes.mjs (Read the sheet) → sora.mjs → compare --pick, by-eye picks, --framing, --apply → build.mjs`);
