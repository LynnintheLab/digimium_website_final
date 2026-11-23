import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeOrderContact, MAX_ORDER_CONTACT_LENGTH } from '../lib/order-contact.ts';

test('Telegram handles and profile links normalize to the same private contact', () => {
  for (const value of [' @Example_User ', 'example_user', 'https://t.me/Example_User/', 't.me/example_user', 'https://Example_User.t.me/']) {
    assert.deepEqual(normalizeOrderContact({ method: 'telegram', value }), { method: 'telegram', value: '@example_user' });
  }
  assert.deepEqual(normalizeOrderContact({ method: 'telegram', value: '@Abcd' }), { method: 'telegram', value: '@abcd' });
  for (const value of ['@', 't.me/+invite', 'https://t.me/example_user/123', 'https://t.me/example_user?start=test',
    'https://t.me.evil.invalid/example_user', '@12345']) {
    assert.equal(normalizeOrderContact({ method: 'telegram', value }), null);
  }
});

test('phone and Viber retain international/local number meaning and accept Myanmar numerals', () => {
  for (const method of ['phone', 'viber']) {
    assert.deepEqual(normalizeOrderContact({ method, value: ' +၉၅ (၉) ၇၈၉-၁၂၃-၄၅၆ ' }), { method, value: '+959789123456' });
    assert.deepEqual(normalizeOrderContact({ method, value: '၀၉ ၇၈၉ ၁၂၃ ၄၅၆' }), { method, value: '09789123456' });
    for (const value of ['123', '+00123456789', '+959hello', '00000000', '+9591234567890123456']) {
      assert.equal(normalizeOrderContact({ method, value }), null);
    }
  }
});

test('Facebook accepts profile names and bounded canonical Facebook links as text', () => {
  assert.deepEqual(normalizeOrderContact({ method: 'facebook', value: ' မောင်မောင် ' }), { method: 'facebook', value: 'မောင်မောင်' });
  assert.deepEqual(normalizeOrderContact({ method: 'facebook', value: 'm.facebook.com/example.person?ref=share#about' }),
    { method: 'facebook', value: 'https://www.facebook.com/example.person' });
  assert.deepEqual(normalizeOrderContact({ method: 'facebook', value: 'https://www.facebook.com/profile.php?id=1234567&ref=share' }),
    { method: 'facebook', value: 'https://www.facebook.com/profile.php?id=1234567' });
  for (const value of ['javascript:alert(1)', '<script>alert(1)</script>', 'https://example.invalid/name',
    'https://facebook.com.evil.invalid/name', 'https://www.facebook.com/profile.php', 'facebook.com/',
    'https://facebook.com/%0aevil', 'https://facebook.com/%3Cscript%3E']) {
    assert.equal(normalizeOrderContact({ method: 'facebook', value }), null);
  }
});

test('contacts reject malformed objects, hidden controls and excessive input, and normalization is stable', () => {
  for (const value of [null, [], 'phone', { method: 'email', value: 'user@example.invalid' },
    { method: 'phone', value: '+959123456789', extra: true }, Object.create({ method: 'phone', value: '+959123456789' })]) {
    assert.equal(normalizeOrderContact(value), null);
  }
  for (const value of ['Name\nOther', 'Name\u202eOther', 'Name\u0000', 'A'.repeat(MAX_ORDER_CONTACT_LENGTH + 1)]) {
    assert.equal(normalizeOrderContact({ method: 'facebook', value }), null);
  }
  for (const input of [{ method: 'telegram', value: 't.me/Example_User' }, { method: 'phone', value: '၀၉ ၇၈၉ ၁၂၃ ၄၅၆' },
    { method: 'facebook', value: 'm.facebook.com/profile.php?id=1234567&ref=share' }, { method: 'facebook', value: 'Cafe\u0301 Person' }]) {
    const normalized = normalizeOrderContact(input);
    assert.ok(normalized);
    assert.deepEqual(normalizeOrderContact(normalized), normalized);
  }
});
