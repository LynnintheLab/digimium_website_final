import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const base = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:5187');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password) {
  throw new Error('Logo and plan checks may only modify a local preview.');
}

const auth = { Cookie: '__sites_local_auth=1' };
const request = (path, options) => fetch(new URL(path, base.origin), { ...options, redirect: 'manual' });
const png = await readFile(new URL('../public/assets/symbol-blue.png', import.meta.url));

function upload(body, mime, authenticated = true) {
  return request('/api/admin/logos', {
    method: 'POST',
    headers: { ...(authenticated ? auth : {}), Origin: base.origin, 'Content-Type': mime },
    body,
  });
}

async function readCatalog(admin) {
  const response = await request(admin ? '/api/admin/catalog' : '/api/catalog', { headers: admin ? auth : {} });
  assert.equal(response.status, 200, `Read ${admin ? 'admin' : 'public'} catalog`);
  return response.json();
}

function save(catalog, products) {
  return request('/api/admin/catalog', {
    method: 'PUT',
    headers: { ...auth, Origin: base.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: catalog.revision, settings: catalog.settings, products }),
  });
}

assert.equal((await upload(png, 'image/png', false)).status, 401, 'Upload needs an admin');
assert.equal((await upload('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml')).status, 415, 'Unsupported image format');
assert.equal((await upload(png, 'image/jpeg')).status, 415, 'File contents must match declared format');
const uploaded = await upload(png, 'image/png');
assert.equal(uploaded.status, 201, 'Store logo');
const { path } = await uploaded.json();
assert.match(path, /^\/media\/logos\/[a-f\d-]+\.png$/);

const image = await request(path);
assert.equal(image.status, 200);
assert.equal(image.headers.get('content-type'), 'image/png');
assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
assert.deepEqual(Buffer.from(await image.arrayBuffer()), png, 'Logo path serves original bytes');
assert.ok(image.headers.get('etag'));
assert.equal((await request(path, { headers: { 'If-None-Match': image.headers.get('etag') } })).status, 304);

const original = await readCatalog(true);
const id = randomUUID();
const publicPlan = { id: 'monthly', name: 'Local monthly plan', price: '9,000 MMK', duration: '1 month', published: true };
const draftPlan = { id: 'draft', name: `Unpublished plan ${id}`, price: '18,000 MMK', duration: '2 months', published: false };
const product = {
  id, name: `Local logo test ${id}`, category: 1, mark: '', logoPath: path,
  description: 'Temporary product for local catalog verification.', price: '', duration: '',
  availability: 'on-request', featured: true, published: true, plans: [publicPlan, draftPlan],
};

try {
  for (const logoPath of ['https://invalid.example/test.png', `/media/logos/${randomUUID()}.png`]) {
    const refused = await save(original, [...original.products, { ...product, logoPath }]);
    assert.equal(refused.status, 400, 'Refuse untrusted and missing logo references');
  }
  const result = await save(original, [...original.products, product]);
  assert.equal(result.status, 200, `Save service with uploaded logo: ${await result.text()}`);

  const reopened = (await readCatalog(true)).products.find(item => item.id === id);
  assert.equal(reopened?.logoPath, path, 'Logo path survives a fresh admin read');
  assert.deepEqual(reopened.plans, [publicPlan, draftPlan], 'Admin retains published and hidden plans');

  const publicProduct = (await readCatalog(false)).products.find(item => item.id === id);
  assert.equal(publicProduct?.logoPath, path);
  assert.deepEqual(publicProduct.plans, [publicPlan], 'Public data excludes the draft plan');

  const storefront = await request('/');
  assert.equal(storefront.status, 200);
  const html = await storefront.text();
  assert.ok(html.includes(`src="${path}"`), 'Featured service renders the uploaded logo');
  assert.ok(!html.includes(draftPlan.name), 'Draft plan stays out of the rendered storefront');
} finally {
  // Only remove the fixture. Concurrent admin edits must survive the test.
  const latest = await readCatalog(true);
  if (latest.products.some(item => item.id === id)) {
    const restored = await save(latest, latest.products.filter(item => item.id !== id));
    assert.equal(restored.status, 200, 'Restore local catalog after logo and plan checks');
  }
}

console.log('PASS: uploaded logo bytes and path, catalog save/reopen, public plan visibility, invalid file and path rejection. Local test service removed.');
