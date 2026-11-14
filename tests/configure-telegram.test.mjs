import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureTelegram, configureTelegramCommands, readSetupEnvironment } from '../scripts/configure-telegram.mjs';

const env = { APP_ORIGIN: 'https://telegram-test.example.invalid', TELEGRAM_BOT_TOKEN: '123456789:' + 'a'.repeat(43), TELEGRAM_BOT_USERNAME: 'DigimiumFixtureBot', TELEGRAM_WEBHOOK_SECRET: 'b'.repeat(43) };
const target = env.APP_ORIGIN + '/api/customer/telegram/webhook';
function transport({ before = '', after = target, me = {}, updates = ['callback_query', 'message'], fail, malformed = false } = {}) {
  const calls = [];
  let infoCount = 0;
  return { calls, fetchImpl: async (url, options) => {
    const prefix = 'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/';
    assert.ok(url.startsWith(prefix));
    const method = url.slice(prefix.length);
    calls.push({ method, options, fields: JSON.parse(options.body) });
    if (fail) throw new Error('Network failure at ' + url + ' ' + env.TELEGRAM_WEBHOOK_SECRET);
    if (malformed) return new Response('x'.repeat(70000));
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 123456789, is_bot: true, username: env.TELEGRAM_BOT_USERNAME, ...me } });
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: { url: infoCount++ ? after : before, allowed_updates: updates, pending_update_count: 2 } });
    assert.equal(method, 'setWebhook');
    return Response.json({ ok: true, result: true });
  } };
}

test('registers and verifies only the fixed Telegram endpoint with the secret header configuration', async () => {
  const mock = transport();
  const result = await configureTelegram(env, mock);
  assert.deepEqual(mock.calls.map(call => call.method), ['getMe', 'getWebhookInfo', 'setWebhook', 'getWebhookInfo']);
  const set = mock.calls[2];
  assert.deepEqual(set.fields, { url: target, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
  assert.equal(set.options.redirect, 'error');
  assert.equal(set.options.method, 'POST');
  assert.deepEqual(result, { username: env.TELEGRAM_BOT_USERNAME, webhookUrl: target, alreadyConfigured: false, pendingUpdateCount: 2 });
  assert.ok(!JSON.stringify(result).includes(env.TELEGRAM_BOT_TOKEN));
  assert.ok(!JSON.stringify(result).includes(env.TELEGRAM_WEBHOOK_SECRET));
});

test('an existing webhook for another site is never overwritten', async () => {
  const mock = transport({ before: 'https://another.example.invalid/private-hook' });
  await assert.rejects(configureTelegram(env, mock), /different webhook/);
  assert.deepEqual(mock.calls.map(call => call.method), ['getMe', 'getWebhookInfo']);
});

test('explicit --move-from permits only the exact approved source webhook', async () => {
  const source = 'https://staging.example.invalid';
  const mock = transport({ before: source + '/api/customer/telegram/webhook' });
  const result = await configureTelegram(env, { ...mock, moveFrom: source });
  assert.equal(result.webhookUrl, target);
  assert.equal(result.alreadyConfigured, false);
  assert.deepEqual(mock.calls.map(call => call.method), ['getMe', 'getWebhookInfo', 'setWebhook', 'getWebhookInfo']);
  assert.equal(mock.calls[2].fields.url, target);
  assert.equal(mock.calls[2].fields.drop_pending_updates, false);
});

test('an explicit move refuses any current webhook that differs from the exact source', async () => {
  for (const before of ['', target, 'https://unapproved.example.invalid/api/customer/telegram/webhook', 'https://staging.example.invalid/another-hook']) {
    const mock = transport({ before });
    await assert.rejects(configureTelegram(env, { ...mock, moveFrom: 'https://staging.example.invalid' }), /exactly match --move-from/);
    assert.deepEqual(mock.calls.map(call => call.method), ['getMe', 'getWebhookInfo']);
  }
});

test('move-from rejects insecure, non-origin and same-target values before network access', async () => {
  for (const moveFrom of ['http://staging.example.invalid', 'https://staging.example.invalid/', 'https://staging.example.invalid/path', 'https://staging.example.invalid?secret=123', 'https://user:pass@staging.example.invalid', 'https://localhost', env.APP_ORIGIN]) {
    const mock = transport();
    await assert.rejects(configureTelegram(env, { ...mock, moveFrom }));
    assert.equal(mock.calls.length, 0);
  }
});

test('reapplying the same webhook refreshes its secret without dropping pending updates', async () => {
  const mock = transport({ before: target });
  assert.equal((await configureTelegram(env, mock)).alreadyConfigured, true);
  assert.equal(mock.calls[2].fields.drop_pending_updates, false);
});

test('a mismatched bot token or username cannot change any webhook', async () => {
  for (const me of [{ id: 999999999 }, { username: 'OtherFixtureBot' }, { is_bot: false }]) {
    const mock = transport({ me });
    await assert.rejects(configureTelegram(env, mock), /same bot/);
    assert.deepEqual(mock.calls.map(call => call.method), ['getMe']);
  }
});

test('private-chat menu registration verifies commands and leaves the webhook untouched', async () => {
  const calls = [];
  let commands;
  const result = await configureTelegramCommands(env, { fetchImpl: async (url, options) => {
    const prefix = 'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/';
    assert.ok(url.startsWith(prefix));
    const method = url.slice(prefix.length);
    const fields = JSON.parse(options.body);
    calls.push({ method, fields });
    assert.equal(options.redirect, 'error');
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 123456789, is_bot: true, username: env.TELEGRAM_BOT_USERNAME } });
    if (method === 'setMyCommands') {
      assert.deepEqual(fields.scope, { type: 'all_private_chats' });
      assert.equal(fields.language_code, '');
      assert.deepEqual(fields.commands.map(entry => entry.command), ['start', 'menu', 'history', 'plans', 'help']);
      assert.ok(fields.commands.every(entry => entry.description.length > 0 && entry.description.length <= 256));
      commands = fields.commands;
      return Response.json({ ok: true, result: true });
    }
    if (method === 'getMyCommands') return Response.json({ ok: true, result: commands });
    if (method === 'setChatMenuButton') {
      assert.deepEqual(fields, { menu_button: { type: 'commands' } });
      return Response.json({ ok: true, result: true });
    }
    assert.equal(method, 'getChatMenuButton');
    return Response.json({ ok: true, result: { type: 'commands' } });
  } });
  assert.deepEqual(calls.map(call => call.method), ['getMe', 'setMyCommands', 'getMyCommands', 'setChatMenuButton', 'getChatMenuButton']);
  assert.equal(result.scope, 'all_private_chats');
  assert.ok(!JSON.stringify(result).includes(env.TELEGRAM_BOT_TOKEN));
});

