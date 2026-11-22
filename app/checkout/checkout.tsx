'use client';

import Image from 'next/image';
import { ArrowLeft, ArrowRight, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Catalog } from '@/lib/catalog';
import { CART_KEY, resolveOrder, restoreCart, totalMmk, type CartItem } from '@/lib/cart-order';
import type { CommerceCustomer, CommerceOrder } from '@/lib/commerce-types';
import { checkoutFieldsFor, MAX_CUSTOMER_INPUT_UNITS } from '@/lib/payment';
import { durationText, planName, priceText, type ShopLanguage } from '@/lib/shop-language';
import { OfferPrice } from '../offer-price';
import { CustomerPayment, SubmittedOrderDetails } from '../customer-payment';

const ATTEMPT_KEY = 'digimium:website-checkout-attempt:v1';
type CheckoutRequest = {
  requestId: string;
  expectedCustomerId: string;
  expectedCatalogRevision: number;
  items: (CartItem & { inputs?: { unit: number; values: Record<string, string> }[] })[];
};
type SavedAttempt = { requestId: string; customerId: string; items: CartItem[] };

function clearCompletedCart(items: CartItem[], catalog: Catalog) {
  try {
    const latest = restoreCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'), catalog.products);
    if (JSON.stringify(latest) === JSON.stringify(items)) localStorage.setItem(CART_KEY, '[]');
  } catch { /* The saved order remains available from account history. */ }
}

function readAttempt(customerId: string): SavedAttempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null') as SavedAttempt | null;
    return value?.customerId === customerId && /^[0-9a-f-]{36}$/i.test(value.requestId) ? value : null;
  } catch { return null; }
}

