// The headless player shared by playtest.mjs (the test) and clip.mjs (the GIF of the test).
// One browser setup, one fake clock, one scenario step runner: a clip is the same deterministic run
// as the playtest (seed 42, paused fake clock aligned to the 16 ms frame grid), just with a camera.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ROOT, fail } from './lib.mjs';

export const SEED = 42;
export const KEYBOARD = /^(Arrow(Up|Down|Left|Right)|Key[A-Z]|Digit\d|Space|Enter|Shift(Left|Right)|Control(Left|Right)|Tab|Escape|Backspace)$/;

/** Playwright's chromium. Chromium lives inside the studio (.browsers/, made by setup) so a sandboxed
 *  agent can start it: Codex's Windows sandbox runs commands as a user that can't read %LOCALAPPDATA%ms-playwright. */
export async function loadChromium() {
  const local = path.join(ROOT, '.browsers');
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(local)) process.env.PLAYWRIGHT_BROWSERS_PATH = local;
  try { return (await import('playwright')).chromium; }
  catch { fail('Playwright is missing. Run in the studio: npm install && npx playwright install chromium'); }
}

/** A private static server over the studio folder on a random port. Resolves { origin, close }. */
export async function startServer() {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif' };
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, path.normalize(url));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (e, data) => e ? res.writeHead(404).end('Not found')
      : res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

// On the paused clock a busy loop that waits on performance.now()/Date.now() never ends, which
// freezes the page; cap each advance in real time so that becomes a FAIL instead of a hang.
export const FREEZE_MS = 20_000;
export function guard(clockMove, what) {
  let timer;
  const frozen = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(
    `game froze: ${what} didn't finish in ${FREEZE_MS / 1000} s (a loop that waits on the clock?)`)), FREEZE_MS); });
  return Promise.race([clockMove, frozen]).finally(() => clearTimeout(timer));
}
// Long waits move the clock in 1 s slices, each under the guard: a healthy 60 s wait can take more
// than 20 s of real time on a slow machine (CI), while a frozen game stalls inside a single slice.
// Same timers fire at the same fake times as one big runFor, so results don't change.
export const CHUNK_MS = 1000;
export async function run(p, ms) {
  for (let done = 0; done < ms; done += CHUNK_MS) {
    const step = Math.min(CHUNK_MS, ms - done);
    await guard(p.clock.runFor(step), `${step} ms of game time (at ${done} of ${ms} ms)`);
  }
}
export async function hold(p, key, ms, advance = run) { await p.keyboard.down(key); await advance(p, ms); await p.keyboard.up(key); }
export const state = p => p.evaluate(() => __jam.state());

/** A fresh page on the fake clock, seeded and on the title screen. */
export async function freshPage(ctx, url, { watch, seed = SEED } = {}) {
  const p = await ctx.newPage(); if (watch) watch(p);
  await p.clock.install({ time: 0 });
  // Paused: otherwise real time keeps flowing into the fake clock, so a slow machine (CI) sees
  // extra game time and timing-tight checks differ between machines. Only run() moves time now.
  await p.clock.pauseAt(1000);
  await p.goto(url, { waitUntil: 'load' });
  const ok = await p.evaluate(() => !!(window.__jam && window.__jam.state));
  if (!ok) throw new Error('window.__jam is missing');
  // The page's load time still depends on machine speed (Playwright replays the paused clock at
  // the real time it was paused), and fake frames fire on a 16 ms grid, so the game loop's phase
  // differed by a step between runs. Jump to the next grid point >= 1 s ahead: one frame with a
  // long gap, so a fixed-step loop clamps it and drops its leftover time; every run then lines up.
  const t = await p.evaluate(() => performance.now());
  await guard(p.clock.fastForward(1000 + ((16 - (t % 16)) % 16)), 'the first frame');
  await p.evaluate(s => { __jam.seed(s); __jam.reset(); }, seed);
  return p;
}

/** Reads a scenario file: { steps } or { steps: null, err }. A missing file is { steps: null, err: '' }. */
export function loadScenario(file) {
  if (!fs.existsSync(file)) return { steps: null, err: '' };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const steps = Array.isArray(raw) ? raw : raw.steps;
    if (!Array.isArray(steps)) throw new Error('expected an array of steps (or {"steps":[...]})');
    return { steps, err: '' };
  } catch (e) { return { steps: null, err: e.message }; }
}

/** Game time a scenario spends (press ms default 100, waits), for planning a clip. */
export const scenarioMs = steps => steps.reduce((t, s) => t + (s.press ? Number(s.ms) || 100 : s.wait !== undefined ? Number(s.wait) || 0 : 0), 0);

/**
 * Plays scenario steps on page p (see STUDIO.md for the step language). Reports through hooks:
 *   stop(where) -> true to stop before a step (time budget), bad(where, what, detail) for a bad step,
 *   log(name, state), expect(step, { ok, err, state }, index), advance(p, ms) moves game time (default run).
 */
export async function playSteps(p, steps, hooks = {}) {
  const advance = hooks.advance || run;
  const start = await state(p); const marks = {};
  for (const [i, s] of steps.entries()) {
    const where = `step ${i + 1}`;
    if (hooks.stop && hooks.stop(where)) break;
    if (s.call) {
      if (!['start', 'reset'].includes(s.call)) { hooks.bad?.(where, 'call', `unknown call "${s.call}" (use start or reset)`); continue; }
      await p.evaluate(c => __jam[c](), s.call);
    } else if (s.seed !== undefined) await p.evaluate(v => __jam.seed(v), Number(s.seed));
    else if (s.press) {
      if (!KEYBOARD.test(s.press)) { hooks.bad?.(where, 'press', `unsupported key "${s.press}"`); continue; }
      await hold(p, s.press, Number(s.ms) || 100, advance);
    } else if (s.wait !== undefined) await advance(p, Number(s.wait));
    else if (s.mark) marks[s.mark] = await state(p);
    else if (s.log) hooks.log?.(s.log, await state(p));
    else if (s.expect) {
      const res = await p.evaluate(({ expr, start, marks }) => {
        const state = __jam.state();
        try { return { ok: !!new Function('state', 'start', 'marks', `return (${expr});`)(state, start, marks), state }; }
        catch (e) { return { ok: false, err: e.message, state }; }
      }, { expr: s.expect, start, marks });
      hooks.expect?.(s, res, i);
    } else hooks.bad?.(where, 'unknown step', JSON.stringify(s).slice(0, 80));
  }
}
