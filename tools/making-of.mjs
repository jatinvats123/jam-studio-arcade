// "How this game was made": games/<slug>/index.html, a timeline built only from files that already
// exist (GAME_SPEC.md, NOTES.md, repro-*.json, playtest.json, screenshots, PUBLISHED markers and the
// studio's git publish commits). Called by build-arcade.mjs; no agent writes anything extra for it.
// A missing field just drops its line.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, GAMES, REPO_URL, versionDir } from './lib.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const names = list => list.map(c => `<b>${esc(c)}</b>`).join(', ');
const agent = s => `<span class="agent">${s}</span>`;
/** "v<N>/<file>" if the version folder has it (clips from tools/clip.mjs, screenshots), else ''. */
const media = (slug, n, ...files) => { const f = files.find(f => f && fs.existsSync(path.join(versionDir(slug, n), f))); return f ? `v${n}/${f}` : ''; };

/** First publish time of each version, from the studio's "publish <slug> v<N>" commits. */
function publishTimes(slug) {
  const out = {};
  try {
    const log = execFileSync('git', ['log', '--reverse', '--format=%aI|%s', '--', `games/${slug}`],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const line of log.split('\n')) {
      const m = line.match(/^(\S+)\|publish (\S+) v(\d+)$/);
      if (m && m[2] === slug && !out[m[3]]) out[m[3]] = m[1];
    }
  } catch { /* not a git repo: fall back to PUBLISHED markers */ }
  return out;
}

/** "## v<N> changes (asked by A, B)" blocks: { N: { askedBy: [..], items: [..] } }. */
function changeBlocks(slug) {
  const file = path.join(GAMES, slug, 'GAME_SPEC.md');
  if (!fs.existsSync(file)) return {};
  const out = {};
  const parts = fs.readFileSync(file, 'utf8').split(/^## /m).slice(1);
  for (const p of parts) {
    const [head, ...body] = p.split(/\r?\n/);
    const m = head.match(/^v(\d+)\s+changes\b(.*)$/i);
    if (!m) continue;
    let asked = m[2].match(/(?:asked|requested)\s+by[:\s]+([^)]+)/i)?.[1] || '';
    const items = [];
    for (const line of body) {
      const who = line.match(/^\s*(?:asked|requested)\s+by\s*:\s*(.+)$/i);
      if (who) { asked ||= who[1]; continue; }
      const it = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
      if (it) items.push(it[1]);
    }
    out[m[1]] = { askedBy: asked.split(/,|\band\b/).map(s => s.trim()).filter(Boolean), items };
  }
  return out;
}

const bullets = file => fs.existsSync(file)
  ? fs.readFileSync(file, 'utf8').split(/\r?\n(?=\s*[-*]\s)/).map(b => b.match(/^\s*[-*]\s+([\s\S]*)/)?.[1]?.replace(/\s+/g, ' ').trim()).filter(Boolean)
  : [];

const when = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  if (/^d{4}-d{2}-d{2}$/.test(String(iso).trim())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
};

