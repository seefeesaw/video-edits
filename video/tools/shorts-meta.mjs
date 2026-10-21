#!/usr/bin/env node
// Titles, descriptions and tags for finished Shorts. Writes videos/<name>/out/meta.json for each
// video and one combined sheet (videos/SHORTS-METADATA.md + .csv) to copy into YouTube.
//   node tools/shorts-meta.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const STORE = 'https://meltiemug.com/products/mini-fondue-mug';
const COLOUR = { brown: 'chocolate brown', red: 'red', white: 'white' };

// [video, variant, setting (where it happens), title, opening line, theme]
// theme: gift = Christmas gift / movie night, hp = Harry Potter season, xmas = Christmas movie night
const V = [
  ['gift-red', 'red', 'in a cosy living room', 'The perfect Christmas movie night gift 🍫🎬', 'Are you free December 25? Bring the marshmallows.', 'gift'],
  ['gift-white', 'white', 'on a sitting-room coffee table', 'Movie night, but make it fondue 🍫', 'A whole chocolate fondue in one little mug, right on the coffee table.', 'gift'],
  ['oneshot-giftred', 'red', 'on a bedroom desk', 'Christmas night plans: sorted 🍫', 'Malt balls in, tealight lit, movie on.', 'gift'],
  ['oneshot-giftwhite', 'white', 'on a breakfast-in-bed tray', 'Chocolate fondue in bed? Yes please 🍫', 'The cosiest way to spend December 25 under the duvet.', 'gift'],
  ['love-brown', 'brown', 'on the dining table', 'Officially Harry Potter season 🍂🪄', 'When the nights get cozy, the fondue mug comes out.', 'hp'],
  ['oneshot-lovered', 'red', 'on a tray on the sofa', 'Harry Potter marathon snack sorted 🪄🍫', 'Sofa, blanket, strawberries dipped in melted chocolate.', 'hp'],
  ['oneshot2-lovewhite', 'white', 'on a rainy window seat', 'Rainy night + chocolate fondue 🌧️🍫', 'A window seat, a film and a mug of melted chocolate.', 'hp'],
  ['r01-brown-kitchen', 'brown', 'on the kitchen island', 'Crisp air = Harry Potter season 🍁⚡', "When the air turns crisp it's finally Harry Potter season.", 'hp'],
  ['r02-red-bedside', 'red', 'on the bedside table', 'Cold outside, fondue inside 🍂🦉', "When it's cold outside it feels like Harry Potter season again.", 'hp'],
  ['r03-white-fireplace', 'white', 'on a coffee table by the fire', 'Fireside fondue for Harry Potter season 🌙🪄', "When the evenings get darker it's Harry Potter season at last.", 'hp'],
  ['r04-brown-study', 'brown', 'on a study desk', 'Sweater weather study break 🧣🍫', 'Sweater weather means Harry Potter season, officially.', 'hp'],
  ['r05-red-floor', 'red', 'at a floor picnic by the sofa', 'Rainy day floor picnic 🌧️🍫', "When the rain starts it feels like it's Harry Potter season.", 'hp'],
  ['r06-white-nook', 'white', 'in a breakfast nook', 'First frost fondue ❄️🍫', "When the first frost hits it's suddenly Harry Potter season.", 'hp'],
  ['r07-brown-ottoman', 'brown', 'on an ottoman tray', 'Candles out, fondue on 🕯️🍫', "When the candles come out it's officially Harry Potter season.", 'hp'],
  ['r08-red-attic', 'red', 'on an attic loft desk', 'Autumn is here: Harry Potter season 🍁🪄', "When autumn finally arrives it's Harry Potter season again.", 'hp'],
  ['r09-white-sunroom', 'white', 'on a sunroom side table', 'Longer nights, more fondue 🌙🍫', 'When the nights get longer it feels like Harry Potter season.', 'hp'],
  ['r10-brown-library', 'brown', 'on a library side table', 'Blanket weather + chocolate fondue 🧶🍫', "When it's cozy blanket weather it's time for Harry Potter season.", 'hp'],
  ['m3r01-red-vanity', 'red', 'on the dressing table', 'Movie night season is coming 🎬🍫', 'Movie night season is coming and this mug is ready.', 'xmas'],
  ['m3r02-white-floor', 'white', 'on a low floor table', 'Cozy film season is here 🍫', 'Floor cushions, a film and melted chocolate.', 'xmas'],
  ['m3r03-brown-bar', 'brown', 'on the breakfast bar', 'Holiday movie season is back 🎄🍫', 'Holiday movie season is back, and so is the fondue.', 'xmas'],
  ['m3r04-red-xmas', 'red', 'on a festive dining table', 'Christmas film season is coming 🎄🎬', 'Christmas film season is coming: garland up, fondue on.', 'xmas'],
  ['m3r05-white-bench', 'white', 'on the bench at the foot of the bed', 'Home movie season is here 🍫🛏️', 'Home movie season is here. Blankets, a film and chocolate fondue.', 'xmas'],
  ['m3r06-brown-media', 'brown', 'in the media room', 'Snowy night movie season ❄️🎬', 'Snowy night season is coming. Movie room, fondue ready.', 'xmas'],
  ['m3r07-red-farm', 'red', 'on a farmhouse kitchen table', 'Festive film season is back 🎄🍫', 'Festive film season is back on the farmhouse table.', 'xmas'],
  ['m3r08-white-cabin', 'white', 'on a log cabin coffee table', 'Cozy cabin movie night 🪵🍫', 'Cozy movie season is coming. Cabin, lantern, fondue.', 'xmas'],
  ['m3r09-brown-city', 'brown', 'in a city apartment', 'City lights + chocolate fondue 🌃🍫', 'Holiday film season is here, high above the city.', 'xmas'],
  ['m3r10-red-boho', 'red', 'in a boho living room', 'Fireside movie season 🔥🍫', 'Fireside movie season is coming. Plants, rattan and melted chocolate.', 'xmas'],
];

