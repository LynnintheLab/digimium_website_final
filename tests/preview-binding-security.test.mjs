import assert from 'node:assert/strict';
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createPreviewBinding } from '../scripts/connector-preview/host-binding.mjs';

const content = [{ type: 'text', text: 'Local fixture result' }];
const success = () => ({ content });
const invocation = (arguments_ = {}, extra = {}) => ({
  connectorId: 'local-fixture', actionName: 'read-fixture', arguments: arguments_, ...extra,
});
const request = (body = invocation()) => new Request('http://preview/invoke', {
  method: 'POST', body: JSON.stringify(body),
});
function fixture(t, invoke = success, options = {}) {
  const binding = createPreviewBinding({
    tools: [{ connectorId: 'local-fixture', actionName: 'read-fixture', readOnly: true, invoke }],
    ...options,
  });
  t.after(() => binding.close());
  return binding;
}
async function result(binding, input = request()) {
  const response = await binding.fetch(input);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  return response.json();
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('preview binding invokes only the selected read action and preserves JSON arguments', async t => {
  const calls = [];
  const binding = fixture(t, args => { calls.push(args); return success(); });
  const args = { text: 'မြန်မာ + English', options: [null, 0, false, { nested: true }] };
  assert.equal((await result(binding, request(invocation(args)))).status, 'success');
  for (const body of [
    invocation({}, { connectorId: 'unselected-connector' }),
    invocation({}, { actionName: 'write-fixture' }),
  ]) assert.equal((await result(binding, request(body))).status, 'tool_not_allowed');
  for (const extra of [{ accountId: 'caller-selected' }, { nativeToolName: 'unapproved' }, { readOnly: false }]) {
    assert.equal((await result(binding, request(invocation({}, extra)))).status, 'invalid_request');
  }
  assert.deepEqual(calls, [args], 'Rejected requests must never invoke the provider');
});

test('preview binding refuses ambiguous or non-read-only grants before serving requests', () => {
  const grant = { connectorId: 'local-fixture', actionName: 'read-fixture', readOnly: true, invoke: success };
  assert.throws(() => createPreviewBinding({ tools: [grant, grant] }), /Ambiguous/);
  for (const invalid of [{ ...grant, readOnly: false }, { ...grant, accountId: 'caller-selected' }, { ...grant, invoke: undefined }]) {
    assert.throws(() => createPreviewBinding({ tools: [invalid] }), /authenticated, resolved read actions/);
  }
});

test('preview request byte limits and strict UTF-8 stop invalid input before any invocation', async t => {
  let calls = 0;
  const binding = fixture(t, () => { calls++; return success(); });
  const invalidUtf8 = Buffer.concat([
    Buffer.from('{"connectorId":"local-fixture","actionName":"read-fixture","arguments":{"text":"'),
    Buffer.from([0xff]), Buffer.from('"}}'),
  ]);
  for (const input of [
    request(invocation({ text: 'မြန်မာ'.repeat(10000) })),
    new Request('http://preview/invoke', { method: 'POST', body: invalidUtf8 }),
    new Request('http://preview/invoke', { method: 'POST', body: '{invalid json' }),
    new Request('http://preview/invoke', { method: 'POST' }),
    new Request('http://preview/invoke'),
    new Request('http://preview/other', { method: 'POST', body: JSON.stringify(invocation()) }),
  ]) assert.equal((await result(binding, input)).status, 'invalid_request');
  assert.equal(calls, 0);
});

test('preview results project public MCP fields and reject forged transport status', async t => {
  let reply = { content, structuredContent: null, requestId: 'fixture:request-1', privateTransportMetadata: 'not-for-the-client' };
  const binding = fixture(t, () => reply);
  assert.deepEqual(await result(binding), {
    status: 'success', result: { content, structuredContent: null }, requestId: 'fixture:request-1',
  });
  for (const malformed of [
    { ...reply, status: 'success' }, { ...reply, error: 'provider-authored transport error' },
    { content: 'not MCP content' }, { content: [{ type: 'text', unsupported: undefined, value: 1n }] },
  ]) {
    reply = malformed;
    assert.equal((await result(binding)).status, 'upstream_error');
  }
});

test('preview provider failures distinguish rate limits and invalid argument binding without false success', async t => {
  let reply;
  const binding = fixture(t, () => reply);
  reply = { content, isError: true, structuredContent: { error_code: 'RATE_LIMITED', retry_after_seconds: '3' }, requestId: 'fixture-2' };
  const limited = await result(binding);
  assert.equal(limited.status, 'rate_limited');
  assert.equal(limited.retryAfterMs, 3000);
  assert.equal(limited.requestId, 'fixture-2');
  assert.equal(limited.result, undefined, 'Rate-limit responses do not expose provider content');
  reply = { content, isError: true, structuredContent: {
    error_code: 'INVALID_ARGUMENT', error_data: { type: 'invalid_action_arguments', failure_stage: 'argument_binding' },
  } };
  assert.equal((await result(binding)).status, 'invalid_request');
  reply = { content, isError: true, structuredContent: { error_code: 'OTHER_FAILURE' } };
  assert.equal((await result(binding)).status, 'tool_error');
});

test('a timed-out provider keeps its concurrency slot until its underlying work settles', async t => {
  const pending = deferred();
  const started = deferred();
  let calls = 0;
  const binding = fixture(t, () => { calls++; started.resolve(); return calls === 1 ? pending.promise : success(); }, {
    timeoutMs: 20, maxConcurrent: 1,
  });
  t.after(() => pending.resolve(success()));
  const first = result(binding);
  await started.promise;
  assert.equal((await first).status, 'upstream_error');
  assert.equal((await result(binding)).status, 'rate_limited');
  assert.equal(calls, 1, 'A timeout must not permit parallel replay of uncertain provider work');
  pending.resolve(success());
  await nextTurn();
  assert.equal((await result(binding)).status, 'success');
  assert.equal(calls, 2);
});

test('call budgets, close and expiry prevent later provider invocations', async t => {
  let calls = 0;
  const limited = fixture(t, () => { calls++; return success(); }, { maxCalls: 1 });
  assert.equal((await result(limited)).status, 'success');
  assert.equal((await result(limited)).status, 'tool_not_allowed');
  const closed = fixture(t, () => { calls++; return success(); });
  closed.close();
  assert.equal((await result(closed)).status, 'binding_unavailable');
  const expired = fixture(t, () => { calls++; return success(); }, { lifetimeMs: 10 });
  await delay(20);
  assert.equal((await result(expired)).status, 'binding_unavailable');
  assert.equal(calls, 1);
});

test('closing a preview stops waiting without claiming the in-flight provider succeeded', async t => {
  const pending = deferred();
  const started = deferred();
  const binding = fixture(t, () => { started.resolve(); return pending.promise; });
  t.after(() => pending.resolve(success()));
  const inFlight = result(binding);
  await started.promise;
  binding.close();
  assert.equal((await inFlight).status, 'upstream_error');
  assert.equal((await result(binding)).status, 'binding_unavailable');
});
