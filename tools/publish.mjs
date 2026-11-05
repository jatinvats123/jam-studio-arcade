// node tools/publish.mjs <slug> <N>
// Checks the game, rebuilds the arcade + short links, commits, pushes to GitHub Pages if an origin
// remote exists and waits (max 90 s) until the public URL answers, then prints the links.
// JAM_LOCAL=1 skips the push. Without a remote it prints localhost links.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, PUBLISHED, needSlug, versionDir, fail } from './lib.mjs';

const slug = needSlug(process.argv[2]);
const n = Number(process.argv[3]);
if (!Number.isInteger(n) || n < 1) fail('Usage: node tools/publish.mjs <slug> <N>');
if (!fs.existsSync(path.join(versionDir(slug, n), 'index.html'))) fail(`games/${slug}/v${n}/index.html does not exist.`);

const PORT = process.env.PORT || 8080;
const node = (script, ...args) => execFileSync(process.execPath, [path.join(ROOT, 'tools', script), ...args], { cwd: ROOT, stdio: 'inherit' });
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

if (tryGit('rev-parse', '--is-inside-work-tree') !== 'true') fail('PUBLISH ABORTED: the studio is not a git repo. Run the setup script.');
try { node('check.mjs', slug, String(n)); } catch { fail('PUBLISH ABORTED: fix the check problems above first.'); }
// The marker is what puts a version on the arcade: work in progress in other folders stays off it.
fs.writeFileSync(path.join(versionDir(slug, n), PUBLISHED), `${new Date().toISOString()}\n`);
node('build-arcade.mjs');

// GitHub Pages serves the repo root as-is; .nojekyll skips the Jekyll build so deploys are faster.
if (!fs.existsSync(path.join(ROOT, '.nojekyll'))) fs.writeFileSync(path.join(ROOT, '.nojekyll'), '');
// Only this game's files plus the arcade: another room's half-built version is not swept in.
// Every game's making-of page (games/*/index.html) is regenerated too, so it is committed with it.
git('add', '-A', '--', `games/${slug}`, ':(glob)games/*/index.html', 'play', 'index.html', '.nojekyll');
if (tryGit('diff', '--cached', '--quiet') === null) {
  git('commit', '-q', '-m', `publish ${slug} v${n}`);
  console.log(`Committed: publish ${slug} v${n}`);
} else {
  console.log('Nothing new to commit.');
}

const local = `http://localhost:${PORT}/games/${slug}/v${n}/`;
const hasShot = fs.existsSync(path.join(versionDir(slug, n), 'screenshot.png'));
const printLocal = why => {
  if (why) console.log(why);
  console.log(`LIVE: ${local}`);
  console.log(`Short link: http://localhost:${PORT}/play/${slug}/`);
  if (hasShot) console.log(`Screenshot: ${local}screenshot.png`);
  console.log(`Arcade: http://localhost:${PORT}/  (run "npm run serve" in the studio if it isn't running)`);
};

const remote = tryGit('remote', 'get-url', 'origin');
const m = remote && remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
if (!remote || process.env.JAM_LOCAL) { printLocal(); process.exit(0); }
try {
  console.log('Pushing to GitHub…');
  git('push', '-q', 'origin', 'HEAD');
  console.log('Pushed to origin.');
} catch (e) {
  printLocal(`Push failed (${String(e.stderr || e.message).split('\n')[0]}). Using the local link.`);
  process.exit(0);
}
if (!m) { printLocal('origin is not a GitHub repo, so there is no Pages link.'); process.exit(0); }

const owner = m[1].toLowerCase(), repo = m[2];
const base = repo.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io` : `https://${owner}.github.io/${repo}`;
const url = `${base}/games/${slug}/v${n}/`;
// Wait for the Pages deploy: the new version's URL returns 200 once it is live (max 90 s: agent tool calls time out at 2 min).
const t0 = Date.now();
let ok = false, last = '';
while (Date.now() - t0 < 90_000) {
  try {
    const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    last = String(r.status);
    if (r.ok) { ok = true; break; }
  } catch (e) { last = e.name; }
  console.log(`Waiting for GitHub Pages… ${Math.round((Date.now() - t0) / 1000)} s (status ${last})`);
  await new Promise(r => setTimeout(r, 6000));
}
if (ok) {
  console.log(`LIVE: ${url}`);
  console.log(`Short link: ${base}/play/${slug}/`);
  if (hasShot) console.log(`Screenshot: ${url}screenshot.png`);
  console.log(`Arcade: ${base}/`);
} else {
  console.log(`Pages did not answer 200 within 90 s (last status ${last}). It may still be deploying.`);
  printLocal();
  console.log(`Public link (should work in a minute): ${url}`);
}
