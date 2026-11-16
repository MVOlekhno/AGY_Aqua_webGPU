// chrome://gpu deep text extraction (shadow DOM).
import { connect, sleep, evaljs } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const c = await connect();
await c.send('Page.enable');
await c.send('Runtime.enable');
await c.send('Page.navigate', { url: 'chrome://gpu' });
await sleep(6000);
const expr = `(() => {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); return; }
    if (n.shadowRoot) for (const ch of n.shadowRoot.childNodes) walk(ch);
    for (const ch of n.childNodes || []) walk(ch);
  };
  walk(document.body);
  return out.join('\\n');
})()`;
const txt = await evaljs(c, expr);
writeFileSync('C:/test/AGY_Aqua_webGPU/docs/evidence/chrome_gpu.txt', txt);
console.log('bytes:', txt.length);
const keys = txt.split('\n').filter((l) => /WebGPU|GL_RENDERER|GL_VENDOR|NVIDIA|Remote Display|SwiftShader|Software|Hardware|Dawn|D3D12|Direct3D|ANGLE|Vulkan|Graphics Feature|Canvas|Compositing|Rasterization|WebGL|Adapter|adapter|Driver/i.test(l));
console.log(keys.slice(0, 80).join('\n'));
c.close();
