// Shared helpers for studio tools. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GAMES = path.join(ROOT, 'games');
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export function fail(msg) { console.error(msg); process.exit(1); }

export function needSlug(slug) {
  if (!slug) fail('Usage: <slug> is required (kebab-case, e.g. cat-vs-cucumbers).');
  if (!SLUG_RE.test(slug)) fail(`Bad slug "${slug}": use 3-30 chars of a-z, 0-9 and "-".`);
  return slug;
}

/** Sorted list of version numbers that exist for a game, e.g. [1, 2, 3]. */
export function versions(slug) {
  const dir = path.join(GAMES, slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^v\d+$/.test(d.name))
    .map(d => Number(d.name.slice(1)))
    .sort((a, b) => a - b);
}

export const versionDir = (slug, n) => path.join(GAMES, slug, `v${n}`);

/** Tiny front-matter reader for GAME_SPEC.md: key: value, [a, b] lists and "- item" lists. */
export function readSpec(slug) {
  const file = path.join(GAMES, slug, 'GAME_SPEC.md');
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const meta = {};
  if (!m) return meta;
  let listKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) { meta[listKey].push(unquote(item[1])); continue; }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v === '') { meta[k] = []; listKey = k; continue; }
    listKey = null;
    meta[k] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean) : unquote(v);
  }
  return meta;
}
const unquote = s => s.trim().replace(/^(['"])(.*)\1$/, '$2');
