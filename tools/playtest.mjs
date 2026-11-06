// node tools/playtest.mjs <slug> <N>
// Really plays games/<slug>/v<N>/index.html in headless Chromium (960x540).
//   Generic checks: static check, no console errors, __jam hook, title -> playing, canvas changes,
//   every control key has an effect, FPS, 20 s of random input without exceptions, game over
//   reachable within 60 s with no input, restart from game over, reset() -> title.
//   Scenario checks: games/<slug>/v<N>/scenario.json, written by the playtester (see STUDIO.md).
// Game time runs on Playwright's fake clock, so runs are deterministic (seed 42) and a 60 s game
// takes a few real seconds. Writes playtest.json + screenshot.png next to the game and prints a
// summary of 6 lines or fewer ending in PLAYTEST PASS or PLAYTEST FAIL. Exit code 0 = pass.
// Regression: every saved bug repro (games/<slug>/v<=N>/repro-*.json) must still pass, and earlier
// versions' scenario.json files are replayed as advisory checks (a changes block may alter them).
// --only <file>: run just that scenario file from games/<slug>/v<N>/ (bug repro, probe), write nothing.
// A {"log":"name"} step prints the state at that moment (for exploring); it is never a check.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { ROOT, needSlug, versions, versionDir, fail } from './lib.mjs';

const slug = needSlug(process.argv[2]);
const n = Number(process.argv[3]);
if (!Number.isInteger(n) || n < 1) fail('Usage: node tools/playtest.mjs <slug> <N> [--only repro-1.json]');
const oi = process.argv.indexOf('--only');
const only = oi > 0 ? process.argv[oi + 1] : null;
if (oi > 0 && (!only || !/^[\w.-]+\.json$/.test(only))) fail('--only takes a file name in the version folder, e.g. repro-1.json');
const dir = versionDir(slug, n);
const gameFile = path.join(dir, 'index.html');
if (!fs.existsSync(gameFile)) fail(`games/${slug}/v${n}/index.html does not exist.`);

let chromium;
// Chromium lives inside the studio (.browsers/, made by setup) so a sandboxed agent can start it:
// Codex's Windows sandbox runs commands as a user that can't read %LOCALAPPDATA%ms-playwright.
const LOCAL_BROWSERS = path.join(ROOT, '.browsers');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(LOCAL_BROWSERS)) process.env.PLAYWRIGHT_BROWSERS_PATH = LOCAL_BROWSERS;
try { ({ chromium } = await import('playwright')); }
catch { fail('Playwright is missing. Run in the studio: npm install && npx playwright install chromium'); }

const T0 = Date.now();
const DEADLINE = T0 + 85_000;
const SEED = 42;
const checks = [];
const logs = [];   // {"log":"name"} steps: state snapshots printed for exploring, never a check
const add = (name, pass, detail = '', advisory = false) => {
  checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 300), ...(advisory && { advisory: true }) }); return pass;
};
const timeLeft = () => DEADLINE - Date.now();

// ---- servers: a private one for the test, and the studio one on :8080 for humans' links.
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const priv = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (e, data) => e ? res.writeHead(404).end('Not found')
    : res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data));
});
await new Promise(r => priv.listen(0, '127.0.0.1', r));
const gameUrl = `http://127.0.0.1:${priv.address().port}/games/${slug}/v${n}/`;
if (!only && !process.env.JAM_NO_SERVE) ensureStudioServer(); // JAM_NO_SERVE=1: verify/eval runs, no :8080

function ensureStudioServer() {
  const req = http.get('http://localhost:8080/', res => res.resume());
  req.on('error', () => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    child.unref();
  });
  req.setTimeout(1500, () => req.destroy());
}

// ---- static check first (cheap, catches most breakage)
if (!only) {
  const st = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check.mjs'), slug, String(n)], { encoding: 'utf8' });
  add('static check', st.status === 0, (st.stdout + st.stderr).trim().split('\n').slice(0, 3).join(' | '));
}