export default function Checkout({ lang }: { lang: ShopLanguage }) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [customer, setCustomer] = useState<CommerceCustomer | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [catalogChanged, setCatalogChanged] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef<CheckoutRequest | null>(null);
  const savedRequestId = useRef<string | null>(null);
  const knownCustomerId = useRef<string | null>(null);
  const submittedCart = useRef<CartItem[]>([]);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = catalog ? resolveOrder(cart, catalog.products) : [];
  const total = totalMmk(rows);
  const inputUnits = rows.reduce((count, row) => count + (checkoutFieldsFor(row.product, row.plan).length ? row.quantity : 0), 0);
  const tooManyInputs = inputUnits > MAX_CUSTOMER_INPUT_UNITS;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const options = { cache: 'no-store', signal: controller.signal } as const;
        const [sessionResponse, catalogResponse] = await Promise.all([
          fetch('/api/customer/session', options), fetch('/api/catalog', options),
        ]);
        if (!sessionResponse.ok || !catalogResponse.ok) throw new Error('load');
        const session = await sessionResponse.json() as { customer: CommerceCustomer | null };
        const nextCatalog = await catalogResponse.json() as Catalog;
        if (controller.signal.aborted) return;
        if (knownCustomerId.current && knownCustomerId.current !== session.customer?.id) {
          setValues({}); setVisiblePasswords({}); setOrder(null); setUncertain(false);
          request.current = null; savedRequestId.current = null; submittedCart.current = [];
        }
        knownCustomerId.current = session.customer?.id ?? null;
        setCustomer(session.customer);
        setCatalog(nextCatalog);
        let nextCart: CartItem[] = [];
        try { nextCart = restoreCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'), nextCatalog.products); } catch { /* A fresh cart can still be opened from the storefront. */ }
        setCart(nextCart);
        const orderId = new URL(window.location.href).searchParams.get('order');
        if (session.customer && orderId && /^[0-9a-f-]{36}$/i.test(orderId)) {
          const response = await fetch(`/api/customer/orders/${orderId}?view=status`, options);
          if (!response.ok) throw new Error('order');
          const result = await response.json() as { order: CommerceOrder };
          if (!controller.signal.aborted) setOrder(result.order);
        } else if (session.customer) {
          const attempt = readAttempt(session.customer.id);
          if (attempt) {
            savedRequestId.current = attempt.requestId;
            submittedCart.current = restoreCart(attempt.items, nextCatalog.products);
            setCart(submittedCart.current);
            const response = await fetch(`/api/customer/checkout?requestId=${attempt.requestId}`, options);
            if (response.ok) {
              const result = await response.json() as { order: CommerceOrder };
              if (!controller.signal.aborted) {
                setOrder(result.order);
                window.history.replaceState(window.history.state, '', `/checkout?order=${result.order.id}`);
                clearCompletedCart(restoreCart(attempt.items, nextCatalog.products), nextCatalog);
                try { sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* Optional storage. */ }
              }
            } else if (response.status !== 404) throw new Error('recover');
          }
        }
        if (!controller.signal.aborted) setError('');
      } catch {
        if (!controller.signal.aborted) setError(lang === 'my' ? 'အော်ဒါအချက်အလက် ဖော်ပြမရသေးပါ။ ပြန်ကြိုးစားပါ။' : 'Couldn’t load your checkout. Please try again.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [lang, reload]);

  useEffect(() => {
    function clearPrivateFields() { setValues({}); setVisiblePasswords({}); request.current = null; }
    function restore(event: PageTransitionEvent) { if (event.persisted) window.location.reload(); }
    window.addEventListener('pagehide', clearPrivateFields);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', clearPrivateFields);
      window.removeEventListener('pageshow', restore);
    };
  }, []);

  useEffect(() => {
    if (!uncertain && !busy) return;
    function confirmLeave(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [uncertain, busy]);

  function acceptOrder(nextOrder: CommerceOrder) {
    setOrder(nextOrder);
    setValues({});
    setVisiblePasswords({});
    setUncertain(false);
    request.current = null;
    savedRequestId.current = null;
    try {
      sessionStorage.removeItem(ATTEMPT_KEY);
    } catch { /* The saved order remains available from account history. */ }
    if (catalog) clearCompletedCart(submittedCart.current, catalog);
    window.history.replaceState(window.history.state, '', `/checkout?order=${nextOrder.id}`);
    window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !catalog || !customer || !rows.length || tooManyInputs) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setCatalogChanged(false);
    let sent = false;
    try {
      const sessionResponse = await fetch('/api/customer/session', { cache: 'no-store' });
      if (!sessionResponse.ok) throw new Error('session');
      const session = await sessionResponse.json() as { customer: CommerceCustomer | null };
      if (session.customer?.id !== customer.id) {
        setValues({}); setVisiblePasswords({}); request.current = null;
        setCustomer(null);
        throw new Error(t('Sign in with your original account to continue.', 'ဆက်လုပ်ရန် မူလအကောင့်ဖြင့် ပြန်ဝင်ပါ။'));
      }
      if (!request.current) {
        request.current = {
          requestId: savedRequestId.current || crypto.randomUUID(),
          expectedCustomerId: customer.id,
          expectedCatalogRevision: catalog.revision,
          items: rows.map(row => {
            const fields = checkoutFieldsFor(row.product, row.plan);
            return {
              productId: row.productId, planId: row.planId, quantity: row.quantity,
              ...(fields.length ? { inputs: Array.from({ length: row.quantity }, (_, unit) => ({
                unit, values: Object.fromEntries(fields.map(field => [field.id, values[`${row.productId}:${row.planId ?? ''}:${unit}:${field.id}`] || ''])),
              })) } : {}),
            };
          }),
        };
        if (!savedRequestId.current) submittedCart.current = rows.map(({ productId, planId, quantity }) => ({ productId, planId, quantity }));
      }
      try { sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ requestId: request.current.requestId, customerId: customer.id, items: submittedCart.current })); } catch { /* Request and private values stay available in memory. */ }
      sent = true;
      const response = await fetch('/api/customer/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify(request.current),
      });
      const result = await response.json() as { order?: CommerceOrder; error?: string };
      if (response.ok && result.order) { acceptOrder(result.order); return; }
      if (response.status === 409) {
        const latestSessionResponse = await fetch('/api/customer/session', { cache: 'no-store' });
        if (!latestSessionResponse.ok) throw new Error('session');
        const latestSession = await latestSessionResponse.json() as { customer: CommerceCustomer | null };
        if (latestSession.customer?.id !== customer.id) {
          sent = false;
          setValues({}); setVisiblePasswords({}); setCustomer(null); setUncertain(false);
          request.current = null;
          throw new Error(t('Your account changed. Sign in with the original account to recover this checkout.', 'အကောင့် ပြောင်းသွားပါတယ်။ ဒီအော်ဒါကို ပြန်ရယူရန် မူလအကောင့်ဖြင့် ပြန်ဝင်ပါ။'));
        }
        const recovery = await fetch(`/api/customer/checkout?requestId=${request.current.requestId}`, { cache: 'no-store' });
        if (recovery.ok) {
          const recovered = await recovery.json() as { order: CommerceOrder };
          acceptOrder(recovered.order);
          return;
        }
        setCatalogChanged(true);
      }
      if (response.status < 500) {
        sent = false;
        request.current = null;
        savedRequestId.current = null;
        setUncertain(false);
        try { sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* Optional storage. */ }
      }
      throw new Error(response.status === 409
        ? t('The available plans changed. Reload the latest details and review your order.', 'Plan အချက်အလက် ပြောင်းသွားပါတယ်။ နောက်ဆုံးအချက်အလက်ကို ပြန်ဖွင့်ပြီး အော်ဒါ စစ်ဆေးပါ။')
        : result.error || t('Couldn’t save your order. Please try again.', 'အော်ဒါ သိမ်းမရသေးပါ။ ပြန်ကြိုးစားပါ။'));
    } catch (caught) {
      if (sent) setUncertain(true);
      setError(caught instanceof Error && !(caught instanceof TypeError) && caught.message !== 'session'
        ? caught.message : t('Couldn’t confirm the result. Retry this order to check it safely.', 'ရလဒ်ကို အတည်မပြုနိုင်သေးပါ။ ဒီအော်ဒါကိုပဲ ပြန်စမ်းပြီး စစ်ဆေးပါ။'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <main className="customer-page website-checkout" lang={lang}>
    <header className="customer-header">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Leave private checkout in a fresh document. */}
      <a className="customer-brand" href="/" aria-label={t('Digimium store', 'Digimium စတိုး')}><Image src="/assets/logo.png" alt="digimium." width={142} height={48} unoptimized /></a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Restore the cart in a fresh storefront document. */}
      <a className="customer-back" href="/?checkout=1"><ArrowLeft size={16} />{t('Back to cart', 'ဈေးခြင်းသို့ ပြန်ရန်')}</a>
    </header>
    <div className="checkout-main">
      <h1 ref={heading} tabIndex={-1}>{order ? t('Your order', 'သင့်အော်ဒါ') : t('Checkout', 'အော်ဒါတင်ရန်')}</h1>
      {!order && catalog?.demoPayments && <div className="checkout-demo-note" role="note"><strong>{t('Testing checkout', 'အော်ဒါတင်ခြင်း စမ်းသပ်ရန်')}</strong><p>{t('Use sample service emails and passwords only. Try the demo payment steps without sending money.', 'နမူနာ service email နှင့် password များသာ ဖြည့်ပါ။ Demo ငွေပေးချေမှု အဆင့်များကို စမ်းနိုင်ပါတယ်။ ငွေမလွှဲပါနှင့်။')}</p></div>}
      {loading && <p role="status">{t('Loading checkout…', 'အော်ဒါ ဖော်ပြနေသည်…')}</p>}
      {error && <div className="checkout-error" role="alert"><p>{error}</p>
        {!busy && !uncertain && (!catalog || !customer) && <button type="button" className="customer-refresh" onClick={() => { setLoading(true); setReload(value => value + 1); }}><RefreshCw size={16} />{t('Retry', 'ပြန်ကြိုးစားရန်')}</button>}
      </div>}
      {!loading && !customer && <div className="checkout-panel"><p>{t('Sign in to pay and receive your service through the website.', 'Website မှာ ငွေချေပြီး ဝန်ဆောင်မှုရယူရန် အကောင့်ဝင်ပါ။')}</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Existing checkout authentication lives in the storefront dialog. */}
        <a className="customer-primary" href="/?checkout=1">{t('Sign in or buy on Telegram', 'အကောင့်ဝင်ရန် / Telegram မှ ဝယ်ရန်')}<ArrowRight size={16} /></a>
      </div>}
      {customer && order && <div className="checkout-panel checkout-saved">
        <div className="checkout-reference"><span>{t('Order reference', 'အော်ဒါအမှတ်')}</span><strong>#{order.id.slice(0, 8).toUpperCase()}</strong></div>
        <ul className="checkout-summary">{order.lines.map(line => <li key={line.id}><div><strong>{line.productName}</strong><span>{[line.planName, durationText(line.duration, lang), t(`Qty ${line.quantity}`, `${line.quantity} ခု`)].filter(Boolean).join(' · ')}</span></div><span>{priceText(line.price, lang)}</span></li>)}</ul>
        <CustomerPayment order={order} methods={catalog?.paymentMethodIds || []} lang={lang} onUpdated={setOrder} />
        <SubmittedOrderDetails order={order} lang={lang} />
        <a className="customer-history-link" href="/order-history">{t('Open order history and delivered accounts', 'အော်ဒါမှတ်တမ်းနှင့် ရရှိသောအကောင့် ကြည့်ရန်')}<ArrowRight size={16} /></a>
      </div>}
      {!loading && customer && !order && catalog && (rows.length ? <form onSubmit={createOrder} className="checkout-form" autoComplete="off">
        <fieldset disabled={busy || uncertain}>
          <div className="checkout-panel"><h2>{t('Review your order', 'အော်ဒါ ပြန်စစ်ပါ')}</h2>
            <ul className="checkout-summary">{rows.map((row, index) => <li key={index}><div><strong>{row.product.name}</strong><span>{[row.plan && planName(row.plan, lang), t(`Qty ${row.quantity}`, `${row.quantity} ခု`)].filter(Boolean).join(' · ')}</span></div><OfferPrice offer={row.plan || row.product} lang={lang} /></li>)}</ul>
            <div className="customer-total"><span>{t('Order total', 'စုစုပေါင်း')}</span><strong>{total === undefined ? t('Awaiting a quote', 'ဈေးနှုန်း အတည်ပြုရန်') : priceText(`${total.toLocaleString('en-US')} MMK`, lang)}</strong></div>
          </div>
          {!tooManyInputs && rows.map(row => {
            const fields = checkoutFieldsFor(row.product, row.plan);
            if (!fields.length) return null;
            return <section className="checkout-panel checkout-inputs" key={`${row.productId}-${row.planId}`}>
              <h2>{row.product.name}</h2>{row.plan && <p className="checkout-muted">{planName(row.plan, lang)}</p>}
              {Array.from({ length: row.quantity }, (_, unit) => <div className="checkout-unit" key={unit}>
                {row.quantity > 1 && <h3>{t(`Account ${unit + 1}`, `အကောင့် ${unit + 1}`)}</h3>}
                {fields.map(field => {
                  const key = `${row.productId}:${row.planId ?? ''}:${unit}:${field.id}`;
                  const label = lang === 'my' && field.labelMy ? field.labelMy : field.label;
                  return <label key={field.id} htmlFor={`checkout-${key}`}><span>{label}{!field.required && <small> {t('(optional)', '(မဖြည့်လည်းရပါသည်)')}</small>}</span>
                    <span className="checkout-field-control"><input id={`checkout-${key}`} name={`checkout-${key}`} type={field.type === 'password' && visiblePasswords[key] ? 'text' : field.type}
                      required={field.required} maxLength={1000} autoComplete="off" autoCapitalize="none" spellCheck={false} value={values[key] || ''}
                      onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} />
                    {field.type === 'password' && <button type="button" aria-pressed={!!visiblePasswords[key]} aria-label={t('Show or hide password', 'စကားဝှက် ပြရန် / ဖျောက်ရန်')} onClick={() => setVisiblePasswords(current => ({ ...current, [key]: !current[key] }))}>{visiblePasswords[key] ? <EyeOff size={18} /> : <Eye size={18} />}</button>}</span>
                  </label>;
                })}
              </div>)}
            </section>;
          })}
        </fieldset>
        {tooManyInputs && <p className="checkout-error" role="alert">{t(`Orders needing customer account details support up to ${MAX_CUSTOMER_INPUT_UNITS} accounts at a time. Reduce the quantities in your cart to continue.`, `အကောင့်အချက်အလက် ဖြည့်ရသော အော်ဒါတစ်ခုတွင် အကောင့် ${MAX_CUSTOMER_INPUT_UNITS} ခုအထိ ထည့်နိုင်ပါတယ်။ ဆက်လုပ်ရန် ဈေးခြင်းထဲက အရေအတွက် လျှော့ပါ။`)}</p>}
        {uncertain && <p className="checkout-notice" role="status">{t('Your submission is being checked. Retry with the same details to recover the order.', 'အော်ဒါတင်ထားမှုကို စစ်ဆေးနေပါတယ်။ မူလအချက်အလက်များနဲ့ပဲ ပြန်စမ်းပြီး အော်ဒါကို ပြန်ရယူပါ။')}</p>}
        {catalogChanged && <button type="button" className="customer-refresh" onClick={() => { setLoading(true); setCatalogChanged(false); setReload(value => value + 1); }}><RefreshCw size={16} />{t('Reload latest plans', 'နောက်ဆုံး Plan များ ပြန်ဖွင့်ရန်')}</button>}
        <div className="checkout-submit"><p>{total === undefined ? t('Digimium will confirm the total before you pay.', 'ငွေမချေမီ Digimium က စုစုပေါင်းဈေးနှုန်း အတည်ပြုပေးပါမယ်။') : t('Next, choose a payment method and upload your payment screenshot.', 'နောက်တစ်ဆင့်မှာ ငွေချေနည်း ရွေးပြီး ငွေလွှဲ screenshot တင်ပါ။')}</p>
          <button className="customer-primary" type="submit" disabled={busy || catalogChanged || tooManyInputs}>{busy ? t('Saving…', 'သိမ်းနေသည်…') : uncertain ? t('Retry same order', 'ဒီအော်ဒါကို ပြန်စမ်းရန်') : t('Save order and continue', 'အော်ဒါသိမ်းပြီး ဆက်လုပ်မယ်')}<ArrowRight size={17} /></button>
        </div>
      </form> : <div className="checkout-panel"><p>{t('Your cart is empty.', 'ဈေးခြင်းထဲမှာ ပစ္စည်း မရှိသေးပါ။')}</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Storefront loads in its own document. */}
        <a className="customer-history-link" href="/#services">{t('Browse products', 'Product များ ကြည့်ရန်')}<ArrowRight size={16} /></a>
      </div>)}
    </div>
  </main>;
}
