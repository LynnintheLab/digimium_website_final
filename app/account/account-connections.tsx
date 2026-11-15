'use client';

import { Check, Link2, Mail, Send, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CommerceCustomer } from '../../lib/commerce-types';
import { useTelegramLogin } from './use-telegram-login';
import { TelegramLogin } from './telegram-login';
import { GoogleMark } from './auth-form';
import './account-connections.css';

type Translate = (en: string, my: string) => string;

function ConnectionGuide({ t }: { t: Translate }) {
  const guide = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.location.hash !== '#telegram-link-guide' || !guide.current) return;
    guide.current.open = true;
    guide.current.scrollIntoView({ block: 'start' });
  }, []);
  return <details className="account-link-guide" id="telegram-link-guide" ref={guide}>
    <summary>{t('How to connect Telegram', 'Telegram ချိတ်နည်းကြည့်မည်')}</summary>
    <ol>
      <li><div className="account-guide-picture" aria-hidden="true"><span className="account-guide-avatar">D</span><Settings size={32}/></div><strong>1. {t('Open Account settings', 'အကောင့် ဆက်တင်များ ဖွင့်ပါ')}</strong><p>{t('Use the round gear button in your Account box.', 'Account box ထဲက အဝိုင်း gear ခလုတ်ကို နှိပ်ပါ။')}</p></li>
      <li><div className="account-guide-picture" aria-hidden="true"><Send size={30}/><span className="account-guide-connect"><Link2 size={18}/>Connect</span></div><strong>2. {t('Choose Connect Telegram', 'Telegram ချိတ်ဆက်မည် ကို နှိပ်ပါ')}</strong><p>{t('A four-digit code appears on this page. Open the bot using its Telegram button.', 'ဒီစာမျက်နှာမှာ ဂဏန်း ၄ လုံး code ပေါ်လာပါမယ်။ Telegram ခလုတ်ကနေ bot ကို ဖွင့်ပါ။')}</p></li>
      <li><div className="account-guide-picture" aria-hidden="true"><span className="account-guide-code">• • • •</span><Check size={30}/></div><strong>3. {t('Match the code, then return', 'Code တူတာရွေးပြီး ပြန်လာပါ')}</strong><p>{t('Choose the matching code in the bot. Return here and wait for Connected. Your existing orders stay in this account.', 'Bot မှာ code တူတာရွေးပြီး ဒီစာမျက်နှာကို ပြန်လာပါ။ “ချိတ်ဆက်ပြီး” ပေါ်လာရင် ပြီးပါပြီ။ ယခင်အော်ဒါတွေ ဒီအကောင့်မှာပဲ ရှိနေပါမယ်။')}</p></li>
    </ol>
    <p className="account-guide-note">{t('Illustrations only. Use the actual code shown when you connect.', 'ပုံတွေက လမ်းညွှန်နမူနာပါ။ ချိတ်ဆက်ချိန်မှာ ပေါ်လာတဲ့ code အစစ်ကို သုံးပါ။')}</p>
  </details>;
}

export function AccountConnections({ customer, onUpdated, t }: { customer: CommerceCustomer; onUpdated: (customer: CommerceCustomer) => void; t: Translate }) {
  const [connected, setConnected] = useState(false);
  const telegram = useTelegramLogin('account', { onSuccess(person) {
    onUpdated(person); setConnected(true);
    window.dispatchEvent(new Event('digimium-account-changed'));
  } }, { purpose: 'link' });
  const methods = customer.signInMethods;
  return <section className="account-connections" aria-labelledby="account-signin-methods">
    <h2 id="account-signin-methods">{t('Sign-in methods', 'အကောင့်ဝင်ရောက်နည်းများ')}</h2>
    <p className="account-connections-intro">{t('These methods open this same account. Connect Telegram to join the giveaway and view your existing plans in the bot.', 'ချိတ်ထားတဲ့ နည်းလမ်းတွေကနေ ဒီအကောင့်တစ်ခုတည်းကို ဝင်နိုင်ပါတယ်။ Giveaway ဝင်ဖို့နဲ့ ယခင်ဝယ်ထားတဲ့ plan တွေကို bot မှာ ကြည့်ဖို့ Telegram ချိတ်ထားပါ။')}</p>
    {methods ? <ul className="account-method-list">
      <li><Mail size={20} aria-hidden/><div><strong>{t('Email and password', 'Email နှင့် စကားဝှက်')}</strong>{methods.emailPassword && customer.email && <span>{customer.email}</span>}</div><span className="account-method-state" data-connected={methods.emailPassword || undefined}>{methods.emailPassword ? t('Enabled', 'သုံးထားသည်') : t('Not enabled', 'သုံးမထားပါ')}</span></li>
      <li><GoogleMark/><div><strong>Google</strong>{methods.google && customer.email && <span>{customer.email}</span>}</div><span className="account-method-state" data-connected={methods.google || undefined}>{methods.google ? t('Connected', 'ချိတ်ဆက်ပြီး') : t('Connect — coming soon', 'ချိတ်ဆက်ရန် — မကြာမီ')}</span></li>
      <li><Send size={20} aria-hidden/><div><strong>Telegram</strong>{customer.telegram?.username && <span>@{customer.telegram.username}</span>}</div>{methods.telegram ? <span className="account-method-state" data-connected><Check size={15} aria-hidden/>{t('Connected', 'ချိတ်ဆက်ပြီး')}</span> : <button type="button" className="customer-primary account-connect-button" disabled={telegram.enabled !== true || telegram.busy} onClick={() => { setConnected(false); void telegram.start(); }}><Link2 size={16} aria-hidden/>{telegram.enabled === null ? t('Loading…', 'ဖွင့်နေသည်…') : t('Connect', 'ချိတ်ဆက်မည်')}</button>}</li>
    </ul> : <p role="status">{t('Loading sign-in methods…', 'ဝင်ရောက်နည်းများ ဖော်ပြနေသည်…')}</p>}
    {connected && <p className="account-link-success" role="status"><Check size={17} aria-hidden/>{t('Telegram connected. Your previous orders and plans belong to this same account.', 'Telegram ချိတ်ဆက်ပြီးပါပြီ။ ယခင်အော်ဒါနဲ့ plan တွေ ဒီအကောင့်မှာပဲ ရှိနေပါတယ်။')}</p>}
    {telegram.active && <TelegramLogin login={telegram} t={t}/>}
    {telegram.enabled === false && !methods?.telegram && <p className="account-guide-note">{t('Telegram connection is not available on this environment yet.', 'ဒီ website environment မှာ Telegram ချိတ်ဆက်မှု မဖွင့်ရသေးပါ။')}</p>}
    <ConnectionGuide t={t}/>
  </section>;
}
