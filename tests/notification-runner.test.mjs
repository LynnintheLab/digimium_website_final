import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { runNotificationMaintenance } from '../scripts/run-notifications.mjs';

const secret = 'synthetic_scheduler_secret_1234567890';

test('scheduled client sends its credential only in the header to the fixed local endpoint', async () => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization,
      cookie: request.headers.cookie, origin: request.headers.origin });
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await runNotificationMaintenance({ APP_ORIGIN: 'http://127.0.0.1:' + server.address().port, NOTIFICATIONS_CRON_SECRET: secret });
    assert.deepEqual(requests, [{ method: 'POST', url: '/api/internal/notifications/run', authorization: 'Bearer ' + secret,
      cookie: undefined, origin: undefined }]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('scheduled client rejects invalid configuration before any request', async () => {
  for (const APP_ORIGIN of ['http://example.invalid', 'https://user:pass@example.invalid', 'https://example.invalid/?secret=x', 'https://example.invalid/private']) {
    await assert.rejects(runNotificationMaintenance({ APP_ORIGIN, NOTIFICATIONS_CRON_SECRET: secret }));
  }
  await assert.rejects(runNotificationMaintenance({ APP_ORIGIN: 'https://example.invalid', NOTIFICATIONS_CRON_SECRET: 'short' }));
});

test('scheduled client does not follow redirects or accept a failed response', async () => {
  let requests = 0;
  let status = 307;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(status, { Location: '/must-not-follow' }).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = { APP_ORIGIN: 'http://127.0.0.1:' + server.address().port, NOTIFICATIONS_CRON_SECRET: secret };
  try {
    await assert.rejects(runNotificationMaintenance(env));
    assert.equal(requests, 1);
    status = 401;
    await assert.rejects(runNotificationMaintenance(env), /HTTP 401/);
    assert.equal(requests, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
