// Run in a browser tab showing a TikTok photo post (e.g. the in-app browser's javascript tool),
// after setting the post name on the first line. It reads only what the page already shows (no
// TikTok API calls), then hands the JSON to the local review server: TikTok's CSP blocks fetches to
// localhost but not navigation, so it navigates to save.html, which writes
// slideshow/posts/<name>/capture.json and returns to the post. Then: node new-post.mjs <name>
// (Set NAME to null to just return the JSON string instead.)
const NAME = 'my-post';
(() => {
  const slides = [...new Set([...document.querySelectorAll('img')].map((i) => i.src).filter((s) => s.includes('photomode')))];
  const desc = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]')?.innerText?.replace(/\s*\n\s*/g, ' ').trim() || '';
  const music = document.querySelector('[data-e2e="browse-music"], [data-e2e="video-music"]')?.innerText?.trim() || '';
  const json = JSON.stringify({ source: location.href.split('?')[0], title: document.title.replace(/ \| TikTok$/, ''), caption: desc, music, slides });
  if (!slides.length) return 'no photo-mode slides found yet: wait for the post to load (or scroll the carousel) and run again';
  if (!NAME) return json;
  location.href = `http://localhost:5179/save.html#file=${encodeURIComponent(`posts/${NAME}/capture.json`)}&back=${encodeURIComponent(location.href)}&data=${encodeURIComponent(json)}`;
  return `saving ${slides.length} slides to slideshow/posts/${NAME}/capture.json`;
})();
