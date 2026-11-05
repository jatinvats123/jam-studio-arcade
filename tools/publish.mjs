// node tools/publish.mjs <slug> <N>
// Checks the game, rebuilds the arcade, commits, pushes if an origin remote exists, prints the link.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, needSlug, versionDir, fail } from './lib.mjs';

const slug = needSlug(process.argv[2]);
const n = Number(process.argv[3]);
if (!Number.isInteger(n) || n < 1) fail('Usage: node tools/publish.mjs <slug> <N>');
if (!fs.existsSync(path.join(versionDir(slug, n), 'index.html'))) fail(`games/${slug}/v${n}/index.html does not exist.`);

const PORT = process.env.PORT || 8080;
const node = (script, ...args) => execFileSync(process.execPath, [path.join(ROOT, 'tools', script), ...args], { cwd: ROOT, stdio: 'inherit' });
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

try { node('check.mjs', slug, String(n)); } catch { fail('PUBLISH ABORTED: fix the check problems above first.'); }
node('build-arcade.mjs');

if (tryGit('rev-parse', '--is-inside-work-tree') !== 'true') fail('PUBLISH ABORTED: the studio is not a git repo. Run the setup script.');
git('add', '-A', '--', 'games', 'index.html');
if (tryGit('diff', '--cached', '--quiet') === null) {
  git('commit', '-q', '-m', `publish ${slug} v${n}`);
  console.log(`Committed: publish ${slug} v${n}`);
} else {
  console.log('Nothing new to commit.');
}

const local = `http://localhost:${PORT}/games/${slug}/v${n}/`;
const remote = tryGit('remote', 'get-url', 'origin');
if (remote) {
  try {
    git('push', '-q', 'origin', 'HEAD');
    console.log('Pushed to origin.');
    const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
    if (m) { console.log(`LIVE: https://${m[1].toLowerCase()}.github.io/${m[2]}/games/${slug}/v${n}/`); process.exit(0); }
  } catch (e) {
    console.log(`Push failed (${String(e.stderr || e.message).split('\n')[0]}). Using the local link.`);
  }
}
console.log(`LIVE: ${local}`);
console.log(`Arcade: http://localhost:${PORT}/  (run "npm run serve" in the studio if it isn't running)`);
