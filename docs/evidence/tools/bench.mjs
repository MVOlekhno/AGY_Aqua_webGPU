// 60 s benchmark fly-through of dev.html on the GTX 1080 Ti + six viewpoint screenshots.
// Drives the real page through CDP. The page's own dev.js report (info element) is the
// authoritative benchmark log; an injected zero-alloc rAF logger cross-checks frame times.
import { connect, sleep, evaljs } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const EV = 'C:/test/AGY_Aqua_webGPU/docs/evidence';
mkdirSync(EV, { recursive: true });
const c = await connect();
const consoleLines = [];
c.on((m) => {
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    consoleLines.push(`[console.${m.params.type}] ${txt}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleLines.push('[exception] ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  } else if (m.method === 'Log.entryAdded') {
    consoleLines.push(`[log.${m.params.entry.level}] ${m.params.entry.text}`);
  }
});
await c.send('Page.enable');
await c.send('Runtime.enable');
await c.send('Log.enable');
await c.send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false });
// Preset High quality + full 2560x1440 pixel budget + det 1; clear crash flag. Zero-alloc rAF logger.
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  try { localStorage.setItem('abyssal', '0,3686400,1'); localStorage.removeItem('abyssalLoad'); } catch (e) {}
  window.__fl = new Float64Array(16384); window.__fln = 0;
  const __raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => __raf((t) => { if (window.__fln < 16384) window.__fl[window.__fln++] = t; cb(t); });
` });
await c.send('Page.navigate', { url: 'http://127.0.0.1:8123/dev.html' });
await c.send('Page.bringToFront');
console.log('loading dev.html ...');
// wait for the menu (body class 'm'), then immediately Dive + press B before the resolution controller tunes
let ready = false;
for (let i = 0; i < 2400; i++) {
  await sleep(50);
  const st = await evaljs(c, `document.body.className + '|' + (document.getElementById('s') ? document.getElementById('s').textContent : '')`).catch(() => '');
  if (i % 40 === 0) console.log('  state:', st);
  if (st.startsWith('m')) { ready = true; break; }
  if (st.includes('l e')) { console.log('FAILED TO START:', st); break; }
}
if (!ready) { console.log('menu never appeared; aborting'); writeFileSync(EV + '/console.log', consoleLines.join('\n')); c.close(); process.exit(1); }
const t0 = Date.now();
await evaljs(c, `document.getElementById('d').click(); dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b', bubbles: true })); 'started'`);
console.log('benchmark started (B). waiting ~65 s ...');
let report = '';
for (let i = 0; i < 200; i++) {
  await sleep(500);
  report = await evaljs(c, `document.getElementById('i').textContent`).catch(() => '');
  if (i === 60) { // ~30 s: mid-flight screenshot
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(EV + '/fly_mid.png', Buffer.from(shot.data, 'base64'));
  }
  if (report.includes('Fly-through')) break;
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('=== dev.js benchmark report (raw) ===');
console.log(report);
// independent frame stats from the injected logger
const fl = await evaljs(c, `Array.from(window.__fl.subarray(0, window.__fln))`);
const deltas = [];
for (let i = 1; i < fl.length; i++) deltas.push(fl[i] - fl[i - 1]);
const st = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; const sum = s.reduce((p, v) => p + v, 0); return { n, avg: sum / n, p99: s[Math.min(n - 1, Math.floor(n * 0.99))], max: s[n - 1] }; };
const indep = deltas.length ? st(deltas) : null;
const canvasWH = await evaljs(c, `document.getElementById('c').width + 'x' + document.getElementById('c').height`);
const raw = {
  date: new Date().toISOString(),
  gpu: 'NVIDIA GeForce GTX 1080 Ti (Pascal), driver 32.0.15.7688, Chrome 157.0.8103.51, D3D12/Dawn',
  url: 'http://127.0.0.1:8123/dev.html',
  viewport: '2560x1440 @ DPR 1 (Emulation.setDeviceMetricsOverride)',
  quality: 'High (LV=0), preset localStorage abyssal=0,3686400,1',
  elapsed_s: +elapsed,
  canvas_wh: canvasWH,
  devjs_report: report,
  independent_raf_frame_ms: indep,
  console: consoleLines,
};
writeFileSync(EV + '/benchmark_raw.json', JSON.stringify(raw, null, 2));
writeFileSync(EV + '/benchmark_report.txt', report + '\n');
writeFileSync(EV + '/console.log', consoleLines.join('\n') + '\n');
console.log('=== independent rAF frame ms ===', JSON.stringify(indep));
console.log('canvas:', canvasWH, ' elapsed:', elapsed, 's');
// six viewpoints
for (let k = 1; k <= 6; k++) {
  await evaljs(c, `dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit${k}', key: '${k}', bubbles: true })); 'pose'`);
  await sleep(2500);
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(EV + `/pose${k}.png`, Buffer.from(shot.data, 'base64'));
  console.log('saved pose' + k + '.png');
}
writeFileSync(EV + '/console.log', consoleLines.join('\n') + '\n');
console.log('=== console (' + consoleLines.length + ' lines) ===');
console.log(consoleLines.slice(0, 40).join('\n'));
c.close();
