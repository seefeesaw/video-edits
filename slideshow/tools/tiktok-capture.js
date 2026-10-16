// Paste/run in a browser tab showing a TikTok photo post (e.g. the in-app browser's
// javascript tool). Returns JSON for `node new-post.mjs <name> <capture.json>`.
// It only reads what the page already shows; it does not call TikTok APIs.
(() => {
  const slides = [...new Set([...document.querySelectorAll('img')].map((i) => i.src).filter((s) => s.includes('photomode')))];
  const desc = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]')?.innerText?.replace(/\s*\n\s*/g, ' ').trim() || '';
  const music = document.querySelector('[data-e2e="browse-music"], [data-e2e="video-music"]')?.innerText?.trim() || '';
  return JSON.stringify({ source: location.href.split('?')[0], title: document.title.replace(/ \| TikTok$/, ''), caption: desc, music, slides }, null, 2);
})();
