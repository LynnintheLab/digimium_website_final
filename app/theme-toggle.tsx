'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { customerThemeAllowed, resolveShopTheme, SHOP_THEME_EVENT, SHOP_THEME_STORAGE_KEY, type ShopTheme } from '../lib/shop-theme';

let memoryPreference: ShopTheme | undefined;

function preference(): ShopTheme | undefined {
  if (memoryPreference) return memoryPreference;
  try {
    const saved = window.localStorage.getItem(SHOP_THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : memoryPreference;
  } catch { return memoryPreference; }
}

function apply(theme: ShopTheme) {
  const root = document.documentElement;
  const changed = root.dataset.shopTheme !== theme;
  root.dataset.shopTheme = theme;
  root.style.colorScheme = theme;
  if (changed) window.dispatchEvent(new Event(SHOP_THEME_EVENT));
}

function snapshot(): ShopTheme {
  return document.documentElement.dataset.shopTheme === 'dark' ? 'dark' : 'light';
}

function subscribe(listener: () => void) {
  window.addEventListener(SHOP_THEME_EVENT, listener);
  return () => window.removeEventListener(SHOP_THEME_EVENT, listener);
}

const serverSnapshot = (): ShopTheme => 'light';

export function ShopThemeObserver() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    let media: MediaQueryList | undefined;
    try { media = window.matchMedia('(prefers-color-scheme: dark)'); } catch { /* Light remains available. */ }
    const sync = () => apply(customerThemeAllowed(pathname ?? '/') ? resolveShopTheme(preference(), media?.matches ?? false) : 'light');
    const storage = (event: StorageEvent) => {
      if (event.key !== SHOP_THEME_STORAGE_KEY && event.key !== null) return;
      memoryPreference = undefined;
      sync();
    };
    sync();
    if (media?.addEventListener) media.addEventListener('change', sync);
    else media?.addListener(sync);
    window.addEventListener('storage', storage);
    return () => {
      if (media?.removeEventListener) media.removeEventListener('change', sync);
      else media?.removeListener(sync);
      window.removeEventListener('storage', storage);
    };
  }, [pathname]);
  return null;
}

export function ThemeToggle({ lang }: { lang: 'en' | 'my' }) {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const label = lang === 'my'
    ? theme === 'dark' ? 'အလင်းပုံစံ ပြောင်းရန်' : 'အမှောင်ပုံစံ ပြောင်းရန်'
    : theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance';
  function toggle() {
    const next = snapshot() === 'dark' ? 'light' : 'dark';
    memoryPreference = next;
    try { window.localStorage.setItem(SHOP_THEME_STORAGE_KEY, next); } catch { /* Keep the choice for this visit. */ }
    apply(next);
  }
  return <button type="button" className="shop-theme-toggle" aria-label={label} title={label} aria-pressed={theme === 'dark'} onClick={toggle}>
    <Moon className="theme-icon-light" size={19} aria-hidden="true"/>
    <Sun className="theme-icon-dark" size={19} aria-hidden="true"/>
  </button>;
}
