// world layout + procedural content (load-time). From scratch for AGY_Aqua.
const MESAS = [
  [-37, -42, -33, -22, 9, -7, 3.5, 2], [-29, -15, -33, 5, 12, -14, 3, 2], [-36, 11, -30, 27, 9, -5, 4, 2],
  [30, -45, 35, -27, 9, -9, 4, 2], [37, -20, 31, -3, 11, -16, 3, 2], [32, 5, 35, 9, 7, -8, 4, 2],
  [6, -88, 6, -88, 10, -34, 0, 0], [0, -106, 0, -106, 8, 3, 2, 2],
  [-17, 62, -19, 78, 10, -6, 9, 3], [-21, 84, -18, 100, 11, -9, 8, 3], [22, 67, 24, 80, 7, -11, 6, 2],
];
const ARCHES = [
  [-23, -9.5, -16, 0.3, 4.2, 1.4, 1.2],
  [0, -45, -34, 1.57, 14, 2.7, 1.2],
];
function primBuffer() {
  const a = [];
  for (const m of MESAS) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]);
  for (const m of ARCHES) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], 0);
  return new Float32Array(a);
}

function buildTerrain(D) {
  const sn = surfaceNets(D, NX, NY, NZ), nv = sn.nv, gp = sn.pos;
  const smp = sampler3(D, NX, NY, NZ);
  const vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  const wp = new Float32Array(nv * 3), wn = new Float32Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    const x = gp[k * 3], y = gp[k * 3 + 1], z = gp[k * 3 + 2], e = 0.8;
    let nx = smp(x - e, y, z) - smp(x + e, y, z), ny = smp(x, y - e, z) - smp(x, y + e, z), nz = smp(x, y, z - e) - smp(x, y, z + e);
    const l = hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const X = OX + x * VS, Y = OY + y * VS, Z = OZ + z * VS;
    wp[k * 3] = vf[k * 4] = X; wp[k * 3 + 1] = vf[k * 4 + 1] = Y; wp[k * 3 + 2] = vf[k * 4 + 2] = Z;
    wn[k * 3] = nx; wn[k * 3 + 1] = ny; wn[k * 3 + 2] = nz;
    v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = 127;
  }
  const nq = sn.ni / 6, key = new Uint8Array(nq), cnt = new Uint32Array(CELLS * CELLS + 1);
  const lo = new Float32Array(CELLS * CELLS).fill(1e9), hi = new Float32Array(CELLS * CELLS).fill(-1e9);
  for (let q = 0; q < nq; q++) {
    const a = sn.idx[q * 6] * 3;
    const c = clamp(floor((wp[a] - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((wp[a + 2] - OZ) / CELLW), 0, CELLS - 1);
    key[q] = c; cnt[c + 1]++;
    for (let j = 0; j < 6; j++) { const y = wp[sn.idx[q * 6 + j] * 3 + 1]; if (y < lo[c]) lo[c] = y; if (y > hi[c]) hi[c] = y; }
  }
  for (let c = 0; c < CELLS * CELLS; c++) cnt[c + 1] += cnt[c];
  const ib = new Uint32Array(sn.ni), fill = cnt.slice();
  for (let q = 0; q < nq; q++) { const o = fill[key[q]]++ * 6; for (let j = 0; j < 6; j++) ib[o + j] = sn.idx[q * 6 + j]; }
  return { vb, ib, nv, wp, wn, smp, start: cnt, lo, hi };
}

function makeWorld(D, T) {
  const gi = (x, y, z) => x + NX * (y + NY * z);
  const smp = T.smp;
  const Dw = (x, y, z) => smp((x - OX) / VS, (y - OY) / VS, (z - OZ) / VS);
  const gy = (x, z) => {
    const ix = clamp(round((x - OX) / VS), 1, NX - 2), iz = clamp(round((z - OZ) / VS), 1, NZ - 2);
    let ceil = 3;
    for (let y = NY - 2; y >= 0; y--) {
      const d = D[gi(ix, y, iz)], da = D[gi(ix, y + 1, iz)];
      if (da <= 0 && d > 0) return OY + (y + d / (d - da)) * VS;
    }
    return -45;
  };
  // heightmap 512x512 r32float (world Y of seabed)
  const height = new Float32Array(512 * 512);
  for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) {
    const x = (i + .5) / 512 * 384 - 192, z = (j + .5) / 512 * 384 - 192;
    height[i + 512 * j] = gy(x, z);
  }
  // half-res volume: r openness, g skylight
  const hx = NX / 2, hy = NY / 2, hz = NZ / 2, volD = new Uint8Array(hx * hy * hz * 2);
  let Lp = new Float32Array(hx * hz).fill(1), Ln = new Float32Array(hx * hz), tmp = new Float32Array(hx * hz);
  for (let y = hy - 1; y >= 0; y--) {
    for (let z = 0; z < hz; z++) for (let x = 0; x < hx; x++) { const i = x + hx * z; tmp[i] = (Lp[x > 0 ? i - 1 : i] + 2 * Lp[i] + Lp[x < hx - 1 ? i + 1 : i]) * .25; }
    for (let z = 0; z < hz; z++) for (let x = 0; x < hx; x++) {
      const i = x + hx * z, b = (tmp[z > 0 ? i - hx : i] + 2 * tmp[i] + tmp[z < hz - 1 ? i + hx : i]) * .25;
      const g0 = gi(x * 2, y * 2, z * 2);
      const d = (D[g0] + D[g0 + 1] + D[g0 + NX] + D[g0 + NX + 1] + D[g0 + NX * NY] + D[g0 + NX * NY + 1] + D[g0 + NX * NY + NX] + D[g0 + NX * NY + NX + 1]) * .125;
      const o = x + hx * (y + hy * z);
      Ln[i] = b * clamp(0.5 - d / 1.5, 0, 1);
      volD[o * 2] = clamp(0.5 - d / 12, 0, 1) * 255; volD[o * 2 + 1] = min(1, b) * 255;
    }
    const t = Lp; Lp = Ln; Ln = t;
  }
  // ground map: r sand, b zone, a mottle
  const gm = new Uint8Array(512 * 512 * 4);
  for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) {
    const x = (i + .5) / 512 * 384 - 192, z = (j + .5) / 512 * 384 - 192, o = (i + 512 * j) * 4;
    gm[o] = sstep(.42, .6, fbm(x * .04, 3, z * .04, 3)) * 255; gm[o + 2] = 0; gm[o + 3] = 128;
  }
  // whales: ibWhale 48 B (a=center+R, b=omega,phase,scale,seed, c=depthY,vertAmp,pitchBias,spare)
  const whales = new Float32Array([
    0, 0, -20, 34, 0.05, 0.0, 14, 0.1, -25, 1.5, 0.0, 0,
    -40, 0, 30, 26, 0.06, 2.1, 12, 0.5, -20, 1.3, 0.05, 0,
    30, 0, 60, 30, 0.045, 4.0, 15, 0.8, -30, 1.6, -0.04, 0,
  ]);
  // inscription: 3 copies on the seabed
  const garr = [];
  rseed(42);
  const centers = [[-8, -6], [-30, -70], [10, 66]];
  layInscription(gy, centers, garr);
  const glyphs = new Float32Array(garr);
  const parr = [];
  for (const c of centers) { const cx = c[0] - 6.6, cz = c[1] - 0.75; parr.push(cx, gy(cx, cz) + 0.05, cz, 1, 0, 0, 0, 0); }
  const plaques = new Float32Array(parr);
  // conforming dark sheet under each word (follows seabed)
  const pm = new Mesh();
  for (const c of centers) {
    const base = pm.p.length / 3, NXQ = 17, NZQ = 5;
    for (let iz = 0; iz < NZQ; iz++) for (let ix = 0; ix < NXQ; ix++) {
      const x = c[0] - 14 + ix * (15 / (NXQ - 1)), z = c[1] - 2.4 + iz * (3.4 / (NZQ - 1));
      pm.v(x, gy(x, z) + 0.04, z, 1);
    }
    for (let iz = 0; iz < NZQ - 1; iz++) for (let ix = 0; ix < NXQ - 1; ix++) { const a = base + iz * NXQ + ix; pm.quad(a, a + 1, a + 1 + NXQ, a + NXQ); }
  }
  const plaqueMesh = pm.build();
  return { gy, height, volD, gm, whales, glyphs, plaques, plaqueMesh };
}