const THEME_TAGS = {
  gift: ['#christmas', '#christmasgift', '#giftidea', '#movienight'],
  hp: ['#harrypotter', '#fallvibes', '#movienight', '#cozyathome'],
  xmas: ['#christmas', '#holidaymovies', '#movienight', '#cozyathome'],
};
const THEME_KEYWORDS = {
  gift: ['christmas gift idea', 'christmas movie night', 'gift for her', 'stocking stuffer'],
  hp: ['harry potter season', 'harry potter marathon', 'fall vibes', 'autumn night in'],
  xmas: ['christmas movie night', 'holiday movies', 'christmas at home', 'winter night in'],
};

const rows = [];
for (const [name, variant, place, title, line, theme] of V) {
  const dir = path.join(ROOT, 'videos', name);
  if (!fs.existsSync(path.join(dir, 'out', `${name}.mp4`))) { console.warn(`skip ${name}: no build`); continue; }
  const hashtags = ['#fondue', '#chocolatefondue', ...THEME_TAGS[theme], '#meltiemug', '#shorts'];
  const description = [
    line,
    '',
    `The ${COLOUR[variant]} Meltie Mini Fondue Mug ${place}: malt balls in, tealight lit, ${theme === 'gift' ? 'waffles and marshmallows' : 'strawberries'} dipped and dripping. ` +
      'A mini chocolate fondue in one mug for movie nights, cosy evenings and gifts.',
    '',
    `Get the Meltie Mini Fondue Mug: ${STORE}`,
    '',
    hashtags.join(' '),
  ].join('\n');
  const tags = ['chocolate fondue', 'fondue mug', 'mini fondue mug', 'meltie mug', `${variant} fondue mug`,
    'chocolate fondue at home', 'movie night snacks', 'cozy night in', ...THEME_KEYWORDS[theme], 'shorts'];
  const meta = { title, description, tags, hashtags, variant, setting: place };
  if (meta.title.length > 100) throw new Error(`${name}: title over 100 characters`);
  if (tags.join(',').length > 500) throw new Error(`${name}: tags over YouTube's 500 characters`);
  fs.writeFileSync(path.join(dir, 'out', 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  rows.push({ name, ...meta });
}

const md = ['# Shorts titles, descriptions and tags', '',
  'Generated by `node tools/shorts-meta.mjs`; each video also has `videos/<name>/out/meta.json`.', ''];
for (const r of rows) {
  md.push(`## ${r.name}`, '', `**Title:** ${r.title}`, '', '**Description:**', '', '```', r.description, '```', '',
    `**Tags:** ${r.tags.join(', ')}`, '');
}
fs.writeFileSync(path.join(ROOT, 'videos', 'SHORTS-METADATA.md'), md.join('\n'));
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(ROOT, 'videos', 'SHORTS-METADATA.csv'),
  ['video,file,title,description,tags', ...rows.map((r) => [r.name, `videos/${r.name}/out/${r.name}.mp4`, r.title, r.description, r.tags.join(', ')].map(q).join(','))].join('\n') + '\n');
console.log(`wrote meta.json for ${rows.length} videos, videos/SHORTS-METADATA.md and .csv`);
