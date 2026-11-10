// Runs against the packaged production server and creates data in an EMPTY, local test database.
// Required variables: DB_HOST, DB_PORT, DB_NAME (digimium_test_*), DB_USER, DB_PASSWORD,
// ADMIN_EMAIL, ADMIN_PASSWORD and APP_ORIGIN (http://127.0.0.1:<unused-port>).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mysql from 'mysql2/promise';

const env = process.env;
const base = new URL(env.APP_ORIGIN);
if (env.DB_HOST !== '127.0.0.1' || !/^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME ?? '') ||
    base.origin !== env.APP_ORIGIN || base.hostname !== '127.0.0.1' || base.protocol !== 'http:' || !base.port) {
  throw new Error('Use a disposable local database named digimium_test_* and an HTTP 127.0.0.1 origin with an unused port.');
}
assert.ok(env.DB_USER && env.DB_PASSWORD && env.ADMIN_EMAIL && env.ADMIN_PASSWORD?.length >= 16,
  'Supply credentials for the disposable test instance.');
const root = new URL('../', import.meta.url);
const entry = fileURLToPath(new URL('.next/standalone/server.js', root));
await access(entry);
const db = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD,
  database: env.DB_NAME, multipleStatements: true,
});
try {
  const [tables] = await db.query('SHOW TABLES');
  assert.equal(tables.length, 0, 'Refusing mutation: this test requires a completely empty disposable database.');
  await db.query(await readFile(new URL('hostinger/schema.sql', root), 'utf8'));
} finally {
  await db.end();
}

