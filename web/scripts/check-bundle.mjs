import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', dist), 'utf8'));
const modules = ['Auth', 'Cabinet', 'Catalogue', 'PurchaseOrder', 'PaymentHistory',
  'Referrals', 'Support', 'Security', 'AccountIdentity', 'IdentityRecovery', 'MiniApp', 'Admin'];
function graph(key, files = new Set()) {
  const chunk = manifest[key];
  assert(chunk, `Missing manifest entry: ${key}`);
  if (files.has(chunk.file)) return files;
  files.add(chunk.file);
  for (const dependency of chunk.imports ?? []) graph(dependency, files);
  return files;
}
async function size(files) {
  let raw = 0, gzip = 0;
  for (const file of files) {
    const bytes = await readFile(new URL(file, dist));
    raw += bytes.length; gzip += gzipSync(bytes).length;
  }
  return { raw, gzip };
}
for (const document of ['index.html', 'mini-app.html']) {
  const html = await readFile(new URL(document, dist), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="\/([^"?#]+\.js)"/g)];
  assert(scripts.length, `${document}: no module entry`);
  const initial = new Set();
  for (const [, file] of scripts) {
    const entry = Object.keys(manifest).find(key => manifest[key].file === file);
    assert(entry, `${document}: entry absent from manifest`);
    graph(entry, initial);
  }
  const startup = await size(initial);
  console.log(`${document} startup JS: ${startup.raw} bytes; ${startup.gzip} bytes gzip`);
  for (const module of modules) {
    const key = `src/${module}.tsx`, chunk = manifest[key];
    assert(chunk?.isDynamicEntry, `${module} must be a dynamic entry`);
    assert(!initial.has(chunk.file), `${module} is included in startup JS`);
  }
  const qr = Object.entries(manifest).find(([, chunk]) => chunk.src?.endsWith('/qrcode/lib/browser.js'));
  assert(qr?.[1].isDynamicEntry, 'QR generation must be a dynamic entry');
  assert(!initial.has(qr[1].file), 'QR generation is included in startup JS');
  const login = new Set([...initial, ...graph('src/Auth.tsx')]);
  for (const module of modules.filter(name => name !== 'Auth')) {
    assert(!login.has(manifest[`src/${module}.tsx`].file), `${module} is loaded with login`);
  }
  assert(!login.has(qr[1].file), 'QR generation is loaded with login');
  const loginSize = await size(login);
  console.log(`${document} login JS: ${loginSize.raw} bytes; ${loginSize.gzip} bytes gzip`);
  assert(startup.raw <= 500_000 && startup.gzip <= 155_000, 'Startup JS exceeds its budget');
  assert(loginSize.raw <= 510_000 && loginSize.gzip <= 160_000, 'Login JS exceeds its budget');
}
