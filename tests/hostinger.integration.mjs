// Runs against the packaged production server and creates data in an EMPTY, local test database.
// Supply DB_HOST, DB_PORT, DB_NAME (digimium_test_*), DB_USER, DB_PASSWORD and
// APP_ORIGIN (http://127.0.0.1:<unused-port>). The test supplies all mail and auth values.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mysql from 'mysql2/promise';

const env = {
  ...process.env, ADMIN_EMAIL: 'owner@example.invalid', ADMIN_AUTH_SECRET: randomUUID(),
  RESEND_FROM_EMAIL: 'digimium@example.invalid', RESEND_API_KEY: 're_integration_fixture',
};
const base = new URL(env.APP_ORIGIN);
if (env.DB_HOST !== '127.0.0.1' || !/^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME ?? '') ||
    base.origin !== env.APP_ORIGIN || base.hostname !== '127.0.0.1' || base.protocol !== 'http:' || !base.port) {
  throw new Error('Use a disposable local database named digimium_test_* and an HTTP 127.0.0.1 origin with an unused port.');
}
assert.ok(env.DB_USER && env.DB_PASSWORD, 'Supply credentials for the disposable test database.');
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
} catch (error) {
  await db.end();
  throw error;
}

const request = (path, options = {}) => fetch(new URL(path, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
let child;
const messages = [];
async function start(overrides = {}) {
  // Refuse to interact with another process already serving this address.
  const probe = createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(Number(base.port), base.hostname, resolve));
  await new Promise(resolve => probe.close(resolve));
  child = spawn(process.execPath, ['--import', new URL('tests/fixtures/resend-fetch.mjs', root).href, entry], {
    cwd: fileURLToPath(root),
    env: { ...env, FIXTURE_MAIL_FAILURE: '0', NODE_ENV: 'production', HOSTNAME: base.hostname, PORT: base.port, ...overrides },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  child.on('message', message => { if (message?.type === 'otp-mail') messages.push(message); });
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
const login = (fields, cookie = '', origin = base.origin) => request('/admin/session', {
  method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: new URLSearchParams(fields),
});
const issue = (email = env.ADMIN_EMAIL) => login({ action: 'request', email });
const verify = (cookie, code) => login({ action: 'verify', code }, cookie);
const destination = res => res.headers.get('location');
function cookiePair(response, name) {
  const header = response.headers.getSetCookie().find(cookie => cookie.startsWith(name + '='));
  assert.ok(header, 'Expected a ' + name + ' cookie');
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Strict/i);
  return header.split(';')[0];
}
function session(response) {
  assert.equal(response.status, 303);
  assert.equal(destination(response), '/admin');
  const cookie = cookiePair(response, 'digimium_local_admin');
  const header = response.headers.getSetCookie().find(value => value.startsWith(cookie));
  assert.match(header, /Max-Age=15552000\b/i, 'Remember this browser for 180 days');
  return { Cookie: cookie };
}
const resetDeliveryWindow = () => db.query('DELETE FROM digimium_otp_send_limit');
async function issueCode() {
  const before = messages.length;
  const response = await issue();
  assert.equal(response.status, 303);
  assert.equal(destination(response), '/admin/login?step=verify');
  assert.equal(messages.length, before + 1);
  return { cookie: cookiePair(response, 'digimium_local_challenge'), code: messages.at(-1).code };
}
const fixtureId = 'test-' + randomUUID();
const png = await readFile(new URL('public/assets/symbol-blue.png', root));
try {
  await start({ ADMIN_AUTH_SECRET: '', ADMIN_PASSWORD: randomUUID() });
  assert.equal((await request('/api/admin/catalog')).status, 503, 'OTP must be configured even if a legacy password is present');
  await stop();
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
  const loginPage = await (await request('/admin/login')).text();
  assert.match(loginPage, /type="email"/);
  assert.doesNotMatch(loginPage, /type="password"/);
  assert.equal((await login({ action: 'request', email: env.ADMIN_EMAIL }, '', 'https://foreign.example')).status, 403);
  await issue('another@example.invalid');
  assert.equal(messages.length, 0, 'A different email address cannot receive a code');
  const challenge = await issueCode();
  const [[{ lifetime: codeLifetime }]] = await db.query(
    'SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) AS lifetime FROM digimium_otp_challenges');
  assert.ok(codeLifetime > 590 && codeLifetime <= 600, 'Code expires on the server after ten minutes');
  const codePage = await (await request('/admin/login?step=verify', { headers: { Cookie: challenge.cookie } })).text();
  assert.match(codePage, /autocomplete="one-time-code"/i);
  assert.notEqual(destination(await verify('', challenge.code)), '/admin', 'A code requires its browser challenge');
  assert.equal((await login({ action: 'verify', code: challenge.code }, challenge.cookie, 'https://foreign.example')).status, 403);
  const retry = await login({ action: 'request' }, challenge.cookie);
  assert.match(destination(retry), /error=retry/);
  assert.equal(messages.length, 1, 'The resend cooldown suppresses delivery');
  await stop();
  await start({ FIXTURE_MAIL_FAILURE: '1' });
  await resetDeliveryWindow();
  const failedDelivery = await login({ action: 'request' }, challenge.cookie);
  assert.match(destination(failedDelivery), /error=delivery/);
  await stop();
  await start();
  const attempts = await Promise.all([verify(challenge.cookie, challenge.code), verify(challenge.cookie, challenge.code)]);
  const accepted = attempts.filter(res => destination(res) === '/admin');
  assert.equal(accepted.length, 1, 'Exactly one verification consumes a valid code, including after a failed resend');
  assert.match(destination(attempts.find(res => res !== accepted[0])), /error=expired/);
  const auth = session(accepted[0]);
  const [[{ lifetime: sessionLifetime }]] = await db.query(
    'SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) AS lifetime FROM digimium_admin_sessions');
  assert.ok(sessionLifetime > 15551990 && sessionLifetime <= 15552000, 'The server enforces the persistent cookie lifetime');
  assert.equal((await request('/api/admin/catalog')).status, 401, 'A new browser still needs to sign in');
  assert.equal(new URL(destination(await request('/admin/login', { headers: auth })), base).pathname, '/admin');
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

  await resetDeliveryWindow();
  const limited = await issueCode();
  const wrongCode = limited.code === '000000' ? '000001' : '000000';
  for (let attempt = 1; attempt <= 5; attempt++) {
    const rejected = await verify(limited.cookie, wrongCode);
    assert.match(destination(rejected), attempt === 5 ? /error=expired/ : /error=code/);
  }
  assert.match(destination(await verify(limited.cookie, limited.code)), /error=expired/, 'The attempt budget is final');

  await resetDeliveryWindow();
  const expired = await issueCode();
  await db.query('UPDATE digimium_otp_challenges SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND');
  assert.match(destination(await verify(expired.cookie, expired.code)), /error=expired/);

  await resetDeliveryWindow();
  const secondBrowser = await issueCode();
  await db.query('UPDATE digimium_otp_send_limit SET last_sent_at = UTC_TIMESTAMP() - INTERVAL 61 SECOND');
  const replacement = await login({ action: 'request' }, secondBrowser.cookie);
  assert.equal(destination(replacement), '/admin/login?step=verify');
  const replacementCookie = cookiePair(replacement, 'digimium_local_challenge');
  assert.match(destination(await verify(secondBrowser.cookie, secondBrowser.code)), /error=expired/, 'Resending retires the old challenge');
  const secondSession = session(await verify(replacementCookie, messages.at(-1).code));
  assert.notEqual(secondSession.Cookie, auth.Cookie);

  await db.query('UPDATE digimium_otp_send_limit SET sends = 5, last_sent_at = UTC_TIMESTAMP() - INTERVAL 61 SECOND');
  const beforeLimit = messages.length;
  assert.match(destination(await issue()), /error=retry/, 'The hourly limit also applies to a new browser');
  assert.equal(messages.length, beforeLimit);
  assert.equal((await request('/admin/logout', { method: 'POST', headers: { ...auth, Origin: 'https://foreign.example' } })).status, 403);
  const signedOut = await request('/admin/logout', { method: 'POST', headers: { ...auth, Origin: base.origin } });
  assert.equal(signedOut.status, 303);
  assert.equal((await request('/api/admin/catalog', { headers: auth })).status, 401, 'Revoked session cannot be replayed');
  assert.equal((await request('/api/admin/catalog', { headers: secondSession })).status, 200, 'The other browser remains signed in');
  await stop();
  await start({ ADMIN_AUTH_SECRET: randomUUID() });
  assert.equal((await request('/api/admin/catalog', { headers: secondSession })).status, 401, 'Rotating the owner secret invalidates remembered browsers');

  await stop();
  const httpsOrigin = 'https://staging.example.invalid';
  await start({ APP_ORIGIN: httpsOrigin });
  await resetDeliveryWindow();
  const fromHttps = await login({ action: 'request', email: env.ADMIN_EMAIL }, '', httpsOrigin);
  const httpsChallenge = cookiePair(fromHttps, '__Host-digimium_challenge');
  assert.match(fromHttps.headers.getSetCookie()[0], /; Secure(?:;|$)/i);
  const verifiedHttps = await login({ action: 'verify', code: messages.at(-1).code }, httpsChallenge, httpsOrigin);
  assert.equal(destination(verifiedHttps), '/admin');
  const hostCookie = cookiePair(verifiedHttps, '__Host-digimium_admin');
  const httpsSession = verifiedHttps.headers.getSetCookie().find(header => header.startsWith(hostCookie));
  assert.match(httpsSession, /; Secure(?:;|$)/i);
  assert.match(httpsSession, /; Path=\/(?:;|$)/i);
  assert.doesNotMatch(httpsSession, /; Domain=/i);
  console.log('PASS: packaged storefront and assets, email OTP via stubbed Resend, browser sessions, rate limits, expiry, replay rejection, CSRF, concurrent saves and persistence across restarts.');
} finally {
  await stop();
  await db.end();
}
