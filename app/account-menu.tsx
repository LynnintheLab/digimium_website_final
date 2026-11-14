'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import type { ShopLanguage } from '../lib/shop-language';
import './account/account.css';
import './account-menu.css';

const AccountContent = lazy(() => import('./account/account').then(module => ({ default: module.AccountContent })));

export function AccountMenu({lang, onOpen}: {lang: ShopLanguage; onOpen: () => void}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const title = lang === 'my' ? 'ကျွန်ုပ်၏ အကောင့်' : 'My account';

  function close() {
    setOpen(false);
    trigger.current?.focus({preventScroll: true});
  }

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({preventScroll: true});
    function outside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus({preventScroll: true});
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
  }, [open]);

  return <div className="shop-account" ref={wrapper}>
    <button ref={trigger} type="button" className="shop-account-link" aria-label={title}
      aria-expanded={open} aria-controls="shop-account-panel" aria-haspopup="dialog"
      onClick={() => { if (!open) onOpen(); setOpen(!open); }}>
      <UserRound size={19} aria-hidden="true"/><span className="shop-cart-word">{lang === 'my' ? 'အကောင့်' : 'Account'}</span>
    </button>
    {open && <div ref={panel} id="shop-account-panel" className="shop-account-panel" role="dialog"
      aria-labelledby="shop-account-title" tabIndex={-1}>
      <div className="shop-account-heading"><h2 id="shop-account-title">{title}</h2>
        <button type="button" onClick={close} aria-label={lang === 'my' ? 'အကောင့် box ပိတ်ရန်' : 'Close account'}><X size={19}/></button>
      </div>
      <Suspense fallback={<p className="shop-account-loading" role="status">{lang === 'my' ? 'အကောင့် ဖွင့်နေသည်…' : 'Loading account…'}</p>}>
        <AccountContent lang={lang} embedded onClose={close}/>
      </Suspense>
    </div>}
  </div>;
}
