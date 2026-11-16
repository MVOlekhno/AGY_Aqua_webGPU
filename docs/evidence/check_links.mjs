// Verifies every file:line citation in docs/ANALYSIS.md against the pinned SHA of the
// original repo. For citations preceded by a `code token`, checks the token literally
// occurs on that line (whitespace-insensitive). Reports counts + mismatches.
// Usage: node check_links.mjs [pathToClone] [sha]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const ROOT = 'C:/test/AGY_Aqua_webGPU';
const CLONE = process.argv[2] || ROOT + '/_original_abyssal-garden';
const SHA = process.argv[3] || 'a596354eff400d458bc2aeb9bdf5e0a9734b2bcf';
const md = readFileSync(ROOT + '/docs/ANALYSIS.md', 'utf8');
const cache = new Map();
function lines(file) {
  if (!cache.has(file)) {
    try { cache.set(file, execFileSync('git', ['-C', CLONE, 'show', `${SHA}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n')); }
    catch { cache.set(file, null); }
  }
  return cache.get(file);
}
const norm = (s) => s.replace(/\s+/g, '');
const citRe = /\(`?([A-Za-z0-9_./-]+\.(?:js|mjs|html|txt|md|json)):(\d+)`?\)/g;
const pairRe = /`([^`]+)`\s*\(`?([A-Za-z0-9_./-]+\.(?:js|mjs|html|txt|md|json)):(\d+)`?\)/g;
// map citation index -> token (if the citation is immediately preceded by a backtick token)
const tokenAt = new Map();
let pm;
while ((pm = pairRe.exec(md))) {
  const citStart = pm.index + pm[0].lastIndexOf('(');
  tokenAt.set(citStart, pm[1]);
}
let total = 0, resolved = 0, missing = [], withToken = 0, matched = 0, mismatch = [];
let m;
while ((m = citRe.exec(md))) {
  total++;
  const file = m[1], ln = +m[2];
  const ls = lines(file);
  if (!ls || ln < 1 || ln > ls.length || !ls[ln - 1].trim()) { missing.push(`${file}:${ln}`); continue; }
  resolved++;
  const tok = tokenAt.get(m.index);
  if (tok !== undefined) {
    withToken++;
    if (norm(ls[ln - 1]).includes(norm(tok))) matched++;
    else mismatch.push({ at: `${file}:${ln}`, token: tok, line: ls[ln - 1].trim() });
  }
}
const out = [];
out.push(`Link check against SHA ${SHA}`);
out.push(`clone: ${CLONE}`);
out.push(`total citations:            ${total}`);
out.push(`resolved (line exists):     ${resolved}`);
out.push(`missing/empty lines:        ${missing.length}`);
out.push(`citations with code token:  ${withToken}`);
out.push(`token matched on line:      ${matched}`);
out.push(`token MISMATCH:             ${mismatch.length}`);
out.push(`line-only (no token):       ${resolved - withToken}`);
if (missing.length) { out.push('--- MISSING ---'); missing.forEach((x) => out.push('  ' + x)); }
if (mismatch.length) { out.push('--- MISMATCH ---'); mismatch.forEach((x) => out.push(`  ${x.at}\n    token: ${x.token}\n    line:  ${x.line}`)); }
const txt = out.join('\n') + '\n';
writeFileSync(ROOT + '/docs/evidence/link_check.txt', txt);
console.log(txt);
process.exit(missing.length + mismatch.length ? 1 : 0);
