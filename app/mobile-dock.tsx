'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { History, LayoutGrid, LifeBuoy, ShoppingBag, UserRound } from 'lucide-react';
import { CART_KEY } from '../lib/cart-order';
import { commerceEnabled } from '../lib/commerce-enabled';
import type { ShopLanguage } from '../lib/shop-language';
import './mobile-dock.css';

export type MobileDockActive = 'services' | 'account' | 'history' | 'help';
type MobileDockProps = {
  lang: ShopLanguage;
  active?: MobileDockActive;
  cartCount?: number;
  onCart?: () => void;
  onAccount?: () => void;
  onSectionChange?: (section: 'services' | 'help') => void;
  hidden?: boolean;
};

function storedCartCount() {
  try {
    const raw = localStorage.getItem(CART_KEY) || '[]';
    if (raw.length > 100_000) return 0;
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 1000) return 0;
    let total = 0;
    for (const item of value) {
      if (!item || typeof item !== 'object' || typeof item.productId !== 'string' || !item.productId ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1) return 0;
      total = Math.min(1_000_000, total + item.quantity);
    }
    return total;
  } catch { return 0; }
}

export function MobileDock({lang, active, cartCount, onCart, onAccount, onSectionChange, hidden = false}: MobileDockProps) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [savedCount, setSavedCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const count = cartCount ?? savedCount;

  function navigateSection(event: MouseEvent<HTMLAnchorElement>, section: 'services' | 'help') {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    onSectionChange?.(section);
    if (event.currentTarget.href !== window.location.href) return;
    const target = document.getElementById(section === 'help' ? 'contact' : 'services');
    if (!target) return;
    // Next Link skips scrolling when the URL already equals this exact anchor.
    event.preventDefault();
    target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  useEffect(() => {
    if (cartCount !== undefined) return;
    const read = () => setSavedCount(storedCartCount());
    const frame = requestAnimationFrame(read);
    const synchronize = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) read(); };
    window.addEventListener('storage', synchronize);
    window.addEventListener('pageshow', read);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('storage', synchronize); window.removeEventListener('pageshow', read); };
  }, [cartCount]);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const field = document.activeElement;
      setEditing(field instanceof HTMLElement && (field.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea,select') || field.isContentEditable));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(read); };
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule); window.visualViewport?.removeEventListener('resize', schedule); };
  }, []);

  const cartLabel = t('Cart', 'ဈေးခြင်း') + ' (' + count + ')';
  const badge = count > 0 && <span className="mobile-dock-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>;
  const cartContents = <><span className="mobile-dock-icon"><ShoppingBag size={22} aria-hidden="true"/>{badge}</span><span>{t('Cart', 'ဈေးခြင်း')}</span></>;
  const accountContents = <><span className="mobile-dock-icon"><UserRound size={25} aria-hidden="true"/></span><span>{t('Account', 'အကောင့်')}</span></>;

  return <nav className={'mobile-dock' + (!commerceEnabled ? ' mobile-dock-legacy' : '')} hidden={hidden || editing}
    aria-label={t('Mobile navigation', 'ဖုန်း ပင်မမီနူး')}>
    <Link className="mobile-dock-item" href="/#services" aria-current={active === 'services' ? 'page' : undefined}
      onClick={event => navigateSection(event, 'services')}><span className="mobile-dock-icon"><LayoutGrid size={21} aria-hidden="true"/></span><span>{t('Products', 'ပစ္စည်းများ')}</span></Link>
    {onCart ? <button type="button" className={'mobile-dock-item' + (!commerceEnabled ? ' mobile-dock-center' : '')} aria-label={cartLabel} onClick={onCart}>{cartContents}</button>
      : <Link className={'mobile-dock-item' + (!commerceEnabled ? ' mobile-dock-center' : '')} href="/?checkout=1" aria-label={cartLabel}>{cartContents}</Link>}
    {commerceEnabled && (onAccount ? <button type="button" className="mobile-dock-item mobile-dock-center" onClick={onAccount} aria-label={t('My account', 'ကျွန်ုပ်၏ အကောင့်')} aria-haspopup="dialog" aria-controls="shop-account-panel">{accountContents}</button>
      : <Link className="mobile-dock-item mobile-dock-center" href="/?account=1" aria-current={active === 'account' ? 'page' : undefined}>{accountContents}</Link>)}
    {commerceEnabled && <Link className="mobile-dock-item" href="/order-history" aria-current={active === 'history' ? 'page' : undefined}><span className="mobile-dock-icon"><History size={22} aria-hidden="true"/></span><span>{t('History', 'မှတ်တမ်း')}</span></Link>}
    <Link className="mobile-dock-item" href="/#contact" aria-current={active === 'help' ? 'page' : undefined}
      onClick={event => navigateSection(event, 'help')}><span className="mobile-dock-icon"><LifeBuoy size={22} aria-hidden="true"/></span><span>{t('Help', 'အကူအညီ')}</span></Link>
  </nav>;
}
