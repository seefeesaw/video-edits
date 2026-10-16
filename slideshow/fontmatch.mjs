#!/usr/bin/env node
// Ranks Google Fonts by how well they reproduce measured text ink boxes.
//
//   node fontmatch.mjs '[["ENTER",440,90],["MARKS",459,90],["PACKAGE",632,90]]' [--set display|text|all] [--fonts "Inter:700,Sora:600"]
//
// Each sample is [text, inkWidth, inkHeight] measured on the reference (e.g. with review.layout).
// Score = mean |log(fontAspect / refAspect)| over samples (0 = perfect). Lower is better; the
// winner still needs auto-fit (size + letter-spacing), this only picks the family/weight.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const SETS = {
  display: ['Rammetto One', 'Paytone One', 'Bagel Fat One', 'Titan One', 'Lilita One', 'Luckiest Guy', 'Chewy', 'Sniglet:800', 'Fredoka:700', 'Fredoka:600', 'Baloo 2:800', 'Baloo 2:700', 'Grandstander:900', 'DynaPuff:700', 'Coiny', 'Mochiy Pop One', 'Mochiy Pop P One', 'Modak', 'Gluten:900', 'Concert One', 'Bubblegum Sans', 'Sour Gummy:800', 'Bowlby One', 'Rubik:900', 'Archivo Black', 'Dela Gothic One', 'Chango', 'Bungee', 'Galindo', 'Gasoek One', 'Shrikhand', 'Changa One', 'Righteous', 'Lexend:900', 'Poppins:900', 'Nunito:900', 'Varela Round', 'M PLUS Rounded 1c:900', 'Kavoon', 'Spicy Rice', 'Darumadrop One', 'Lemon', 'Carter One', 'Passion One:700', 'Bubbler One', 'Londrina Solid:900', 'Patua One', 'Alfa Slab One', 'Anton', 'Bebas Neue', 'Rowdies:700', 'Rubik Mono One', 'Climate Crisis', 'Unbounded:900', 'Sniglet:400', 'Cherry Bomb One', 'Kablammo', 'Rammetto One'],
  text: ['Inter:400', 'Inter:500', 'Inter:600', 'Inter:700', 'Inter:800', 'Poppins:400', 'Poppins:500', 'Poppins:600', 'Poppins:700', 'Montserrat:500', 'Montserrat:600', 'Montserrat:700', 'Sora:400', 'Sora:600', 'Lexend:400', 'Lexend:600', 'Outfit:500', 'Outfit:600', 'DM Sans:500', 'DM Sans:700', 'Manrope:600', 'Manrope:700', 'Figtree:600', 'Kumbh Sans:600', 'Urbanist:600', 'Plus Jakarta Sans:600', 'Rubik:500', 'Rubik:600', 'Nunito:700', 'Nunito Sans:700', 'Open Sans:600', 'Open Sans:700', 'Roboto:500', 'Roboto:700', 'Lato:700', 'Work Sans:600', 'Mulish:700', 'Raleway:600', 'Quicksand:600', 'Quicksand:700', 'Kanit:500', 'Kanit:600', 'Prompt:500', 'Prompt:600', 'League Spartan:600', 'Archivo:600', 'Archivo:700', 'Be Vietnam Pro:600', 'Red Hat Display:600', 'Albert Sans:600', 'Golos Text:600', 'Onest:600', 'TikTok Sans:600', 'TikTok Sans:700', 'Glacial Indifference', 'Arimo:700', 'Karla:700', 'Hind:600', 'Heebo:600', 'Readex Pro:500', 'Lexend Deca:500', 'IBM Plex Sans:600', 'Source Sans 3:600', 'PT Sans:700', 'Barlow:600', 'Josefin Sans:600', 'Libre Franklin:600', 'Public Sans:600', 'Sen:700', 'Space Grotesk:600'],
};

const argv = process.argv.slice(2);
const samples = JSON.parse(argv[0]);
const setName = argv.includes('--set') ? argv[argv.indexOf('--set') + 1] : 'all';
let fonts = argv.includes('--fonts') ? argv[argv.indexOf('--fonts') + 1].split(',') : setName === 'all' ? [...SETS.display, ...SETS.text] : SETS[setName];
fonts = [...new Set(fonts)];
const fam = (f) => f.split(':')[0];
const families = [...new Set(fonts.map(fam))];
const link = 'https://fonts.googleapis.com/css2?' + families.map((f) => 'family=' + f.replace(/ /g, '+') + ':wght@100..900').join('&') + '&display=block';
const linkStatic = 'https://fonts.googleapis.com/css2?' + families.map((f) => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=block';

const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const b = await puppeteer.launch({ executablePath: CHROME });
const p = await b.newPage();
// Variable-axis request fails for static-only families, so load both forms; one of them resolves.
await p.setContent(`<link rel=stylesheet href="${link}"><link rel=stylesheet href="${linkStatic}">` + fonts.map((f) => `<span style="font-family:'${fam(f)}';font-weight:${f.split(':')[1] || 400}">Ag</span>`).join(''), { waitUntil: 'networkidle0' });
await p.evaluate(() => document.fonts.ready);
const res = await p.evaluate((fonts, samples) => {
  const c = document.createElement('canvas'); c.width = 4000; c.height = 320; const g = c.getContext('2d');
  const ink = (font, w, t) => {
    g.clearRect(0, 0, 4000, 320); g.font = `${w} 120px '${font}'`; g.fillText(t, 40, 230);
    const d = g.getImageData(0, 0, 4000, 320).data; let a = 1e9, b = 1e9, cc = -1, dd = -1;
    for (let y = 0; y < 320; y++) for (let x = 0; x < 4000; x++) if (d[(y * 4000 + x) * 4 + 3] > 128) { if (x < a) a = x; if (y < b) b = y; if (x > cc) cc = x; if (y > dd) dd = y; }
    return [cc - a + 1, dd - b + 1];
  };
  return fonts.map((f) => {
    const [n, w = '400'] = f.split(':');
    if (!document.fonts.check(`${w} 20px '${n}'`)) return [9, f + ' (not loaded)'];
    const r = samples.map(([t, tw, th]) => { const [iw, ih] = ink(n, w, t); return (iw / ih) / (tw / th); });
    const err = r.reduce((s, v) => s + Math.abs(Math.log(v)), 0) / r.length;
    return [err, `${err.toFixed(3)}  ${f.padEnd(26)} ${r.map((v) => v.toFixed(2)).join(' ')}`];
  }).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}, fonts, samples);
console.log('score  font                       aspect ratio vs reference per sample');
console.log(res.slice(0, +(process.env.TOP || 15)).join('\n'));
await b.close();
