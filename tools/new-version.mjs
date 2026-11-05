// node tools/new-version.mjs <slug> [--from <other-slug>]
// Creates games/<slug>/v<N+1>/index.html from the latest version, or from starter/ if none exists.
// --from <other-slug> (remixes): v1 of <slug> starts from the latest version of <other-slug>.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fail, needSlug, versions, versionDir } from './lib.mjs';

const slug = needSlug(process.argv[2]);
const fi = process.argv.indexOf('--from');
const fromSlug = fi > 0 ? needSlug(process.argv[fi + 1]) : null;
const have = versions(slug);
const prev = have.length ? have[have.length - 1] : 0;
const n = prev + 1;

let from, label;
if (fromSlug) {
  if (prev) fail(`--from is only for v1 of a remix, but ${slug} already has v${prev}. Run without --from.`);
  if (fromSlug === slug) fail('--from must name a different game.');
  const src = versions(fromSlug);
  if (!src.length) fail(`No versions of "${fromSlug}" to remix (games/${fromSlug}/v<N>/ missing).`);
  const last = src[src.length - 1];
  from = path.join(versionDir(fromSlug, last), 'index.html');
  label = `${fromSlug} v${last} (remix)`;
} else {
  from = prev ? path.join(versionDir(slug, prev), 'index.html') : path.join(ROOT, 'starter', 'index.html');
  label = prev ? `v${prev}` : 'starter';
}
if (!fs.existsSync(from)) fail(`Missing source file: ${path.relative(ROOT, from)}`);

const dir = versionDir(slug, n);
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(from, path.join(dir, 'index.html'));
console.log(`NEW VERSION ${n}: games/${slug}/v${n}/index.html (copied from ${label})`);
