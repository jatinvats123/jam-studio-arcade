// node tools/check.mjs <slug> <N>
// Fast static check of games/<slug>/v<N>/index.html. Prints CHECK PASS or numbered problems.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, needSlug, versionDir } from './lib.mjs';

const slug = needSlug(process.argv[2]);
const n = Number(process.argv[3]);
if (!Number.isInteger(n) || n < 1) { console.error('Usage: node tools/check.mjs <slug> <N>'); process.exit(1); }

const file = path.join(versionDir(slug, n), 'index.html');
const rel = path.relative(ROOT, file).split(path.sep).join('/');
const problems = [];
const MAX = 150 * 1024;

if (!fs.existsSync(file)) {
  problems.push(`${rel} does not exist. Run: node tools/new-version.mjs ${slug}`);
} else {
  const html = fs.readFileSync(file, 'utf8');
  const size = Buffer.byteLength(html);
  if (size > MAX) problems.push(`File is ${(size / 1024).toFixed(1)} KB; the limit is 150 KB.`);

  const lineOf = i => html.slice(0, i).split('\n').length;
  const net = [
    [/\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//gi, 'external src/href'],
    [/\bfetch\s*\(\s*["'`]\s*(?:https?:)?\/\//gi, 'fetch() to a URL'],
    [/\bimport\s*(?:\(\s*|[^;'"]*?from\s*)["'`]\s*(?:https?:)?\/\//gi, 'import from a URL'],
    [/\burl\(\s*["']?\s*(?:https?:)?\/\//gi, 'CSS url() to a URL'],
    [/@import\s+(?:url\()?\s*["']?\s*(?:https?:)?\/\//gi, 'CSS @import of a URL'],
    [/\bnew\s+(?:WebSocket|EventSource)\s*\(/g, 'network socket'],
    [/\bXMLHttpRequest\b/g, 'XMLHttpRequest'],
  ];
  for (const [re, what] of net) for (const m of html.matchAll(re)) problems.push(`Network/external asset (${what}) at line ${lineOf(m.index)}: ${m[0].trim()}`);

  if (!html.includes('window.__jam')) problems.push('window.__jam test hook is missing (keep the starter engine).');
  for (const k of ['state()', 'start()', 'reset()', 'seed(', 'controls'])
    if (html.includes('window.__jam') && !html.includes(k)) problems.push(`window.__jam looks incomplete: "${k}" not found.`);
  if (!html.includes('// === GAME START ===') || !html.includes('// === GAME END ==='))
    problems.push('GAME START / GAME END markers are missing.');
  if (!/<canvas\b/i.test(html)) problems.push('No <canvas> element found.');

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) problems.push('No inline <script> found.');
  for (const [, attrs, code] of scripts) {
    if (/\bsrc\s*=/.test(attrs)) { problems.push(`Script with src is not allowed (inline everything): <script${attrs}>`); continue; }
    if (/type\s*=\s*["']?(?!text\/javascript|module)/i.test(attrs) && /type\s*=/.test(attrs)) continue; // JSON/data blocks
    try { new vm.Script(code, { filename: rel }); }
    catch (e) {
      const at = (e.stack || '').match(/:(\d+)\n/);
      problems.push(`JavaScript syntax error: ${e.message}${at ? ` (script line ${at[1]})` : ''}`);
    }
  }
}

if (problems.length) {
  console.log(`CHECK FAIL ${slug} v${n}`);
  problems.forEach((p, i) => console.log(`${i + 1}. ${p}`));
  process.exit(1);
}
console.log(`CHECK PASS ${slug} v${n}`);
