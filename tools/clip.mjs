// node tools/clip.mjs <slug> <N>                                  -> games/<slug>/v<N>/clip.gif
// node tools/clip.mjs <slug> <N> --repro repro-<k>.json           -> games/<slug>/v<N>/repro-<k>.gif
// node tools/clip.mjs <slug> <N> --repro repro-<k>.json --vs <M>  -> games/<slug>/v<N>/fix-<k>.gif
// A GIF of the playtester playing, made by the same player as playtest.mjs (player.mjs: seed 42,
// paused fake clock on the 16 ms frame grid), so the clip is the test run with a camera on it.
//   clip:   ~6 s from start, cycling the game's own controls like the playtest's screenshot step.
//   repro:  replays the bug repro and stops just after its BUG check: red banner if the check
//           fails (the bug, on camera), green if it passes.
//   --vs M: the same repro on v<M> (left) and v<N> (right), frame-synced, each side's check result
//           under it. The repro file is looked up in v<N>, then v<M>, then any other version.
// Frames: canvas only, 480x270 per side, one every 80 ms of game time (a longer repro becomes a
// time-lapse so the GIF stays <= 10 s). Over 5 MB: half the frames, re-encoded once. Math.random is
// seeded in the clip page (cosmetics), so the same inputs give the same bytes. No network; writes
// only the GIF into the version folder. Prints the path and size; exit 1 with one line on failure.
import fs from 'node:fs';
import path from 'node:path';
import { needSlug, versions, versionDir, readSpec } from './lib.mjs';
import { SEED, KEYBOARD, loadChromium, startServer, freshPage, loadScenario, playSteps, scenarioMs, run, state } from './player.mjs';

const W = 480, H = 270, TOP = 28, BOTTOM = 30;   // per-side frame size and label bars
const STEP_MS = 80, MAX_FRAMES = 125, TAIL_MS = 500, MAX_BYTES = 5 * 1024 * 1024, HOLD_LAST_MS = 2000;
const die = msg => { console.error(`CLIP FAILED: ${msg}`); process.exit(1); };
const budget = setTimeout(() => die('took longer than 100 s'), 100_000); budget.unref();

// ---- arguments
const slug = needSlug(process.argv[2]);
const n = Number(process.argv[3]);
if (!Number.isInteger(n) || n < 1) die('usage: node tools/clip.mjs <slug> <N> [--repro repro-<k>.json [--vs <M>]]');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? (process.argv[i + 1] ?? '') : null; };
const reproName = arg('--repro'), vsArg = arg('--vs');
if (reproName !== null && !/^repro-[\w-]+\.json$/.test(reproName)) die('--repro takes a repro file name, e.g. repro-1.json');
const m = vsArg === null ? null : Number(vsArg);
if (vsArg !== null && (!reproName || !Number.isInteger(m) || m < 1 || m === n)) die('--vs <M> needs --repro and another version number');
const have = versions(slug);
for (const v of [n, m].filter(v => v !== null)) if (!have.includes(v) || !fs.existsSync(path.join(versionDir(slug, v), 'index.html')))
  die(`games/${slug}/v${v}/index.html does not exist`);
const title = readSpec(slug)?.title || slug;

// ---- what to play
let steps, bugIndex = -1, label = '', reproFrom = null;
if (reproName) {
  const order = [n, m, ...[...have].reverse()].filter((v, i, a) => v !== null && a.indexOf(v) === i);
  reproFrom = order.find(v => fs.existsSync(path.join(versionDir(slug, v), reproName)));
  if (reproFrom === undefined) die(`${reproName} not found in any version of ${slug}`);
  const { steps: all, err } = loadScenario(path.join(versionDir(slug, reproFrom), reproName));
  if (!all) die(`games/${slug}/v${reproFrom}/${reproName}: ${err}`);
  const expects = all.map((s, i) => (s && s.expect ? i : -1)).filter(i => i >= 0);
  bugIndex = [...expects].reverse().find(i => /^BUG/i.test(all[i].label || '')) ?? expects.at(-1) ?? -1;
  if (bugIndex < 0) die(`${reproName} has no expect step to check`);
  steps = all.slice(0, bugIndex + 1);
  label = all[bugIndex].label || all[bugIndex].expect;
}
const kind = !reproName ? 'clip' : m === null ? 'repro' : 'fix';
const k = reproName ? reproName.match(/^repro-([\w-]+)\.json$/)[1] : null;
const outName = kind === 'clip' ? 'clip.gif' : `${kind}-${k}.gif`;
const outFile = path.join(versionDir(slug, n), outName);
const sides = kind === 'fix' ? [m, n] : [n];

