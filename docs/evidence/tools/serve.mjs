// Static server for the cloned repo + a WebGPU adapter probe page.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = 'C:/test/AGY_Aqua_webGPU/_original_abyssal-garden';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain' };
const PROBE = `<!doctype html><meta charset=utf-8><body><script>
(async () => {
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!a) { document.body.textContent = JSON.stringify({ adapter: null }); return; }
    const i = a.info || {};
    const d = await a.requestDevice();
    document.body.textContent = JSON.stringify({ vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, features: [...a.features], limits: { maxTextureDimension2D: a.limits.maxTextureDimension2D, maxBufferSize: a.limits.maxBufferSize } });
  } catch (e) { document.body.textContent = JSON.stringify({ error: String(e) }); }
})();
</script></body>`;
http.createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__probe.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PROBE); return; }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(path.resolve(ROOT))) throw new Error('bad path');
    const data = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found: ' + req.url); }
}).listen(8123, '127.0.0.1', () => console.log('serving on http://127.0.0.1:8123'));
