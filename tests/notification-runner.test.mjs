import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
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

test('the packaged CLI runs through a version-switching symlink', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'digimium-notification-entry-'));
  let requests = 0;
  const server = createServer((request, response) => {
    assert.equal(request.url, '/api/internal/notifications/run');
    assert.equal(request.headers.authorization, 'Bearer ' + secret);
    requests++;
    response.writeHead(200).end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const current = join(directory, 'current');
    await symlink(fileURLToPath(new URL('../scripts/', import.meta.url)), current, process.platform === 'win32' ? 'junction' : 'dir');
    const entry = join(current, 'run-notifications.mjs');
    const child = spawn(process.execPath, [entry], { env: { ...process.env,
      APP_ORIGIN: 'http://127.0.0.1:' + server.address().port, NOTIFICATIONS_CRON_SECRET: secret },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    const timeout = setTimeout(() => child.kill(), 5000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    clearTimeout(timeout);
    assert.equal(code, 0, stderr);
    assert.equal(requests, 1);
    assert.match(stdout, /Notification maintenance completed\./);
    assert.equal(stderr, '');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
