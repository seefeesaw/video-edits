#!/usr/bin/env node
// Screenshot an HTML file (font specimens, screen fragments): node tools/shot.mjs in.html out.png [width]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [, , input, out, width = '1080'] = process.argv;
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const b = await puppeteer.launch({ executablePath: CHROME });
const p = await b.newPage();
await p.setViewport({ width: +width, height: 600 });
await p.goto(pathToFileURL(path.resolve(input)).href, { waitUntil: 'networkidle0' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: out, fullPage: true });
await b.close();