const request = (path, options = {}) => fetch(new URL(path, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
let child;
async function start() {
  // Refuse to interact with another process already serving this address.
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  child = spawn(process.execPath, [entry], {
    cwd: fileURLToPath(root),
    env: { ...env, NODE_ENV: 'production', HOSTNAME: base.hostname, PORT: base.port },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null || child.signalCode) break;
    try {
      const res = await request('/admin/login');
      if (res.status === 200) return;
      throw new Error('Login route returned HTTP ' + res.status);
    } catch (e) {
      if (e.cause?.code !== 'ECONNREFUSED' && e.cause?.code !== 'UND_ERR_SOCKET') throw e;
    }
    await delay(100);
  }
  throw new Error('The production server did not become ready.');
}

async function stop() {
  if (!child || child.exitCode !== null || child.signalCode) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 8000);
  try { await exited; } finally { clearTimeout(deadline); }
}

async function json(response, expected = 200) {
  assert.equal(response.status, expected, 'Unexpected HTTP status on ' + new URL(response.url).pathname);
  return response.json();
}
const login = (password, origin = base.origin) => request('/admin/session', {
  method: 'POST', headers: { Origin: origin }, body: new URLSearchParams({ email: env.ADMIN_EMAIL, password }),
});
const fixtureId = 'test-' + randomUUID();
const png = await readFile(new URL('public/assets/symbol-blue.png', root));
try {
  await start();
  const home = await request('/');
  assert.equal(home.status, 200);
  const html = await home.text();
  const css = html.match(/href="([^"]*\/_next\/static\/[^"]+\.css[^"]*)"/)?.[1];
  assert.ok(css, 'Built storefront references its compiled stylesheet');
  const stylesheet = await request(css.replaceAll('&amp;', '&'));
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type') ?? '', /text\/css/);
  assert.equal((await request('/assets/logo.png')).status, 200, 'Packaged public directory');
  const anonymous = await request('/admin');
  assert.equal(anonymous.status, 307);
  assert.equal(new URL(anonymous.headers.get('location'), base).pathname, '/admin/login');
  const forged = { 'oai-authenticated-user-id': 'fake', 'oai-authenticated-user-email': env.ADMIN_EMAIL, Cookie: '__sites_local_auth=1' };
  assert.equal((await request('/api/admin/catalog', { headers: forged })).status, 401);
  assert.equal((await request('/api/admin/logos', { method: 'POST', headers: forged, body: png })).status, 401);
  assert.equal((await login(env.ADMIN_PASSWORD, 'https://foreign.example')).status, 403);
  const denied = await login('incorrect-' + randomUUID());
  assert.equal(denied.headers.get('set-cookie'), null, 'Rejected credentials cannot create a session');
  assert.ok([303, 401].includes(denied.status));
  const accepted = await login(env.ADMIN_PASSWORD);
  assert.equal(accepted.status, 303);
  assert.equal(new URL(accepted.headers.get('location'), base).pathname, '/admin');
  const setCookie = accepted.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const auth = { Cookie: setCookie.split(';')[0] };
  assert.equal((await request('/admin', { headers: auth })).status, 200);
  const original = await json(await request('/api/admin/catalog', { headers: auth }));
  assert.equal(original.revision, 0);
  assert.ok(original.products.length > 0);
  const publicCatalog = await json(await request('/api/catalog'));
  assert.equal(publicCatalog.products.length, original.products.filter(p => p.published).length);
  assert.ok(publicCatalog.products.every(p => p.published && (p.plans ?? []).every(plan => plan.published)));

  const upload = (body, mime, origin = base.origin) => request('/api/admin/logos', {
    method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': mime }, body,
  });
  assert.equal((await upload(png, 'image/png', 'https://foreign.example')).status, 403);
  assert.equal((await upload(png, 'image/jpeg')).status, 415);
  const { path } = await json(await upload(png, 'image/png'), 201);
  assert.match(path, /^\/media\/logos\/[a-f0-9-]+\.png$/);
  const product = {
    ...original.products[0], id: fixtureId, name: 'Hostinger smoke fixture', description: 'Disposable private English copy',
    mm: 'မြန်မာ စာမျက်နှာ စမ်းသပ်ချက်', logoPath: path, published: true, featured: true,
    plans: [
      { id: 'public', name: 'One month', price: '8,500 MMK', duration: '1 month', published: true },
      { id: 'draft', name: 'Hidden fixture plan', price: '', duration: '1 year', published: false },
    ],
  };
  const body = { expectedRevision: original.revision, products: [...original.products, product],
    settings: { ...original.settings, hideShortDescriptions: true } };
  const save = (payload, origin = base.origin) => request('/api/admin/catalog', {
    method: 'PUT', headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  assert.equal((await save(body, 'https://foreign.example')).status, 403);
  assert.equal((await save({ ...body, products: [...body.products, product] })).status, 400);
  const firstSave = await Promise.all([save(body), save(body)]);
  assert.deepEqual(firstSave.map(r => r.status).sort(), [200, 409], 'Exactly one first save may win');
  const secondSave = await Promise.all([save({ ...body, expectedRevision: 1 }), save({ ...body, expectedRevision: 1 })]);
  assert.deepEqual(secondSave.map(r => r.status).sort(), [200, 409], 'Exactly one revision update may win');
  await stop();
  await start();

  const persisted = await json(await request('/api/admin/catalog', { headers: auth }));
  assert.equal(persisted.revision, 2);
  assert.deepEqual(persisted.products.find(p => p.id === fixtureId), product, 'Bilingual product and uploaded path survive restart');
  const projected = (await json(await request('/api/catalog'))).products.find(p => p.id === fixtureId);
  assert.deepEqual(projected.plans, [product.plans[0]]);
  assert.equal(projected.logoPath, path);
  assert.ok(!projected.description && !projected.mm);
  const page = await (await request('/')).text();
  assert.ok(page.includes(product.name));
  assert.ok(!page.includes(product.description) && !page.includes(product.plans[1].name));
  const image = await request(path);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png, 'Uploaded bytes survive server restart');
  assert.ok(image.headers.get('etag'));
  assert.equal((await request(path, { headers: { 'If-None-Match': image.headers.get('etag') } })).status, 304);

  assert.equal((await request('/admin/logout', { method: 'POST', headers: { ...auth, Origin: 'https://foreign.example' } })).status, 403);
  const signedOut = await request('/admin/logout', { method: 'POST', headers: { ...auth, Origin: base.origin } });
  assert.equal(signedOut.status, 303);
  assert.equal((await request('/api/admin/catalog', { headers: auth })).status, 401, 'Revoked session cannot be replayed');

  console.log('PASS: packaged Hostinger storefront/assets, protected admin, login/logout, CSRF, concurrent catalog saves, public visibility, and catalog/logo persistence after server restart.');
} finally {
  await stop();
}
