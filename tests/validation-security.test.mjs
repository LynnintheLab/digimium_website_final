import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  driverMessageSchema,
  grantSchema,
  invocationSchema,
  sessionOptionsSchema,
} from '../scripts/connector-preview/protocol.mjs';

const invocation = arguments_ => ({ connectorId: 'fixture-connector', actionName: 'read_fixture', arguments: arguments_ });

test('connector invocation preserves empty and heterogeneous JSON records after the Zod upgrade', () => {
  for (const arguments_ of [{}, {
    text: 'မြန်မာ + English', empty: null, flag: false, count: 0,
    list: [null, 12, { nested: true }], nested: { 'arbitrary-key': 'value' },
  }]) {
    const value = invocation(arguments_);
    assert.deepEqual(invocationSchema.parse(value), value);
  }
});

test('connector invocation rejects nonrecords and caller-selected account or native-tool metadata', () => {
  for (const arguments_ of [null, [], ['value'], 'text', 1, true, undefined]) {
    assert.equal(invocationSchema.safeParse(invocation(arguments_)).success, false);
  }
  for (const extra of [{ accountId: 'other-account' }, { nativeToolName: 'unapproved_tool' }, { readOnly: false }]) {
    assert.equal(invocationSchema.safeParse({ ...invocation({}), ...extra }).success, false);
  }
  for (const connectorId of ['', 'white space', 'path/name', 'bad\u0000name', 'x'.repeat(257)]) {
    assert.equal(invocationSchema.safeParse({ ...invocation({}), connectorId }).success, false);
  }
});

test('driver responses accept empty and arbitrary result records while enforcing the JSON-RPC envelope', () => {
  const id = randomUUID();
  for (const result of [{}, { content: [{ type: 'text', text: 'ok' }], structuredContent: null, extension: { count: 3 } }]) {
    const value = { jsonrpc: '2.0', id, result };
    assert.deepEqual(driverMessageSchema.parse(value), value);
  }
  for (const result of [null, [], 'text', 12, undefined]) {
    assert.equal(driverMessageSchema.safeParse({ jsonrpc: '2.0', id, result }).success, false);
  }
  for (const value of [
    { jsonrpc: '2.0', id, result: {}, accountId: 'other-account' },
    { jsonrpc: '2.0', id, result: {}, error: { code: -1, message: 'ambiguous' } },
    { jsonrpc: '2.0', id: 1, result: {} },
    { jsonrpc: '1.0', id, result: {} },
    { jsonrpc: '2.0', method: 'stop', result: {} },
  ]) assert.equal(driverMessageSchema.safeParse(value).success, false);
  assert.deepEqual(driverMessageSchema.parse({ jsonrpc: '2.0', method: 'stop' }), { jsonrpc: '2.0', method: 'stop' });
});

test('driver request IDs retain RFC UUID validation and bounded integer error codes', () => {
  for (const id of ['not-a-uuid', '11111111-1111-4111-1111-111111111111']) {
    assert.equal(driverMessageSchema.safeParse({ jsonrpc: '2.0', id, result: {} }).success, false);
  }
  const error = { jsonrpc: '2.0', id: randomUUID(), error: { code: -32602, message: 'Invalid arguments', data: { field: 'name' } } };
  assert.deepEqual(driverMessageSchema.parse(error), error);
  for (const code of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(driverMessageSchema.safeParse({ ...error, error: { ...error.error, code } }).success, false);
  }
});

test('preview session defaults and integer limits remain explicit without adding optional fields', () => {
  assert.deepEqual(sessionOptionsSchema.parse({}), { timeoutMs: 120000, maxConcurrent: 64 });
  const limit = 2 ** 31 - 1;
  const maximum = { timeoutMs: limit, lifetimeMs: limit, maxConcurrent: Number.MAX_SAFE_INTEGER, maxCalls: Number.MAX_SAFE_INTEGER };
  assert.deepEqual(sessionOptionsSchema.parse(maximum), maximum);
  for (const key of ['timeoutMs', 'lifetimeMs']) {
    for (const value of [0, -1, 1.5, limit + 1, NaN, Infinity, '120000', null]) {
      assert.equal(sessionOptionsSchema.safeParse({ [key]: value }).success, false, `${key}: ${String(value)}`);
    }
  }
  for (const key of ['maxConcurrent', 'maxCalls']) {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '64', null]) {
      assert.equal(sessionOptionsSchema.safeParse({ [key]: value }).success, false, `${key}: ${String(value)}`);
    }
  }
  assert.equal(sessionOptionsSchema.safeParse({ unrestricted: true }).success, false);
});

test('preview grants require a strict explicit read-only declaration', () => {
  const grant = { connectorId: 'fixture-connector', actionName: 'read_fixture', readOnly: true };
  assert.deepEqual(grantSchema.parse(grant), grant);
  for (const readOnly of [false, 'true', 1, undefined]) {
    assert.equal(grantSchema.safeParse({ ...grant, readOnly }).success, false);
  }
  assert.equal(grantSchema.safeParse({ ...grant, accountId: 'caller-selected' }).success, false);
});