test('menu updates refuse mismatched bot ownership and unverified saved commands', async () => {
  const wrongOwner = transport({ me: { id: 999999999 } });
  await assert.rejects(configureTelegramCommands(env, wrongOwner), /same bot/);
  assert.deepEqual(wrongOwner.calls.map(call => call.method), ['getMe']);
  const calls = [];
  await assert.rejects(configureTelegramCommands(env, { fetchImpl: async (url) => {
    const method = url.slice(url.lastIndexOf('/') + 1);
    calls.push(method);
    return Response.json({ ok: true, result: method === 'getMe' ? { id: 123456789, is_bot: true, username: env.TELEGRAM_BOT_USERNAME } : method === 'setMyCommands' ? true : [{ command: 'other', description: 'unexpected' }] });
  } }), /verification failed/);
  assert.deepEqual(calls, ['getMe', 'setMyCommands', 'getMyCommands']);
});

test('configuration guards reject insecure or malformed values before any network request', async () => {
  for (const changed of [{ APP_ORIGIN: 'http://example.invalid' }, { APP_ORIGIN: 'https://example.invalid/path' }, { APP_ORIGIN: 'https://user:secret@example.invalid' }, { APP_ORIGIN: 'https://localhost' }, { TELEGRAM_BOT_TOKEN: 'bad/../../token' }, { TELEGRAM_BOT_USERNAME: 'not-a-bot' }, { TELEGRAM_WEBHOOK_SECRET: 'too-short' }]) {
    const calls = [];
    await assert.rejects(configureTelegram({ ...env, ...changed }, { fetchImpl: async () => { calls.push(1); throw new Error(); } }));
    assert.equal(calls.length, 0);
  }
});

test('network and provider failures never expose credential-bearing URLs or bodies', async () => {
  for (const settings of [{ fail: true }, { malformed: true }, { after: 'https://wrong.example.invalid' }, { updates: ['message', 'callback_query', 'chat_member'] }]) {
    const mock = transport(settings);
    await assert.rejects(configureTelegram(env, mock), error => {
      assert.ok(!error.message.includes(env.TELEGRAM_BOT_TOKEN));
      assert.ok(!error.message.includes(env.TELEGRAM_WEBHOOK_SECRET));
      return true;
    });
  }
  await assert.rejects(configureTelegram(env, { fetchImpl: async () => Response.json({ ok: false, description: env.TELEGRAM_BOT_TOKEN + env.TELEGRAM_WEBHOOK_SECRET }, { status: 401 }) }), error => {
    assert.ok(!error.message.includes(env.TELEGRAM_BOT_TOKEN));
    assert.ok(!error.message.includes(env.TELEGRAM_WEBHOOK_SECRET));
    return true;
  });
});

test('private env paths support --env and --env-file without changing process.env', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'digimium-telegram-setup-'));
  try {
    const filename = join(scratch, 'private.env');
    await writeFile(filename, 'APP_ORIGIN=https://from-file.example.invalid\nTELEGRAM_WEBHOOK_SECRET="' + env.TELEGRAM_WEBHOOK_SECRET + '"\n', { mode: 0o600 });
    for (const args of [['--env', filename], ['--env-file=' + filename]]) {
      const result = await readSetupEnvironment(args, env);
      assert.equal(result.env.APP_ORIGIN, 'https://from-file.example.invalid');
      assert.equal(result.env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_BOT_TOKEN);
    }
    const moved = await readSetupEnvironment(['--env', filename, '--move-from=https://staging.example.invalid'], env);
    assert.equal(moved.moveFrom, 'https://staging.example.invalid');
    assert.equal((await readSetupEnvironment(['--move-from', 'https://staging.example.invalid'], env)).moveFrom, 'https://staging.example.invalid');
    await assert.rejects(readSetupEnvironment(['--move-from']), /Provide/);
    await assert.rejects(readSetupEnvironment(['--move-from', 'https://staging.example.invalid', '--move-from', 'https://other.example.invalid']), /Usage/);
    assert.equal(env.APP_ORIGIN, 'https://telegram-test.example.invalid');
    await assert.rejects(readSetupEnvironment(['--env']), /Provide/);
    await assert.rejects(readSetupEnvironment(['--unknown']), /Usage/);
    await assert.rejects(readSetupEnvironment(['--env', filename, '--env', filename]), /Usage/);
    assert.equal((await readSetupEnvironment(['--commands-only'], env)).commandsOnly, true);
    await assert.rejects(readSetupEnvironment(['--commands-only', '--commands-only']), /once/);
    await assert.rejects(readSetupEnvironment(['--commands-only', '--move-from', 'https://staging.example.invalid']), /separately/);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
