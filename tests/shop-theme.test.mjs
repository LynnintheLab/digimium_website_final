import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { customerThemeAllowed, resolveShopTheme, SHOP_THEME_BOOTSTRAP, SHOP_THEME_STORAGE_KEY } from '../lib/shop-theme.ts';

function firstPaint({ saved = null, dark = false, pathname = '/', blockedStorage = false, blockedMedia = false } = {}) {
  const root = { dataset: {}, style: {} };
  const sandbox = {
    document: { documentElement: root }, location: { pathname },
    localStorage: { getItem(key) { assert.equal(key, SHOP_THEME_STORAGE_KEY); if (blockedStorage) throw new Error('Storage unavailable'); return saved; } },
    window: { matchMedia(query) { assert.equal(query, '(prefers-color-scheme: dark)'); if (blockedMedia) throw new Error('Media unavailable'); return { matches: dark }; } },
  };
  vm.runInNewContext(SHOP_THEME_BOOTSTRAP, sandbox, { timeout: 1000 });
  return root;
}

test('an explicit light or dark choice takes precedence over the operating system', () => {
  assert.equal(resolveShopTheme('light', true), 'light');
  assert.equal(resolveShopTheme('dark', false), 'dark');
  assert.equal(firstPaint({ saved: 'light', dark: true }).dataset.shopTheme, 'light');
  assert.equal(firstPaint({ saved: 'dark', dark: false }).dataset.shopTheme, 'dark');
});

test('a new visitor follows their system appearance', () => {
  assert.equal(resolveShopTheme(undefined, true), 'dark');
  assert.equal(resolveShopTheme(undefined, false), 'light');
  assert.equal(firstPaint({ dark: true }).dataset.shopTheme, 'dark');
  assert.equal(firstPaint({ dark: false }).dataset.shopTheme, 'light');
});

test('unexpected storage values cannot become theme attributes or override the system', () => {
  for (const saved of ['', 'system', 'DARK', '<script>', {}, null]) {
    assert.equal(resolveShopTheme(saved, true), 'dark');
    assert.equal(firstPaint({ saved, dark: true }).dataset.shopTheme, 'dark');
  }
});

test('blocked browser storage still uses the system preference without throwing', () => {
  const root = firstPaint({ blockedStorage: true, dark: true });
  assert.equal(root.dataset.shopTheme, 'dark');
  assert.equal(root.style.colorScheme, 'dark');
});

test('an unavailable media query does not discard an explicit browser choice', () => {
  assert.equal(firstPaint({ saved: 'dark', blockedMedia: true }).dataset.shopTheme, 'dark');
  assert.equal(firstPaint({ blockedStorage: true, blockedMedia: true }).dataset.shopTheme, 'light');
});

test('admin and admin login keep a light canvas even when a customer prefers dark', () => {
  for (const pathname of ['/admin', '/admin/', '/admin/login', '/admin/commerce']) {
    assert.equal(customerThemeAllowed(pathname), false);
    const root = firstPaint({ pathname, saved: 'dark', dark: true });
    assert.equal(root.dataset.shopTheme, 'light');
    assert.equal(root.style.colorScheme, 'light');
  }
});

test('customer account and history retain the customer theme on their first paint', () => {
  for (const pathname of ['/', '/account', '/order-history', '/administrator']) {
    assert.equal(customerThemeAllowed(pathname), true);
    assert.equal(firstPaint({ pathname, saved: 'dark' }).dataset.shopTheme, 'dark');
  }
});