// ---- scenario files (validated up front)
function loadScenario(file) {
  if (!fs.existsSync(file)) return { steps: null, err: '' };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const steps = Array.isArray(raw) ? raw : raw.steps;
    if (!Array.isArray(steps)) throw new Error('expected an array of steps (or {"steps":[...]})');
    return { steps, err: '' };
  } catch (e) { return { steps: null, err: e.message }; }
}
const { steps: scenario, err: scenarioErr } = loadScenario(path.join(dir, only || 'scenario.json'));
if (only && !scenario) fail(`games/${slug}/v${n}/${only}: ${scenarioErr || 'not found'}`);
// Regression set: repros from every version up to N (hard), earlier scenario.json files (advisory).
const regressions = [];
if (!only) for (const v of versions(slug).filter(v => v <= n)) {
  const vdir = versionDir(slug, v);
  for (const f of fs.readdirSync(vdir).filter(f => /^repro-[\w-]+\.json$/.test(f)).sort())
    regressions.push({ tag: `[v${v} ${f.replace('.json', '')}]`, file: path.join(vdir, f), advisory: false });
  if (v < n) regressions.push({ tag: `[v${v} scenario]`, file: path.join(vdir, 'scenario.json'), advisory: true });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
let errors = [];   // console errors + uncaught exceptions, from every page
const watch = p => {
  p.on('pageerror', e => errors.push(`exception: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  p.on('request', r => { if (!r.url().startsWith(gameUrl.split('/games/')[0])) errors.push(`network request: ${r.url()}`); });
};

/** A fresh page on the fake clock, seeded and on the title screen. */
async function freshPage() {
  const p = await ctx.newPage(); watch(p);
  await p.clock.install({ time: 0 });
  // Paused: otherwise real time keeps flowing into the fake clock, so a slow machine (CI) sees
  // extra game time and timing-tight checks differ between machines. Only run() moves time now.
  await p.clock.pauseAt(1000);
  await p.goto(gameUrl, { waitUntil: 'load' });
  const ok = await p.evaluate(() => !!(window.__jam && window.__jam.state));
  if (!ok) throw new Error('window.__jam is missing');
  await p.evaluate(s => { __jam.seed(s); __jam.reset(); }, SEED);
  return p;
}
const state = p => p.evaluate(() => __jam.state());
// On the paused clock a busy loop that waits on performance.now()/Date.now() never ends, which
// freezes the page; cap each advance in real time so that becomes a FAIL instead of a hang.
const FREEZE_MS = 20_000;
const run = (p, ms) => {
  let timer;
  const frozen = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(
    `game froze: ${ms} ms of game time didn't finish in ${FREEZE_MS / 1000} s (a loop that waits on the clock?)`)), FREEZE_MS); });
  return Promise.race([p.clock.runFor(ms), frozen]).finally(() => clearTimeout(timer));
};
async function hold(p, key, ms) { await p.keyboard.down(key); await run(p, ms); await p.keyboard.up(key); }
/** 48x27 grayscale thumbnail of the canvas, to tell whether anything on screen changed. */
const pixels = p => p.evaluate(() => {
  const c = document.querySelector('canvas'); if (!c) return [];
  const t = document.createElement('canvas'); t.width = 48; t.height = 27;
  const g = t.getContext('2d'); g.drawImage(c, 0, 0, 48, 27);
  const d = g.getImageData(0, 0, 48, 27).data, out = [];
  for (let i = 0; i < d.length; i += 4) out.push((d[i] + d[i + 1] + d[i + 2]) / 3);
  return out;
});
const pixDiff = (a, b) => a.length && a.length === b.length ? a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length : 0;
const stateDiff = (a, b) => Object.keys({ ...a, ...b })
  .filter(k => !['time', 'frame'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
const KEYBOARD = /^(Arrow(Up|Down|Left|Right)|Key[A-Z]|Digit\d|Space|Enter|Shift(Left|Right)|Control(Left|Right)|Tab|Escape|Backspace)$/;

/** Runs one scenario on a fresh page. Each expect becomes a check named `<tag> <label>`. */
async function runScenario(steps, tag = '', advisory = false) {
  const pre = tag ? `${tag} ` : '';
  const p = await freshPage();
  const start = await state(p); const marks = {};
  for (const [i, s] of steps.entries()) {
    const where = `${pre}step ${i + 1}`;
    if (timeLeft() < 5_000) {
      // An advisory replay cut short by the budget is skipped, not failed; a hard scenario cut short fails.
      if (advisory) checks.push({ name: `${where}: skipped`, pass: true, detail: 'skipped: time budget', advisory: true, skipped: true });
      else add(`${where}: time budget`, false, 'playtest ran out of time');
      break;
    }
    if (s.call) {
      if (!['start', 'reset'].includes(s.call)) { add(`${where}: call`, false, `unknown call "${s.call}" (use start or reset)`, advisory); continue; }
      await p.evaluate(c => __jam[c](), s.call);
    } else if (s.seed !== undefined) await p.evaluate(v => __jam.seed(v), Number(s.seed));
    else if (s.press) {
      if (!KEYBOARD.test(s.press)) { add(`${where}: press`, false, `unsupported key "${s.press}"`, advisory); continue; }
      await hold(p, s.press, Number(s.ms) || 100);
    } else if (s.wait !== undefined) await run(p, Number(s.wait));
    else if (s.mark) marks[s.mark] = await state(p);
    else if (s.log) logs.push(`LOG ${pre}${s.log}: ${JSON.stringify(await state(p))}`.slice(0, 240));
    else if (s.expect) {
      const res = await p.evaluate(({ expr, start, marks }) => {
        const state = __jam.state();
        try { return { ok: !!new Function('state', 'start', 'marks', `return (${expr});`)(state, start, marks), state }; }
        catch (e) { return { ok: false, err: e.message, state }; }
      }, { expr: s.expect, start, marks });
      const brief = JSON.stringify(res.state).slice(0, 160);
      add(pre + (s.label || s.expect), res.ok, res.err ? `error in "${s.expect}": ${res.err}` : `${s.expect} -> state ${brief}`, advisory);
    } else add(`${where}: unknown step`, false, JSON.stringify(s).slice(0, 80), advisory);
  }
  await p.close();
}

let fps = 0, controls = [], screenshotOk = false;
try {
  if (only) await runScenario(scenario, `[${only.replace('.json', '')}]`);
  else {
  // 1. Real-time load: errors, hook, title, FPS.
  const live = await ctx.newPage(); watch(live);
  await live.goto(gameUrl, { waitUntil: 'load' });
  await live.waitForTimeout(400);
  const hook = await live.evaluate(() => {
    const j = window.__jam; if (!j) return null;
    return { fns: ['state', 'start', 'reset', 'seed'].filter(f => typeof j[f] === 'function'), controls: Array.isArray(j.controls) ? j.controls : null };
  });
  add('__jam hook', hook && hook.fns.length === 4 && hook.controls, hook ? `functions: ${hook.fns.join(',')}; controls: ${JSON.stringify(hook.controls)}` : 'window.__jam missing');
  if (!hook || hook.fns.length < 4) throw new Error('cannot play without window.__jam');
  controls = hook.controls || [];
  add('loads without errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  const s0 = await live.evaluate(() => __jam.state());
  add('starts on title screen', s0.scene === 'title', `scene=${s0.scene}`);
  await live.evaluate(() => __jam.start());
  fps = await live.evaluate(() => new Promise(res => {
    let f = 0; const t0 = performance.now();
    const tick = () => { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(f * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  add('frame rate >= 30 fps', fps >= 30, `${fps} fps in headless Chromium`);
  await live.close();

  // 2. title -> playing, and the screen moves.
  let p = await freshPage();
  const before = await pixels(p);
  const s1 = await p.evaluate(() => __jam.start());
  add('start() -> playing', s1.scene === 'playing', `scene=${s1.scene}`);
  await run(p, 1000);
  add('canvas changes within 1 s', pixDiff(before, await pixels(p)) > 0.5, 'compared 48x27 thumbnails');
  await p.close();

  // 3. Each control key changes the state or the picture (vs. the same run with no input). Runs
  //    before the scenario: it is cheap, and a key skipped for time would hide a dead control.
  const keyList = controls.filter(k => KEYBOARD.test(k));
  if (!keyList.length) add('controls listed', false, `__jam.controls has no keyboard keys: ${JSON.stringify(controls)}`);
  const base = await freshPage(); await base.evaluate(() => __jam.start()); await run(base, 600);
  const baseState = await state(base), basePix = await pixels(base); await base.close();
  for (const key of keyList) {
    const q = await freshPage(); await q.evaluate(() => __jam.start()); await hold(q, key, 600);
    const ds = stateDiff(baseState, await state(q)), dp = pixDiff(basePix, await pixels(q));
    add(`key ${key} has an effect`, ds.length || dp > 0.5, ds.length ? `changes ${ds.slice(0, 4).join(', ')}` : dp > 0.5 ? 'changes the picture' : 'no change to state or picture after 600 ms');
    await q.close();
  }

  // 2b. The acceptance scenario and every saved bug repro run next, before the generic checks
  //     below, which shrink themselves to fit the remaining time budget.
  if (scenarioErr) add('scenario.json valid', false, scenarioErr);
  else if (!scenario) add('scenario.json present', false, 'missing: the playtester writes it from the Acceptance list');
  else await runScenario(scenario);
  for (const r of regressions.filter(r => !r.advisory)) {
    const { steps, err } = loadScenario(r.file);
    if (err) add(`${r.tag} valid`, false, err);
    else if (steps) await runScenario(steps, r.tag);
  }

  // 4. Mid-game screenshot (canvas only, after 2.5 s of play with some input).
  p = await freshPage(); await p.evaluate(() => __jam.start());
  for (let i = 0; i < 5; i++) { if (keyList.length) await hold(p, keyList[i % keyList.length], 250); else await run(p, 250); await run(p, 250); }
  const png = await p.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png') || '');
  if (png.startsWith('data:image/png;base64,')) { fs.writeFileSync(path.join(dir, 'screenshot.png'), Buffer.from(png.split(',')[1], 'base64')); screenshotOk = true; }
  await p.close();

  // 5. 20 s of random input: no exceptions.
  p = await freshPage(); await p.evaluate(() => __jam.start());
  const errBefore = errors.length; let r = 7, restarts = 0;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pool = [...keyList, 'Space', 'Enter'];
  for (let t = 0; t < 20_000 && timeLeft() > 30_000;) {
    const ms = 100 + Math.floor(rnd() * 300);
    await hold(p, pool[Math.floor(rnd() * pool.length)], ms); t += ms;
    if ((await state(p)).scene === 'over') { await run(p, 700); await p.evaluate(() => __jam.start()); restarts++; t += 700; }
  }
  add('20 s random input, no exceptions', errors.length === errBefore, errors.length > errBefore ? errors.slice(errBefore, errBefore + 2).join(' | ') : `${restarts} restarts`);
  await p.close();

  // 6. Game over reachable within 60 s with no input, then restart; reset() -> title.
  p = await freshPage(); await p.evaluate(() => __jam.start());
  let over = false, secs = 0;
  for (; secs < 60 && timeLeft() > 15_000; secs++) { await run(p, 1000); if ((await state(p)).scene === 'over') { over = true; break; } }
  const scenarioCoversOver = (scenario || []).some(s => s && typeof s.expect === 'string' && s.expect.includes("'over'"));
  if (over) {
    add('game over reachable (no input)', true, `over after ${secs + 1} s`);
    await run(p, 800); await p.keyboard.press('Space'); await run(p, 100);
    const sr = await state(p);
    add('restart from game over', sr.scene === 'playing', `Space after game over -> scene=${sr.scene}`);
  } else {
    add('game over reachable (no input)', scenarioCoversOver, scenarioCoversOver ? 'not with no input; scenario.json covers it' : `still playing after ${secs} s with no input`);
  }
  const rs = await p.evaluate(() => __jam.reset());
  add('reset() -> title', rs.scene === 'title', `scene=${rs.scene}`);
  await p.close();

  // 7. Advisory replays of earlier versions' scenarios, last and only if time allows.
  for (const r of regressions.filter(r => r.advisory)) {
    if (timeLeft() < 20_000) { checks.push({ name: `${r.tag} skipped`, pass: true, detail: 'skipped: time budget', advisory: true, skipped: true }); continue; }
    const { steps, err } = loadScenario(r.file);
    if (err) add(`${r.tag} valid`, false, err, true);
    else if (steps) await runScenario(steps, r.tag, true);
  }
  }
} catch (e) {
  add('playtest ran to the end', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
  priv.close();
}

// ---- report
// Which coding agent ran this playtest (shown on the "How this game was made" page). Detected from
// the environment each CLI sets for its shell commands, so agents need no extra step.
const env = Object.keys(process.env);
const RUNNER = env.some(k => /^CODEX_/.test(k)) ? 'GPT · Codex' : process.env.CLAUDECODE ? 'Claude' : undefined;
const hard = checks.filter(c => !c.advisory), adv = checks.filter(c => c.advisory && !c.skipped);
const advSkipped = checks.filter(c => c.skipped).length;
const failed = hard.filter(c => !c.pass), advFailed = adv.filter(c => !c.pass);
const pass = failed.length === 0;
const seconds = +((Date.now() - T0) / 1000).toFixed(1);
if (!only) {
  const report = {
    slug, version: n, pass, when: new Date().toISOString(), runner: RUNNER, seed: SEED, fps, controls, seconds,
    screenshot: screenshotOk ? 'screenshot.png' : null, checks,
  };
  fs.writeFileSync(path.join(dir, 'playtest.json'), JSON.stringify(report, null, 2) + '\n');
}
const lines = [only
  ? `${slug} v${n} ${only}: ${hard.length - failed.length}/${hard.length} checks passed, ${seconds}s (nothing written)`
  : `${slug} v${n}: ${hard.length - failed.length}/${hard.length} checks passed, ${fps} fps, ${seconds}s`];
lines.push(...logs.slice(0, 20));
for (const c of failed.slice(0, 4)) lines.push(`FAIL ${c.name}: ${c.detail}`.slice(0, 200));
if (adv.length || advSkipped) lines.push((`Advisory (earlier versions' scenarios): ${adv.length - advFailed.length}/${adv.length} still hold`
  + (advFailed.length ? `; first change: ${advFailed[0].name}` : '') + (advSkipped ? `; ${advSkipped} skipped (time budget)` : '')).slice(0, 200));
lines.push(pass ? 'PLAYTEST PASS' : 'PLAYTEST FAIL');
console.log(lines.join('\n'));
process.exit(pass ? 0 : 1);
