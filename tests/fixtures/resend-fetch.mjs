// Preloaded only in the disposable integration server. Keep all mail off the network.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const originalFetch = globalThis.fetch;
globalThis.fetch = async function fixtureFetch(input, init) {
  const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (target.hostname === '127.0.0.1' || target.hostname === 'localhost') return originalFetch(input, init);
  assert.equal(target.href, 'https://api.resend.com/emails');
  const mail = new Request(input, init);
  assert.equal(mail.method, 'POST');
  assert.equal(mail.headers.get('Authorization'), 'Bearer re_integration_fixture');
  const payload = await mail.json();
  assert.equal(payload.from, 'digimium@example.invalid');
  assert.deepEqual([payload.to].flat(), ['owner@example.invalid']);
  const code = (payload.text ?? payload.html ?? '').match(/\b\d{6}\b/)?.[0];
  assert.ok(code, 'Email includes a six-digit sign-in code');
  await new Promise((resolve, reject) => process.send({ type: 'otp-mail', code },
    error => error ? reject(error) : resolve()));
  if (process.env.FIXTURE_MAIL_FAILURE === '1') {
    return Response.json({ message: 'Simulated mail failure' }, { status: 503 });
  }
  return Response.json({ id: randomUUID() });
};