const chromium = await loadChromium();
const srv = await startServer();
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  // Zero network: only the private studio server. Cosmetics (particles, stars, shake) use
  // Math.random, so seed it (mulberry32) for byte-identical clips; game logic already uses __jam.seed.
  await ctx.route('**/*', r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  await ctx.addInitScript(seed => {
    let a = seed >>> 0;
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, SEED);

  // The plain clip plays like the playtest's screenshot step, for ~6 s: hold a control, pause, next;
  // after a game over it waits 700 ms and starts again, like the playtest's random-input step.
  if (kind === 'clip') {
    const probe = await freshPage(ctx, `${srv.origin}/games/${slug}/v${n}/`);
    const keys = (await probe.evaluate(() => Array.isArray(__jam.controls) ? __jam.controls : [])).filter(c => KEYBOARD.test(c));
    await probe.close();
    steps = [{ call: 'start' }];
    for (let i = 0; i < 12; i++) steps.push(keys.length ? { press: keys[i % keys.length], ms: 250 } : { wait: 250 }, { wait: 250 });
  }
  // One frame every STEP_MS of game time; a long repro becomes a time-lapse of whole STEP_MS steps.
  const total = scenarioMs(steps) + TAIL_MS;
  const speed = Math.max(1, Math.ceil(total / STEP_MS / MAX_FRAMES));
  const every = STEP_MS * speed;

  // ---- play each side, capturing frames on the same game-time grid (so the sides stay in sync)
  const results = [];   // per side: { frames: [rgba], doneAt: frame index when the BUG check ran, ok, err }
  for (const v of sides) {
    const p = await freshPage(ctx, `${srv.origin}/games/${slug}/v${v}/`);
    const frames = [await grab(p)]; let acc = 0, res = null, doneAt = -1;
    const advance = async (page, ms) => {
      while (ms > 0) {
        const d = Math.min(ms, every - acc);
        await run(page, d); acc += d; ms -= d;
        if (acc >= every) { acc = 0; frames.push(await grab(page)); }
      }
    };
    const hooks = {
      advance,
      bad: (where, what, detail) => { throw new Error(`${where}: ${what}: ${detail}`); },
      expect: (s, r, i) => { if (i === bugIndex) { res = r; doneAt = frames.length; } },
    };
    if (kind === 'clip') {
      await playSteps(p, steps.slice(0, 1), hooks);
      for (let i = 1; i < steps.length; i += 2) {
        await playSteps(p, steps.slice(i, i + 2), hooks);
        if ((await state(p)).scene === 'over') { await advance(p, 700); await p.evaluate(() => __jam.start()); }
      }
    } else await playSteps(p, steps, hooks);
    await advance(p, TAIL_MS);
    await p.close();
    results.push({ v, frames, doneAt: doneAt < 0 ? frames.length : doneAt, ok: res?.ok, err: res?.err });
  }

  // ---- label bars, drawn once in a blank page (vector icons, no emoji font needed)
  const ink = await ctx.newPage();
  await ink.setContent('<canvas></canvas>');
  const bars = new Map();
  const bar = async (spec) => {
    const key = JSON.stringify(spec);
    if (!bars.has(key)) bars.set(key, Buffer.from(await ink.evaluate(drawBar, spec), 'base64'));
    return bars.get(key);
  };
  const speedNote = speed > 1 ? ` · ${speed}× speed` : '';
  const verdict = r => r.ok ? { bg: '#1f9d55', icon: 'check' } : { bg: '#d7263d', icon: 'x' };
  const tops = [], bottoms = [];   // per side: [before result, after result]
  for (const [i, r] of results.entries()) {
    if (kind === 'clip') {
      const t = await bar({ w: W, h: TOP, bg: '#0d0b1f', left: `${title} v${r.v}`, right: `playtester · seed 42 · the test's own run` });
      tops.push([t, t]);
    } else if (kind === 'repro') {
      const t = await bar({ w: W, h: TOP, bg: '#0d0b1f', left: `${title} v${r.v}`, right: `replaying ${reproName}${speedNote}` });
      tops.push([t, t]);
      bottoms.push([await bar({ w: W, h: BOTTOM, bg: '#2a2150', left: `checking: ${label}` }),
        await bar({ w: W, h: BOTTOM, ...verdict(r), left: r.ok ? `Passes: ${label}` : `Caught on camera: ${label}` })]);
    } else {
      const old = i === 0;
      const t = await bar({ w: W, h: TOP, bg: '#0d0b1f', left: `v${r.v}`, icon: r.ok ? 'check' : 'x', iconColor: r.ok ? '#2ecc71' : '#ff4d5e',
        tag: old ? (r.ok ? 'no bug' : 'bug') : (r.ok ? 'fixed' : 'still buggy'), right: old ? `same moves (${reproName})` : `seed 42${speedNote}` });
      tops.push([t, t]);
      bottoms.push([await bar({ w: W, h: BOTTOM, bg: '#2a2150', left: 'checking…' }),
        await bar({ w: W, h: BOTTOM, ...verdict(r), left: r.ok ? 'check passes' : `check fails: ${label}` })]);
    }
  }
  await ink.close();

  // ---- compose frames: [top bar / game / bottom bar] per side, sides left to right
  const count = Math.min(...results.map(r => r.frames.length));
  const FW = W * results.length, FH = TOP + H + (bottoms.length ? BOTTOM : 0);
  const frames = [];
  for (let f = 0; f < count; f++) {
    const out = Buffer.alloc(FW * FH * 4);
    results.forEach((r, s) => {
      const after = f >= r.doneAt ? 1 : 0;
      blit(out, FW, tops[s][after], W, TOP, s * W, 0);
      blit(out, FW, r.frames[f], W, H, s * W, TOP);
      if (bottoms.length) blit(out, FW, bottoms[s][after], W, BOTTOM, s * W, TOP + H);
    });
    frames.push(out);
  }

  // ---- encode (one global palette from a sample of frames, incl. the result frames)
  const gifenc = await import('gifenc').catch(() => die('gifenc is missing: run npm install in the studio'));
  const { GIFEncoder, quantize, applyPalette } = gifenc.quantize ? gifenc : gifenc.default;   // CJS build under Node
  const encode = (list, delay) => {
    const pick = [...new Set([...Array.from({ length: 12 }, (_, i) => Math.floor(i * (list.length - 1) / 11)), list.length - 1])];
    const sample = Buffer.concat(pick.map(i => list[i]));
    const palette = quantize(sample, 256);
    const gif = GIFEncoder();
    list.forEach((fr, i) => gif.writeFrame(applyPalette(fr, palette), FW, FH,
      { palette: i === 0 ? palette : undefined, delay: i === list.length - 1 ? HOLD_LAST_MS : delay }));
    gif.finish();
    return Buffer.from(gif.bytes());
  };
  let delay = STEP_MS, used = frames;
  let bytes = encode(used, delay);
  if (bytes.length > MAX_BYTES) { used = frames.filter((_, i) => i % 2 === 0 || i === frames.length - 1); delay *= 2; bytes = encode(used, delay); }
  if (bytes.length > MAX_BYTES) die(`${outName} would be ${(bytes.length / 1048576).toFixed(1)} MB even at half the frame rate (limit 5 MB)`);
  fs.writeFileSync(outFile, bytes);

  const secs = ((used.length - 1) * delay / 1000).toFixed(1);
  const lines = [`CLIP games/${slug}/v${n}/${outName}: ${(bytes.length / 1048576).toFixed(2)} MB, ${used.length} frames, ${secs} s${speed > 1 ? ` (${speed}x speed)` : ''}, ${FW}x${FH}`];
  for (const r of kind === 'clip' ? [] : results)
    lines.push(`v${r.v} ${reproName} (from v${reproFrom}): "${label}" ${r.ok ? 'PASSES' : 'FAILS'}${r.err ? ` (${r.err})` : ''}${r.ok ? '' : ' -> bug on camera'}`);
  if (kind === 'fix' && !(results[0].ok === false && results[1].ok === true))
    lines.push(`NOTE: expected v${m} to fail and v${n} to pass; the labels show what really happened`);
  console.log(lines.join('\n'));
} catch (e) {
  die(e.message.split('\n')[0]);
} finally {
  await browser.close().catch(() => {});
  srv.close();
}
process.exit(0);

/** The game canvas, letterboxed into W x H, as base64 RGBA. */
async function grab(p) {
  const b64 = await p.evaluate(([w, h]) => {
    const c = document.querySelector('canvas');
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const g = t.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    if (c && c.width && c.height) {
      const s = Math.min(w / c.width, h / c.height), dw = c.width * s, dh = c.height * s;
      g.drawImage(c, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    const d = g.getImageData(0, 0, w, h).data; let out = '';
    for (let i = 0; i < d.length; i += 0x8000) out += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return btoa(out);
  }, [W, H]);
  return Buffer.from(b64, 'base64');
}

/** Copies a w x h RGBA block into dst (width dw) at x, y. */
function blit(dst, dw, src, w, h, x, y) {
  for (let row = 0; row < h; row++) src.copy(dst, ((y + row) * dw + x) * 4, row * w * 4, (row + 1) * w * 4);
}

/** Runs in the page: draws one label bar and returns it as base64 RGBA. */
function drawBar({ w, h, bg, left = '', right = '', icon, iconColor = '#fff', tag }) {
  const c = document.querySelector('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.textBaseline = 'middle';
  const font = (wt, px) => `${wt} ${px}px "Segoe UI", system-ui, Roboto, Arial, sans-serif`;
  let x = 10;
  if (icon) {   // a circle with a cross or a tick
    const r = h * 0.3, cx = x + r, cy = h / 2;
    g.fillStyle = iconColor; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = bg === '#0d0b1f' ? '#0d0b1f' : bg; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath();
    if (icon === 'x') { const q = r * 0.45; g.moveTo(cx - q, cy - q); g.lineTo(cx + q, cy + q); g.moveTo(cx + q, cy - q); g.lineTo(cx - q, cy + q); }
    else { g.moveTo(cx - r * 0.5, cy); g.lineTo(cx - r * 0.1, cy + r * 0.4); g.lineTo(cx + r * 0.5, cy - r * 0.4); }
    g.stroke(); x += r * 2 + 8;
  }
  const fit = (s, max) => { if (g.measureText(s).width <= max) return s; while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  g.font = font(500, 12); const rw = right ? Math.min(g.measureText(right).width, w * 0.48) : 0;
  g.font = font(700, 14); g.fillStyle = '#f4f1ff';
  const lt = fit(left, w - x - rw - 24); g.fillText(lt, x, h / 2 + 1); x += g.measureText(lt).width + 8;
  if (tag) { g.fillStyle = iconColor; g.fillText(fit(tag, w - x - rw - 20), x, h / 2 + 1); }
  if (right) { g.font = font(500, 12); g.fillStyle = bg === '#0d0b1f' ? '#9a93c9' : '#f4f1ff'; g.textAlign = 'right'; g.fillText(fit(right, rw), w - 10, h / 2 + 1); g.textAlign = 'left'; }
  const d = g.getImageData(0, 0, w, h).data; let out = '';
  for (let i = 0; i < d.length; i += 0x8000) out += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
  return btoa(out);
}