/** Builds the timeline page for one arcade game (g comes from build-arcade.mjs). */
export function makingOfPage(g, bySlug) {
  const { slug } = g;
  const times = publishTimes(slug);
  const changes = changeBlocks(slug);
  const steps = []; // { icon, who, what, body, time, img }
  const spec = g.spec || {};
  const src = bySlug[g.remixOf];

  if (g.remixOf) steps.push({ icon: '🔁', who: names(g.credits), what: `remixed ${src ? `<a href="../${src.slug}/">${esc(src.title)}</a> (by ${names(src.credits)})` : esc(g.remixOf)} into a new game`, time: spec.created });
  else if (g.credits.length) steps.push({ icon: '💡', who: names(g.credits), what: 'pitched the idea in Discord', time: spec.created });
  if (g.pitch) steps.push({ icon: '🎨', who: agent('designer'), what: 'wrote the plan (GAME_SPEC.md)', body: `<p class="quote">${esc(g.pitch)}</p>` });
  const approvers = [].concat(spec.approved_by || []).filter(Boolean);
  if (approvers.length) steps.push({ icon: '✅', who: names(approvers), what: 'approved the plan' });

  for (const n of g.vs) {
    const dir = versionDir(slug, n);
    const ch = changes[n];
    if (ch) steps.push({ icon: '🎨', who: agent('designer'), what: `planned v${n} changes${ch.askedBy.length ? `, asked for by ${names(ch.askedBy)}` : ''}`,
      body: ch.items.length ? `<ul>${ch.items.slice(0, 4).map(i => `<li>${md(i)}</li>`).join('')}</ul>` : '' });
    const fix = g.hotfix[n];
    const notes = bullets(path.join(dir, 'NOTES.md')).filter(b => !/^hotfix:/i.test(b));
    // A hotfix shows its side-by-side clip: the bug's repro on the old version vs this one.
    const fixGif = fix ? fs.readdirSync(dir).filter(f => /^fix-[\w-]+\.gif$/.test(f)).sort()[0] : '';
    steps.push({ icon: fix ? '🩹' : '🛠', who: agent('builder'), what: fix ? `shipped hotfix v${n}: ${esc(fix.bug)}` : `built v${n}`,
      body: notes.length ? `<ul>${notes.slice(0, fix ? 2 : 3).map(b => `<li>${md(b.length > 220 ? b.slice(0, 217) + '…' : b)}</li>`).join('')}</ul>` : '',
      img: fixGif ? `v${n}/${fixGif}` : '', alt: 'the same moves on the buggy and the fixed version', wide: true });

    const pt = readJson(path.join(dir, 'playtest.json'));
    if (pt?.checks) {
      const hard = pt.checks.filter(c => !c.advisory), adv = pt.checks.filter(c => c.advisory && !c.skipped);
      const ok = hard.filter(c => c.pass).length;
      const items = hard.filter(c => /^(A\d|BUG|\[v\d+ repro)/.test(c.name));
      const runner = pt.runner ? ` (${esc(pt.runner)})` : '';
      steps.push({ icon: '🧪', who: agent(`playtester${runner}`), what: `${ok}/${hard.length} checks ${pt.pass ? 'PASS' : 'FAIL'}${pt.fps ? `, ${pt.fps} fps` : ''}${adv.length ? `, ${adv.filter(c => c.pass).length}/${adv.length} earlier checks still hold` : ''}`,
        body: items.length ? `<ul class="checks">${items.map(c => `<li>${c.pass ? '✅' : '❌'} ${esc(c.name)}</li>`).join('')}</ul>` : '',
        time: pt.when, img: media(slug, n, 'clip.gif', pt.screenshot), alt: 'the playtester playing it' });
    }
    const pub = times[n] || (fs.existsSync(path.join(dir, 'PUBLISHED')) ? fs.readFileSync(path.join(dir, 'PUBLISHED'), 'utf8').trim() : '');
    steps.push({ icon: '🚀', who: agent('builder'), what: `published <a href="v${n}/">v${n}</a> to the arcade`, time: pub });

    // Bug reports filed against this version (they lead to the next version's hotfix).
    for (const f of fs.readdirSync(dir).filter(f => /^repro-\d+\.json$/.test(f)).sort()) {
      const label = (readJson(path.join(dir, f)) || []).find(s => s && s.label && /^BUG/i.test(s.label))?.label;
      const hunter = g.hotfix[n + 1]?.hunter;
      steps.push({ icon: '🐛', who: hunter ? names([hunter]) : 'A player', what: 'reported a bug while playing' });
      if (label) steps.push({ icon: '🧪', who: agent('playtester'), what: `reproduced it headlessly: ${esc(label)}`, body: `<p class="dim">Saved as <code>v${n}/${f}</code>, replayed by every later playtest.</p>`,
        img: media(slug, n, f.replace(/\.json$/, '.gif')), alt: 'the bug, caught on camera' });
    }
  }
  for (const r of g.remixes) steps.push({ icon: '🔁', who: names(r.credits), what: `remixed it as <a href="../${r.slug}/">${esc(r.title)}</a>` });

  const li = s => `<li><span class="ic">${s.icon}</span><div class="st"><p class="hd">${s.who} ${s.what}${s.time && when(s.time) ? ` <time>${when(s.time)}</time>` : ''}</p>${s.body || ''}${s.img ? `<a href="v${g.latest}/"><img${s.wide ? ' class="wide"' : ''} src="${s.img}" alt="${esc(s.alt || 'screenshot')}" loading="lazy"></a>` : ''}</div></li>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0d0b1f">
<title>How ${esc(g.title)} was made (Jam Room)</title>
<style>
  :root { --bg1:#0d0b1f; --bg2:#24124a; --accent:#ff4d8d; --accent2:#ffd166; --accent3:#4dd6ff; --text:#f4f1ff; --dim:#9a93c9; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; color: var(--text); background: linear-gradient(180deg, var(--bg2), var(--bg1) 420px) var(--bg1);
         font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  a { color: var(--accent3); text-decoration: none; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 22px 32px; }
  .back { font-size: 14px; color: var(--dim); }
  h1 { margin: 14px 0 6px; font-size: clamp(30px, 5vw, 44px); font-weight: 900; letter-spacing: -0.02em;
       background: linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sub { margin: 0; color: var(--dim); font-size: 16px; line-height: 1.5; } .sub b { color: var(--text); }
  .play { display: inline-block; margin-top: 16px; font-weight: 800; font-size: 14px; padding: 9px 16px; border-radius: 12px;
          background: linear-gradient(90deg, var(--accent), #ff7a59); color: #fff; }
  ol { list-style: none; margin: 30px 0 0; padding: 0; position: relative; }
  ol::before { content: ''; position: absolute; left: 17px; top: 6px; bottom: 6px; width: 2px; background: rgba(255,255,255,0.1); }
  ol > li { position: relative; display: flex; gap: 14px; margin: 0 0 18px; }
  .ic { flex: 0 0 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; z-index: 1;
        background: #1a1238; border: 1px solid rgba(255,255,255,0.14); }
  .st { flex: 1; min-width: 0; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 10px 14px; }
  .hd { margin: 0; font-size: 15px; line-height: 1.45; } .hd b { color: var(--text); font-weight: 800; }
  .agent { color: var(--accent3); font-weight: 700; } time { color: var(--dim); font-size: 12px; white-space: nowrap; margin-left: 4px; }
  .st ul { margin: 6px 0 2px; padding-left: 18px; color: var(--dim); font-size: 13.5px; line-height: 1.45; }
  .st ul.checks { list-style: none; padding-left: 0; }
  .quote { margin: 6px 0 0; color: var(--dim); font-style: italic; font-size: 14px; } .dim { margin: 6px 0 0; color: var(--dim); font-size: 13px; }
  code { font-size: 12.5px; background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 5px; }
  .st img { display: block; margin-top: 10px; width: 100%; max-width: 420px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); }
  .st img.wide { max-width: 100%; }
  .legend { margin-top: 8px; color: var(--dim); font-size: 13px; }
  footer { text-align: center; color: var(--dim); font-size: 13px; padding: 12px 0 40px; }
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="../../">← Jam Room Arcade</a>
  <h1>How ${esc(g.title)} was made</h1>
  <p class="sub">${g.pitch ? esc(g.pitch) + '<br>' : ''}Made by ${g.credits.length ? names(g.credits) : 'friends'} + Jam Room agents in Discord, ${g.vs.length} version${g.vs.length === 1 ? '' : 's'}.</p>
  <a class="play" href="v${g.latest}/">&#9654; Play v${g.latest}</a>
  <p class="legend"><b>Bold names</b> are people. <span class="agent">Blue names</span> are AI agents (designer, builder, playtester) working together in the chat through Switch.</p>
  <ol>
${steps.map(li).join('\n')}
  </ol>
</div>
<footer>Made by people + AI agents in Discord via <a href="https://docs.switchagents.ai">Switch</a> · <a href="${REPO_URL}">Jam Room</a></footer>
</body>
</html>
`;
}
