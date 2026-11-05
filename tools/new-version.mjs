// node tools/new-version.mjs <slug>
// Creates games/<slug>/v<N+1>/index.html from the latest version, or from starter/ if none exists.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, needSlug, versions, versionDir } from './lib.mjs';

const slug = needSlug(process.argv[2]);
const have = versions(slug);
const prev = have.length ? have[have.length - 1] : 0;
const n = prev + 1;
const from = prev ? path.join(versionDir(slug, prev), 'index.html') : path.join(ROOT, 'starter', 'index.html');
if (!fs.existsSync(from)) { console.error(`Missing source file: ${path.relative(ROOT, from)}`); process.exit(1); }

const dir = versionDir(slug, n);
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(from, path.join(dir, 'index.html'));
console.log(`NEW VERSION ${n}: games/${slug}/v${n}/index.html (copied from ${prev ? `v${prev}` : 'starter'})`);
