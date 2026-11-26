import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ORDER_RECEIPT_MAX_LENGTH, ORDER_RECEIPT_TTL, parseOrderReceipt, readOrderReceipt, receiptCanResume} from '../lib/order-receipt.ts';

const now = Date.UTC(2026, 10, 15);
const owner = '0fc2b101-1d00-4fc1-8000-000000000001';
const other = '0fc2b101-1d00-4fc1-8000-000000000002';
const fixture = () => ({version:1, savedAt:now, customerId:owner, telegram:'DigimiumStore', messages:['Order #123\n1 × Spotify'],
  order:{id:'0fc2b101-1d00-4fc1-8000-000000000003', totalMmk:16000, lines:[{productName:'Spotify',planName:'Individual',duration:'1 month',price:'16,000 MMK',quantity:1}]}});

test('an account receipt resumes only under the exact verified owner and store contact', () => {
  const receipt = readOrderReceipt(fixture(), now);
  assert.ok(receipt);
  assert.equal(receiptCanResume(receipt, owner, '@digimiumstore'), true);
  assert.equal(receiptCanResume(receipt, null, 'DigimiumStore'), false);
  assert.equal(receiptCanResume(receipt, other, 'DigimiumStore'), false);
  assert.equal(receiptCanResume(receipt, owner, 'AnotherStore'), false);
});

test('guest receipts retain their guest identity without inheriting a signed-in account', () => {
  const receipt = readOrderReceipt({...fixture(), customerId:null}, now);
  assert.equal(receipt.customerId, null);
  assert.equal(receiptCanResume(receipt, null, 'DigimiumStore'), true);
  assert.equal(receiptCanResume(receipt, other, 'DigimiumStore'), true);
});

test('the saved reference survives receipt recovery and legacy receipts still load', () => {
  const receipt = fixture();
  assert.equal(readOrderReceipt(receipt, now).order.reference, undefined);
  receipt.order.reference = 'DG - 2026NOV27 - 1000';
  assert.equal(parseOrderReceipt(JSON.stringify(receipt), now).order.reference, receipt.order.reference);
  receipt.order.reference = 'DG - 2026NOV27 - 1000\n';
  assert.equal(readOrderReceipt(receipt, now).order.reference, undefined);
});

test('the receipt projection drops fulfillment, contact and credential-shaped extra keys', () => {
  const raw = fixture();
  raw.secret = 'session-secret';
  raw.customer = {email:'private@example.com'};
  raw.order.lines[0].accountInfo = 'delivered-password';
  raw.order.lines[0].accountDetails = {account:'private-account',password:'structured-secret',manager:'private-manager',username:'private-user'};
  raw.order.lines[0].startDate = '2026-11-15';
  const receipt = readOrderReceipt(raw, now);
  const encoded = JSON.stringify(receipt);
  assert.ok(receipt);
  assert.ok(!encoded.includes('session-secret') && !encoded.includes('private@example.com') && !encoded.includes('delivered-password'));
  assert.equal(receipt.order.lines[0].accountInfo, undefined);
  assert.equal(receipt.order.lines[0].accountDetails, undefined);
  assert.ok(!encoded.includes('structured-secret') && !encoded.includes('private-account'));
});

test('expired, future, oversized and malformed receipts are rejected', () => {
  assert.equal(readOrderReceipt(fixture(), now + ORDER_RECEIPT_TTL), null);
  assert.equal(readOrderReceipt({...fixture(), savedAt:now+61000}, now), null);
  assert.equal(parseOrderReceipt('{', now), null);
  assert.equal(parseOrderReceipt('x'.repeat(ORDER_RECEIPT_MAX_LENGTH + 1), now), null);
  assert.equal(readOrderReceipt({...fixture(), telegram:'https://attacker.invalid'}, now), null);
  assert.equal(readOrderReceipt({...fixture(), customerId:'not-an-owner'}, now), null);
  const invalid = fixture(); invalid.order.lines[0].quantity = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(readOrderReceipt(invalid, now), null);
});

test('long Myanmar messages survive bounded round trips; unpriced totals remain null', () => {
  const raw = fixture(); raw.messages=['မင်္ဂလာပါ\n'+'ဝယ်ယူမည် '.repeat(200)]; raw.order.totalMmk=null;
  const receipt = parseOrderReceipt(JSON.stringify(raw), now);
  assert.deepEqual(receipt.messages, raw.messages);
  assert.equal(receipt.order.totalMmk, null);
});
