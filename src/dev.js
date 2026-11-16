// dev tools (dev.html only): F fly, B benchmark. Own implementation of the bench protocol.
{
  const CAP = 65536, lf = new Float32Array(CAP), lg = new Float32Array(CAP);
  let flying = false, bench = false, last = 0, nf = 0, ng = 0;
  const stop = () => { flying = bench = false; dynT = 0; };
  const stats = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of s) sum += v; return { n, avg: sum / n, p99: s[min(n - 1, floor(n * .99))], max: s[n - 1] }; };
  const fmt = (o) => `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms`;
  const report = () => { const f = stats(lf, nf); info.textContent = `Fly-through ${W}x${H}, ${f.n} frames\nframe  ${fmt(f)}\nGPU    ${ng ? fmt(stats(lg, ng)) : 'timestamp-query unavailable'}`; };
  const base = render;
  render = () => {
    if (flying) {
      const dtr = F[LAST] - last; last = F[LAST];
      F[FLT] += min(dtr / 1000, .1); flyAt();
      if (bench) { if (nf < CAP) lf[nf++] = dtr; if (F[GPU] > 0 && ng < CAP) lg[ng++] = F[GPU]; }
      if (F[FLT] >= FLYT) { if (bench) report(); stop(); }
    }
    base();
  };
  addEventListener('keydown', (e) => {
    if (menu || e.repeat) return;
    if (e.code === 'KeyF' || e.code === 'KeyB') {
      if (flying) stop();
      else { flying = true; bench = e.code === 'KeyB'; F[FLT] = 0; last = F[LAST]; nf = ng = 0; if (bench) { hud = false; info.textContent = ''; dynT = -Infinity; } }
    } else if (/Digit[1-6]/.test(e.code)) stop();
  });
}
