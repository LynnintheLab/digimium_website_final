import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeNotificationActionLabel, normalizeNotificationActionUrl } from '../lib/notification-action.ts';

test('notification buttons retain safe external destinations and known customer routes', () => {
  for (const url of ['/', '/account', '/order-history', '/#giveaway', '/#contact', '/account#sign-in-methods',
    'https://t.me/DigimiumFixture', 'https://www.facebook.com/profile.php?id=123&locale=en_US',
    'https://example.invalid/path?message=Hello%20there#section']) {
    assert.equal(normalizeNotificationActionUrl(url), url);
  }
  assert.equal(normalizeNotificationActionUrl(' HTTPS://EXAMPLE.INVALID '), 'https://example.invalid/');
  assert.equal(normalizeNotificationActionLabel('  ဆက်သွယ်မည် ↗  '), 'ဆက်သွယ်မည် ↗');
  assert.equal(normalizeNotificationActionLabel('Visit us 👋'), 'Visit us 👋');
  assert.equal(normalizeNotificationActionLabel('<b>Plain label</b>'), '<b>Plain label</b>');
});

test('notification buttons reject executable, ambiguous and credential-bearing destinations', () => {
  for (const url of ['', ' ', 'javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,test', 'file:///tmp/test',
    'mailto:owner@example.invalid', 'tg://resolve?domain=test', 'http://example.invalid', '//evil.invalid',
    '/\\evil.invalid', '\\evil.invalid', 'https://owner:password@example.invalid', 'https://owner@example.invalid',
    'https://example.invalid/\u0000', 'https://example.invalid/%0aheader', 'https://example.invalid/%5cpath',
    'https://example.invalid/%E2%80%AEtext', 'https://example.invalid/%', 'https://example.invalid/path with spaces',
    '/admin', '/api/customer/notifications', '/order-history/../admin', '/%2f%2fevil.invalid',
    '/account?redirect=https://evil.invalid', '/account/', '/account/../account', 'https://example.invalid/' + 'x'.repeat(2048)]) {
    assert.equal(normalizeNotificationActionUrl(url), null, JSON.stringify(url));
  }
});

test('notification button labels are bounded plain text without control or bidi overrides', () => {
  assert.equal(normalizeNotificationActionLabel('x'.repeat(60)), 'x'.repeat(60));
  for (const label of ['', '  ', 'x'.repeat(61), 'Bad\nlabel', 'Bad\tlabel', 'Bad\u0000label',
    'Bad\u202elabel', 'Bad\u2067label', '\uD800']) {
    assert.equal(normalizeNotificationActionLabel(label), null, JSON.stringify(label));
  }
});
