// Minimal CDP client over Node's built-in WebSocket (no deps).
export async function connect(port = 9223, pick = 'page', host = '127.0.0.1') {
  const list = await (await fetch(`http://${host}:${port}/json`)).json();
  const t = list.find((x) => x.type === pick);
  if (!t) throw new Error('no target of type ' + pick);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), handlers = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(m.method + ': ' + JSON.stringify(m.error))) : p.res(m.result);
    } else if (m.method) for (const h of handlers) h(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { send, on: (h) => handlers.push(h), close: () => ws.close(), url: t.url };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function evaljs(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result.value;
}
