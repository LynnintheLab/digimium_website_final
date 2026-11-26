'use client';

import {ArrowRight, AtSign, Phone, Send, Smartphone, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {CommerceCustomer} from '../lib/commerce-types';
import {normalizeCheckoutContact, type CheckoutContact, type CheckoutContactMethod} from '../lib/order-checkout-contact';
import {TelegramLogin} from './account/telegram-login';
import {useTelegramLogin} from './account/use-telegram-login';

type Props = {
  lang: 'my' | 'en';
  customerId: string;
  submitting: boolean;
  error: string;
  onEdit: () => void;
  onBack: () => void;
  onSubmit: (contact: CheckoutContact) => void;
  onLinked: (customer: CommerceCustomer) => void;
  onLinkBusyChange: (busy: boolean) => void;
};

const methods = [
  {method: 'telegram-username', en: 'Telegram username', my: 'Telegram username', example: '@your_username', Icon: AtSign},
  {method: 'telegram-phone', en: 'Telegram phone number', my: 'Telegram ဖုန်းနံပါတ်', example: '+95 9 XXX XXX XXX', Icon: Smartphone},
  {method: 'viber-phone', en: 'Viber phone number', my: 'Viber ဖုန်းနံပါတ်', example: '09 XXX XXX XXX', Icon: Phone},
] as const;

export function CheckoutContactForm({lang, customerId, submitting, error, onEdit, onBack, onSubmit, onLinked, onLinkBusyChange}: Props) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [method, setMethod] = useState<CheckoutContactMethod>('telegram-username');
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const link = useRef<HTMLButtonElement>(null);
  const wasLinking = useRef(false);
  const telegram = useTelegramLogin('checkout', {onSuccess: onLinked, onBusyChange: onLinkBusyChange}, {purpose: 'link', autoResume: false, expectedCustomerId: customerId});
  const selected = methods.find(option => option.method === method)!;
  const username = method === 'telegram-username';

  useEffect(() => {
    if (!telegram.active && wasLinking.current) link.current?.focus({preventScroll: true});
    else title.current?.focus({preventScroll: true});
    wasLinking.current = telegram.active;
  }, [telegram.active]);

  return <div className="order-contact order-scroll">
    <header className="order-contact-header">
      <div>
        <h2 id="shop-order-title" ref={title} tabIndex={-1}>{telegram.active
          ? t('Connect Telegram', 'Telegram ချိတ်ဆက်ရန်')
          : t('Contact for your order', 'အော်ဒါအတွက် ဆက်သွယ်ရန်')}</h2>
        {!telegram.active && <p>{t('Choose one contact method.', 'နည်းလမ်းတစ်ခု ရွေးပါ။')}</p>}
      </div>
      <button type="button" className="order-contact-close" aria-label={t('Back to cart', 'ဈေးခြင်းသို့ ပြန်ရန်')} disabled={submitting || telegram.busy} onClick={onBack}><X size={18} aria-hidden/></button>
    </header>
    {telegram.active ? <TelegramLogin login={telegram} t={t} checkout /> : <form className="order-contact-form" onSubmit={event => {
      event.preventDefault();
      const contact = normalizeCheckoutContact({method, value});
      if (!contact) { setInvalid(true); input.current?.focus(); return; }
      onSubmit(contact);
    }}>
      <fieldset className="order-contact-methods" disabled={submitting}>
        <legend>{t('Contact method', 'ဆက်သွယ်မယ့်နည်းလမ်း')}</legend>
        {methods.map(({method: option, en, my, Icon}) => <label key={option}>
          <Icon size={16} aria-hidden/>
          <span>{t(en, my)}</span>
          <input type="radio" name="checkout-contact-method" value={option} checked={option === method} onChange={() => {
            setMethod(option); setValue(''); setInvalid(false); onEdit();
          }} />
        </label>)}
      </fieldset>
      <div className="order-contact-field">
        <label htmlFor="order-contact-value">{t(selected.en, selected.my)}</label>
        <input id="order-contact-value" ref={input} type={username ? 'text' : 'tel'}
          placeholder={username ? t('Enter username', 'Username ထည့်ပါ') : t('Enter phone number', 'ဖုန်းနံပါတ် ထည့်ပါ')}
          autoComplete="off" autoCapitalize="none" spellCheck={false} required disabled={submitting} maxLength={64}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? 'order-contact-example order-contact-invalid' : 'order-contact-example'}
          value={value} onChange={event => { setValue(event.target.value); setInvalid(false); onEdit(); }} />
        <p id="order-contact-example">{t('Example', 'ဥပမာ')} <bdi>{selected.example}</bdi></p>
        {invalid && <p id="order-contact-invalid" className="order-contact-error" role="alert">{username
          ? t('Enter a valid Telegram username.', 'မှန်ကန်တဲ့ Telegram username ထည့်ပါ။')
          : t('Enter a valid phone number.', 'မှန်ကန်တဲ့ ဖုန်းနံပါတ် ထည့်ပါ။')}</p>}
        {error && <p className="order-contact-error" role="alert">{error}</p>}
      </div>
      <div className="order-contact-actions">
        <button className="order-contact-primary" type="submit" disabled={submitting}>{submitting
          ? t('Preparing order…', 'အော်ဒါ ပြင်ဆင်နေသည်…')
          : t('Place order', 'Order တင်မယ်')}<ArrowRight size={17} aria-hidden/></button>
        <div className="order-contact-divider"><span>{t('or', 'ဒါမှမဟုတ်')}</span></div>
        <button ref={link} className="order-contact-secondary" type="button" disabled={submitting || telegram.enabled !== true}
          onClick={() => void telegram.start()}><Send size={16} aria-hidden/>{t('Connect Telegram', 'Telegram နဲ့ ချိတ်မယ်')}</button>
        {telegram.enabled === false && <p className="order-contact-link-status" role="status">{t('Telegram connection is currently unavailable.', 'Telegram ချိတ်ဆက်မှု ယာယီ မရသေးပါ။')}</p>}
      </div>
    </form>}
  </div>;
}
