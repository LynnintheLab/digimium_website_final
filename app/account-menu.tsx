'use client';

import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import type { ShopLanguage } from '../lib/shop-language';
import './account/account.css';
import './account-menu.css';

const AccountContent = lazy(() => import('./account/account').then(module => ({ default: module.AccountContent })));

export type AccountMenuHandle = { open(): void; close(): void };
type AccountMenuProps = { lang: ShopLanguage; onOpen: () => void; onOpenChange?: (open: boolean) => void };

export const AccountMenu = forwardRef<AccountMenuHandle, AccountMenuProps>(function AccountMenu({lang, onOpen, onOpenChange}, ref) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const title = lang === 'my' ? 'ကျွန်ုပ်၏ အကောင့်' : 'My account';

  const close = useCallback((restore = true) => {
    restoreFocus.current = restore;
    setOpen(false);
  }, []);

  const show = useCallback(() => {
    if (open) return;
    const active = document.activeElement;
    const dockTrigger = document.querySelector<HTMLElement>('.mobile-dock-center[aria-controls="shop-account-panel"]');
    opener.current = active instanceof HTMLElement && active !== document.body ? active
      : dockTrigger?.getClientRects().length ? dockTrigger : trigger.current;
    restoreFocus.current = false;
    onOpen();
    setOpen(true);
  }, [onOpen, open]);

  useImperativeHandle(ref, () => ({open: show, close: () => close()}), [show, close]);

  useEffect(() => {
    onOpenChange?.(open);
    if (open || !restoreFocus.current) return;
    // Parent state and keyboard/dock effects can need more than one frame to settle.
    let frame = 0;
    let attempts = 0;
    const deadline = performance.now() + 750;
    const visible = (target: HTMLElement | null): target is HTMLElement => {
      if (!target?.isConnected || target.matches(':disabled') || target.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
      const style = getComputedStyle(target);
      return style.visibility !== 'hidden' && style.visibility !== 'collapse' &&
        Array.from(target.getClientRects()).some(rect => rect.width > 0 && rect.height > 0);
    };
    const restore = () => {
      if (!restoreFocus.current) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement && visible(active)) {
        restoreFocus.current = false;
        return;
      }
      const dockTrigger = document.querySelector<HTMLElement>('.mobile-dock-center[aria-controls="shop-account-panel"]');
      for (const target of [opener.current, dockTrigger, trigger.current]) {
        if (!visible(target)) continue;
        target.focus({preventScroll: true});
        if (document.activeElement === target) {
          restoreFocus.current = false;
          return;
        }
      }
      if (++attempts < 30 && performance.now() < deadline) frame = requestAnimationFrame(restore);
      else restoreFocus.current = false;
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({preventScroll: true});
    function outside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) close(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    panel.current?.addEventListener('keydown', escape);
    const currentPanel = panel.current;
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      currentPanel?.removeEventListener('keydown', escape);
    };
  }, [open, close]);

  return <div className="shop-account" ref={wrapper}>
    <button ref={trigger} type="button" className="shop-account-link" aria-label={title}
      aria-expanded={open} aria-controls="shop-account-panel" aria-haspopup="dialog"
      onClick={() => { if (open) close(); else show(); }}>
      <UserRound size={19} aria-hidden="true"/><span className="shop-cart-word">{lang === 'my' ? 'အကောင့်' : 'Account'}</span>
    </button>
    {open && <div ref={panel} id="shop-account-panel" className="shop-account-panel" role="dialog"
      aria-labelledby="shop-account-title" tabIndex={-1}>
      <div className="shop-account-heading"><h2 id="shop-account-title">{title}</h2>
        <button type="button" onClick={() => close()} aria-label={lang === 'my' ? 'အကောင့် box ပိတ်ရန်' : 'Close account'}><X size={19}/></button>
      </div>
      <Suspense fallback={<p className="shop-account-loading" role="status">{lang === 'my' ? 'အကောင့် ဖွင့်နေသည်…' : 'Loading account…'}</p>}>
        <AccountContent lang={lang} embedded onClose={() => close()}/>
      </Suspense>
    </div>}
  </div>;
});
