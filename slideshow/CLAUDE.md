# Slideshow pipeline — agent notes

Read README.md first. When asked to recreate a TikTok/Instagram carousel:

- One folder per post under `posts/<name>/` with `post.json`, `screens/` (HTML fragments + `screens.css`),
  and `assets/` (real photos/logos, optional). Output PNGs land in `out/` and are the deliverable.
- Do not guess layout from eyeballing. Measure the reference with pixel scans (bounding boxes per
  colour predicate) and iterate with `review.measureAll` until deltas are ≤2px. Start the review
  server with the `slideshow-review` launch config (`.claude/launch.json`, port 5179); the CDN images
  load with CORS so the page can diff them in-browser without saving them.
- Rebuild app UI as HTML, not screenshots. Generate real-world photos with `generate.mjs`
  (gpt-image-2 on Azure Foundry, needs `az login`); third-party logos are assets with a drawn
  fallback via `{{img … or …}}`.
- Fix the pipeline (lib/*.mjs, lib/tiktok-text.js, review.html) when a post needs something it
  cannot express, and document new element keys in README.md.