// whale mesh: loft body (aux=u longitudinal), fluke lobes (aux~1), pectoral fins (aux<0)
function meshWhale() {
  const m = new Mesh(), N = 26, M = 10, rings = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = -0.5 + u;
    let r = 0.16 * pow(sin(PI * clamp(u * 1.05, 0, 1)), 0.7) + 0.02;
    if (u > 0.8) r *= 1 + (u - 0.8) * 1.2; // head bulge
    const ry = r * 0.95, rz = r * 0.75, ring = [];
    for (let k = 0; k < M; k++) { const a = k / M * TAU; ring.push(m.v(x, sin(a) * ry, cos(a) * rz, u)); }
    rings.push(ring);
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) { const k2 = (k + 1) % M; m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
  // fluke lobes (tail at -x), broad flattened lobes, aux=1 so they wave strongly
  for (const s of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 4; i++) pts.push([-0.5 - i * 0.04, 0, s * i * 0.16]);
    m.tube(pts, (k) => 0.13 * (1 - k / 6), 6, true, () => 1);
  }
  // pectoral fins aux<0 (span), broad flippers
  for (const s of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 3; i++) pts.push([0.1 - i * 0.04, -0.05, s * (0.16 + i * 0.06)]);
    m.tube(pts, (k) => 0.07 * (1 - k / 5), 5, true, (k) => -(k / 3));
  }
  return m.build();
}
// dark basalt plaque under each inscription word (contrast underlay)
function meshPlaque() {
  const m = new Mesh(), X = 7.4, Y = 0.06, Z = 1.4;
  const v = [[-X, -Y, -Z], [X, -Y, -Z], [X, -Y, Z], [-X, -Y, Z], [-X, Y, -Z], [X, Y, -Z], [X, Y, Z], [-X, Y, Z]];
  for (const p of v) m.v(p[0], p[1], p[2], 1);
  const F = [[4, 5, 6], [4, 6, 7], [0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
  for (const f of F) m.tri(f[0], f[1], f[2]);
  return m.build();
}
// small shell (octahedron, 8 tris) for inscription pebbles
function meshShell() {
  const m = new Mesh();
  const v = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  for (const p of v) m.v(p[0] * .5, p[1] * .5, p[2] * .5, 1);
  const F = [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]];
  for (const f of F) m.tri(f[0], f[1], f[2]);
  return m.build();
}
