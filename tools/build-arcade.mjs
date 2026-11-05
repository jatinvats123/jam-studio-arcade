// node tools/build-arcade.mjs
// Generates the studio-root index.html: one card per game with title, pitch, credits, versions.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, GAMES, readSpec, versions, versionDir } from './lib.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HUES = ['#ff4d8d', '#4dd6ff', '#ffd166', '#b18cff', '#5cf2a6'];

// Fallback metadata for games without a GAME_SPEC.md (e.g. the demo): read Game.title / Game.pitch.
function fromHtml(slug, n) {
  const html = fs.readFileSync(path.join(versionDir(slug, n), 'index.html'), 'utf8');
  const g = html.split('// === GAME START ===')[1] || '';
  return { title: g.match(/title:\s*['"`]([^'"`]+)/)?.[1], pitch: g.match(/pitch:\s*['"`]([^'"`]+)/)?.[1] };
}

const games = [];
if (fs.existsSync(GAMES)) {
  for (const slug of fs.readdirSync(GAMES)) {
    const vs = versions(slug).filter(n => fs.existsSync(path.join(versionDir(slug, n), 'index.html')));
    if (!vs.length) continue;
    const latest = vs[vs.length - 1];
    const spec = readSpec(slug) || {};
    const meta = { ...fromHtml(slug, latest) };
    for (const k in spec) if (spec[k] !== '' && spec[k] != null) meta[k] = spec[k];
    const credits = [].concat(meta.credits || []).filter(Boolean);
    const shotV = [...vs].reverse().find(n => fs.existsSync(path.join(versionDir(slug, n), 'screenshot.png')));
    const mtime = fs.statSync(path.join(versionDir(slug, latest), 'index.html')).mtimeMs;
    games.push({ slug, vs, latest, title: meta.title || slug, pitch: meta.pitch || '', credits, shotV, mtime });
  }
}
games.sort((a, b) => b.mtime - a.mtime);

function card(g, i) {
  const href = `games/${g.slug}/v${g.latest}/`;
  const thumb = g.shotV
    ? `<img src="games/${g.slug}/v${g.shotV}/screenshot.png" alt="${esc(g.title)} screenshot" loading="lazy">`
    : `<div class="ph" style="--h:${HUES[i % HUES.length]}"><span>${esc(g.title.slice(0, 1).toUpperCase())}</span></div>`;
  const older = g.vs.slice(0, -1).reverse().map(n => `<a href="games/${g.slug}/v${n}/">v${n}</a>`).join('');
  const credits = g.credits.length
    ? `<p class="credits">Made by ${g.credits.map(c => `<b>${esc(c)}</b>`).join(', ')} + Jam Room agents</p>` : '';
  return `<article class="card">
  <a class="thumb" href="${href}">${thumb}<span class="badge">v${g.latest}</span></a>
  <div class="body">
    <h2><a href="${href}">${esc(g.title)}</a></h2>
    ${g.pitch ? `<p class="pitch">${esc(g.pitch)}</p>` : ''}
    ${credits}
    <div class="row"><a class="play" href="${href}">&#9654; Play v${g.latest}</a>${older ? `<span class="older">${older}</span>` : ''}</div>
  </div>
</article>`;
}

const count = `${games.length} game${games.length === 1 ? '' : 's'}`;
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0d0b1f">
<title>Jam Room Arcade</title>
<style>
  :root { --bg1:#0d0b1f; --bg2:#24124a; --accent:#ff4d8d; --accent2:#ffd166; --accent3:#4dd6ff; --text:#f4f1ff; --dim:#9a93c9; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; color: var(--text); background: linear-gradient(180deg, var(--bg2), var(--bg1) 520px) var(--bg1);
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  a { color: inherit; }
  header { max-width: 1080px; margin: 0 auto; padding: 56px 24px 24px; }
  h1 { margin: 0; font-size: clamp(36px, 6vw, 56px); font-weight: 900; letter-spacing: -0.02em;
       background: linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  header p { margin: 10px 0 0; color: var(--dim); font-size: 17px; }
  main { max-width: 1080px; margin: 0 auto; padding: 8px 24px 48px; display: grid; gap: 20px;
         grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 20px; overflow: hidden;
          transition: transform .18s ease, border-color .18s ease; }
  .card:hover { transform: translateY(-3px); border-color: rgba(255,77,141,0.5); }
  .thumb { position: relative; display: block; aspect-ratio: 16 / 9; background: #0a0818; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph { width: 100%; height: 100%; display: grid; place-items: center;
        background: radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--h) 45%, transparent), transparent 60%), linear-gradient(135deg, #1a1238, #0d0b1f); }
  .ph span { font-size: 64px; font-weight: 900; color: var(--h); opacity: .9; }
  .badge { position: absolute; top: 12px; right: 12px; background: rgba(13,11,31,0.8); border: 1px solid rgba(255,255,255,0.15);
           border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 800; color: var(--accent2); }
  .body { padding: 16px 18px 18px; }
  h2 { margin: 0; font-size: 21px; font-weight: 800; } h2 a { text-decoration: none; }
  .pitch { margin: 6px 0 0; color: var(--dim); font-size: 14.5px; line-height: 1.45; }
  .credits { margin: 10px 0 0; font-size: 13px; color: var(--dim); } .credits b { color: var(--text); }
  .row { margin-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .play { text-decoration: none; font-weight: 800; font-size: 14px; padding: 9px 16px; border-radius: 12px;
          background: linear-gradient(90deg, var(--accent), #ff7a59); color: #fff; }
  .older { display: flex; gap: 6px; flex-wrap: wrap; }
  .older a { font-size: 12px; color: var(--dim); text-decoration: none; padding: 4px 8px; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; }
  .older a:hover { color: var(--text); }
  .empty { grid-column: 1 / -1; text-align: center; color: var(--dim); padding: 80px 0; font-size: 18px; }
  footer { text-align: center; color: var(--dim); font-size: 13px; padding: 24px 0 40px; }
  footer a { color: var(--accent3); text-decoration: none; }
  @media (max-width: 520px) { header { padding-top: 36px; } main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>Jam Room Arcade</h1>
  <p>Tiny games designed by friends in a chat and built live by AI agents. ${count} so far.</p>
</header>
<main>
${games.length ? games.map(card).join('\n') : '<p class="empty">No games yet. Pitch one in #jam-room.</p>'}
</main>
<footer>Made in Jam Room with <a href="https://docs.switchagents.ai">Switch</a></footer>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log(`ARCADE BUILT: index.html (${count})`);
