'use client';

import Image from 'next/image';
import { ArrowLeft, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CommerceCustomer } from '@/lib/commerce-types';
import { RUNNINGHUB_PACKS, type RunningHubOrder, type RunningHubPack, type RunningHubPackId, type RunningHubPaymentMethod } from '@/lib/runninghub';
import type { ShopLanguage } from '@/lib/shop-language';
import { AuthForm } from '../account/auth-form';
import { RunningHubOrderPanel, runningHubStatus, walletName } from './order-panel';

const API = '/api/customer/runninghub';
const ATTEMPT_KEY = 'digimium:runninghub-attempt:v1';
type Data = { customer: CommerceCustomer; packs: RunningHubPack[]; methods: RunningHubPaymentMethod[]; orders: RunningHubOrder[] };
type Stock = Record<RunningHubPackId, number>;
type Attempt = { requestId: string; expectedCustomerId: string; packId: RunningHubPackId; method: RunningHubPaymentMethod['id'] };
const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const pending = (order: RunningHubOrder) => order.status === 'awaiting_payment' || order.status === 'payment_review';

function forgetAttempt() { try { sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* Optional non-secret recovery metadata. */ } }
function readAttempt(customerId: string): Attempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null') as Attempt | null;
    return value?.expectedCustomerId === customerId && isUuid(value.requestId) && ['usd10', 'usd20'].includes(value.packId) && ['kpay', 'aya'].includes(value.method) ? value : null;
  } catch { return null; }
}

function stockLabel(count: number | undefined, lang: ShopLanguage, loading = false) {
  if (loading) return lang === 'my' ? 'လက်ကျန် စစ်နေသည်…' : 'Checking stock…';
  if (count === undefined) return lang === 'my' ? 'လက်ကျန် စစ်မရသေးပါ' : 'Stock count unavailable';
  if (count === 0) return lang === 'my' ? 'လက်ကျန် မရှိပါ' : 'Out of stock';
  const formatted = count.toLocaleString(lang === 'my' ? 'my-MM' : 'en-US');
  return lang === 'my' ? `လက်ကျန် ${formatted} ခု` : `${formatted} ${count === 1 ? 'key' : 'keys'} left`;
}

function Packages({ lang, stock, loading }: { lang: ShopLanguage; stock?: Stock | null; loading?: boolean }) {
  return <div className="rh-price-preview">{RUNNINGHUB_PACKS.map(pack => <div key={pack.id}>
    <strong>{pack.usd} USD</strong><span>{pack.priceMmk.toLocaleString('en-US')} Ks</span>
    <small className="rh-stock-count" aria-live="polite">{stockLabel(stock?.[pack.id], lang, loading)}</small>
  </div>)}</div>;
}

function Purchase({ data, lang, stockReady, onSaved, onRefresh, onIdentityChange }: { data: Data; lang: ShopLanguage; stockReady: boolean; onSaved: (order: RunningHubOrder) => void; onRefresh: () => void; onIdentityChange: () => void }) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [initial] = useState(() => readAttempt(data.customer.id));
  const attempt = useRef<Attempt | null>(initial);
  const [chosenPackId, setChosenPackId] = useState<RunningHubPackId | null>(initial?.packId ?? null);
  const [method, setMethod] = useState<RunningHubPaymentMethod['id']>(initial?.method || data.methods[0]?.id || 'kpay');
  const [uncertain, setUncertain] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const active = useRef(true);
  const currentPending = data.orders.find(pending);
  const packId = chosenPackId ?? data.packs.find(item => item.available > 0)?.id;
  const pack = data.packs.find(item => item.id === packId);
  const configured = data.methods.length > 0;
  const available = stockReady && !!pack?.available && data.methods.some(item => item.id === method);

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, uncertain]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !packId || currentPending || (!uncertain && !available)) return;
    inFlight.current = true; setBusy(true); setError('');
    setChosenPackId(packId);
    attempt.current ??= { requestId: crypto.randomUUID(), expectedCustomerId: data.customer.id, packId, method };
    const submitted = attempt.current;
    try { sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(submitted)); } catch { /* The request remains recoverable in memory. */ }
    try {
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify(submitted) });
      const result = await response.json() as { order?: RunningHubOrder; error?: string };
      if (!active.current) return;
      if (response.ok && result.order && result.order.customerId === data.customer.id) { forgetAttempt(); attempt.current = null; setUncertain(false); onSaved(result.order); return; }
      if (response.status === 401) { onIdentityChange(); return; }
      if (response.status === 409) {
        const recovery = await fetch(API, { cache: 'no-store' });
        if (!active.current) return;
        if (recovery.status === 401) { onIdentityChange(); return; }
        if (!recovery.ok) throw new Error('uncertain');
        const latest = await recovery.json() as Data;
        if (!active.current) return;
        if (latest.customer.id !== data.customer.id) { onIdentityChange(); return; }
        const existing = latest.orders.find(pending);
        if (existing) { forgetAttempt(); attempt.current = null; setUncertain(false); onSaved(existing); return; }
      }
      if (response.status < 500) { forgetAttempt(); attempt.current = null; setUncertain(false); onRefresh(); }
      else setUncertain(true);
      setError(result.error || t('This bundle could not be reserved. Refresh and try again.', 'ဒီ Package ကို ခေတ္တသီးသန့်ထားမပေးနိုင်သေးပါ။ ပြန်ကြည့်ပြီး ထပ်စမ်းပါ။'));
    } catch {
      if (active.current) { setUncertain(true); setError(t('The result is not confirmed. Retry this same order to recover it.', 'အော်ဒါတင်ပြီးကြောင်း အတည်မပြုနိုင်သေးပါ။ မူလအော်ဒါကိုပဲ ပြန်စမ်းပါ။')); }
    } finally { inFlight.current = false; if (active.current) setBusy(false); }
  }

  return <section className="rh-panel" aria-labelledby="rh-buy-title"><h2 id="rh-buy-title">{t('Choose your bundle', 'Package ရွေးပါ')}</h2>
    <form onSubmit={submit}><fieldset disabled={busy || uncertain || !!currentPending} className="rh-choices"><legend className="rh-sr-only">{t('Running HUB bundle', 'Running HUB Package')}</legend>
      {RUNNINGHUB_PACKS.map(item => {
        const count = stockReady ? data.packs.find(candidate => candidate.id === item.id)?.available : undefined;
        return <label className="rh-package" key={item.id} data-selected={packId === item.id}>
          <input type="radio" name="runninghub-pack" checked={packId === item.id} onChange={() => setChosenPackId(item.id)} disabled={!count} />
          <span><strong>{item.usd} USD</strong><span>{item.priceMmk.toLocaleString('en-US')} Ks</span><small className="rh-stock-count" aria-live="polite">{stockLabel(count, lang)}</small></span>
          {packId === item.id && <Check size={18} aria-hidden="true" />}
        </label>;
      })}
    </fieldset>
    {!configured ? <div className="rh-notice" role="status"><strong>{t('Payment setup is not ready', 'ငွေပေးချေမှု ပြင်ဆင်နေဆဲ')}</strong><p>{t('Check back here when Digimium has added its receiving accounts. Your order will start only when payment is available.', 'Digimium က ငွေလက်ခံအကောင့်များ ထည့်ပြီးချိန် ဒီမှာ ပြန်ကြည့်ပါ။ ငွေပေးချေနိုင်မှ အော်ဒါစတင်နိုင်ပါမယ်။')}</p></div>
      : <fieldset className="rh-methods" disabled={busy || uncertain || !!currentPending}><legend>{t('Pay with', 'ငွေပေးချေနည်း')}</legend><div>{data.methods.map(item => <label key={item.id} data-selected={method === item.id}><input type="radio" name="runninghub-method" checked={method === item.id} onChange={() => setMethod(item.id)} /><Image src={`/assets/payments/${item.id === 'kpay' ? 'kbzpay.jpg' : 'ayapay.jpg'}`} width={26} height={26} alt="" unoptimized /><span>{walletName(item.id)}</span></label>)}</div></fieldset>}
    {currentPending && <p className="rh-notice">{t('Finish your current order before buying another key.', 'နောက်ထပ် Key မဝယ်မီ လက်ရှိအော်ဒါကို အရင်ဆောင်ရွက်ပါ။')} <button type="button" className="rh-text-button" onClick={() => onSaved(currentPending)}>{t('Open current order', 'လက်ရှိအော်ဒါ ဖွင့်ရန်')}</button></p>}
    {uncertain && <p className="rh-notice" role="status">{t('An earlier submission needs to be checked. Retry keeps the same bundle and payment method.', 'အရင်တင်ထားသော အော်ဒါကို စစ်ဆေးရန် လိုပါတယ်။ ပြန်စမ်းလျှင် မူလ Package နှင့် ငွေချေနည်းကိုပဲ သုံးပါမယ်။')}</p>}
    {error && <p className="rh-error" role="alert">{error}</p>}
    <button className="rh-primary" type="submit" disabled={busy || !!currentPending || (!uncertain && (!configured || !available))}>{busy ? t('Reserving…', 'သီးသန့်ထားပေးနေသည်…') : uncertain ? t('Retry same order', 'မူလအော်ဒါ ပြန်စမ်းရန်') : t('Continue to payment', 'ငွေပေးချေရန် ဆက်သွားမယ်')}<ArrowRight size={17} /></button>
    <p className="rh-help">{t('One key per order. Pay only after the next screen shows your active reservation and receiving account.', 'အော်ဒါတစ်ခုလျှင် Key တစ်ခု ရပါမယ်။ နောက်စာမျက်နှာမှာ သီးသန့်ထားပေးသော အော်ဒါနှင့် ငွေလက်ခံအကောင့် ပြမှသာ ငွေလွှဲပါ။')}</p>
    </form>
  </section>;
}

export default function RunningHub({ lang }: { lang: ShopLanguage }) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [customer, setCustomer] = useState<CommerceCustomer | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<{ reload: number; stock: Stock | null } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const owner = useRef<string | null>(null);
  const selection = useRef<string | null>(null);
  const refresh = () => setReload(value => value + 1);
  const selected = data?.orders.find(order => order.id === selectedId) || null;
  const hasReview = data?.orders.some(order => order.status === 'payment_review');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const options = { cache: 'no-store', signal: controller.signal } as const;
        const sessionResponse = await fetch('/api/customer/session', options);
        if (!sessionResponse.ok) throw new Error('session');
        const session = await sessionResponse.json() as { customer: CommerceCustomer | null };
        if (controller.signal.aborted) return;
        if (owner.current !== session.customer?.id) { setData(null); setSelectedId(null); selection.current = null; }
        owner.current = session.customer?.id ?? null;
        setCustomer(session.customer);
        if (!session.customer) { setError(''); return; }
        const response = await fetch(API, options);
        if (response.status === 401) { owner.current = null; setCustomer(null); setData(null); setSelectedId(null); return; }
        if (!response.ok) throw new Error('availability');
        const result = await response.json() as Data;
        if (controller.signal.aborted) return;
        if (owner.current !== result.customer.id) { selection.current = null; setSelectedId(null); }
        owner.current = result.customer.id; setCustomer(result.customer);
        const requested = new URL(window.location.href).searchParams.get('order');
        let chosen = selection.current || (isUuid(requested) ? requested : null) || result.orders.find(pending)?.id || null;
        if (chosen && !result.orders.some(order => order.id === chosen)) {
          const detailResponse = await fetch(`${API}/${chosen}`, options);
          if (detailResponse.ok) { const detail = await detailResponse.json() as { order: RunningHubOrder }; if (detail.order.customerId === result.customer.id) result.orders.unshift(detail.order); else chosen = null; }
          else chosen = null;
        }
        if (controller.signal.aborted) return;
        setData(current => ({ ...result, orders: result.orders.map(order => { const previous = current?.customer.id === result.customer.id ? current.orders.find(item => item.id === order.id) : null; return previous && previous.revision > order.revision ? previous : order; }) }));
        selection.current = chosen; setSelectedId(chosen); setError('');
        if (result.orders.some(pending)) forgetAttempt();
      } catch {
        if (!controller.signal.aborted) setError(lang === 'my' ? 'Running HUB အချက်အလက် ခေတ္တဖော်ပြမရသေးပါ။ ပြန်ကြည့်ပါ သို့မဟုတ် Digimium ကို ဆက်သွယ်ပါ။' : 'Running HUB is temporarily unavailable. Refresh or contact Digimium for help.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [reload, lang]);

  useEffect(() => {
    if (loading || customer) return;
    const controller = new AbortController();
    async function loadStock() {
      try {
        const response = await fetch('/api/runninghub/availability', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('availability');
        const { stock } = await response.json() as { stock: Stock };
        if (RUNNINGHUB_PACKS.some(({ id }) => !Number.isSafeInteger(stock?.[id]) || stock[id] < 0)) throw new Error('availability');
        if (!controller.signal.aborted) setPreview({ reload, stock });
      } catch {
        if (!controller.signal.aborted) setPreview({ reload, stock: null });
      }
    }
    void loadStock();
    return () => controller.abort();
  }, [customer, loading, reload]);

  useEffect(() => {
    const visible = () => { if (!document.hidden) setReload(value => value + 1); };
    const clear = () => { owner.current = null; setCustomer(null); setData(null); setLoading(true); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) setReload(value => value + 1); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('pagehide', clear); window.addEventListener('pageshow', restored);
    return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', clear); window.removeEventListener('pageshow', restored); };
  }, []);
  useEffect(() => {
    if (!hasReview) return;
    const timer = window.setInterval(() => { if (!document.hidden) setReload(value => value + 1); }, 8000);
    return () => window.clearInterval(timer);
  }, [hasReview]);

  function select(order: RunningHubOrder) {
    selection.current = order.id; setSelectedId(order.id);
    window.history.replaceState(window.history.state, '', `/runninghub?order=${order.id}`);
  }
  function update(order: RunningHubOrder) {
    if (owner.current !== order.customerId) return;
    setData(current => {
      if (!current || current.customer.id !== order.customerId || current.orders.some(item => item.id === order.id && item.revision > order.revision)) return current;
      return { ...current, orders: [order, ...current.orders.filter(item => item.id !== order.id)] };
    });
    select(order);
  }
  function identityChanged() { owner.current = null; setData(null); setCustomer(null); setLoading(true); refresh(); }

  return <main className="customer-page rh-page" lang={lang}>
    {/* Full document navigation isolates this private page from storefront analytics. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <header className="customer-header"><a className="customer-brand" href="/" aria-label="Digimium"><Image src="/assets/logo.png" alt="digimium." width={142} height={48} unoptimized /></a><nav aria-label={t('Customer navigation', 'အကောင့် လမ်းညွှန်')}><a href="/account">{t('My account', 'အကောင့်')}</a><a className="customer-back" href="/"><ArrowLeft size={16} />{t('Store', 'စတိုး')}</a></nav></header>
    <div className="rh-main"><div className="rh-heading"><div><h1>Running HUB API Key</h1><p>{t('Choose a bundle, send your payment screenshot, and get your key here after payment approval.', 'Package ရွေးပြီး ငွေလွှဲ screenshot တင်ပါ။ ငွေပေးချေမှု အတည်ပြုပြီးရင် API Key ကို ဒီမှာ ရယူနိုင်ပါမယ်။')}</p></div><button type="button" className="rh-secondary" lang="en" onClick={refresh} disabled={loading}><RefreshCw size={16} aria-hidden="true" />Refresh</button></div>
      {/* Full document navigation keeps storefront scripts out of the private page. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      {error && <div className="rh-error" role="alert"><p>{error}</p><a href="/#contact">{t('Contact Digimium', 'Digimium ကို ဆက်သွယ်ရန်')}</a></div>}
      {loading && <p className="rh-loading" role="status">{t('Loading your bundles and orders…', 'Package နှင့် အော်ဒါများ ဖော်ပြနေသည်…')}</p>}
      {!loading && !customer && <div className="rh-signed-out">
        <section className="rh-account-gate" aria-labelledby="rh-account-title">
          <h2 id="rh-account-title">{t('A Digimium account is required to buy', 'ဝယ်ယူရန် Digimium အကောင့် လိုအပ်ပါတယ်')}</h2>
          <p>{t('Create an account or sign in to continue. You can find your orders and API keys in your account.', 'ဆက်လက်ဝယ်ယူရန် အကောင့်ဖွင့်ပါ သို့မဟုတ် ဝင်ပါ။ အော်ဒါနဲ့ API Key တွေကို သင့်အကောင့်မှာ ပြန်ကြည့်နိုင်ပါတယ်။')}</p>
          <Packages lang={lang} stock={preview?.stock} loading={preview?.reload !== reload} />
        </section>
        <AuthForm checkout={false} embedded history={false} accountRequired t={t} onSuccess={() => { setLoading(true); refresh(); }} />
      </div>}
      {customer && !data && !loading && <section className="rh-panel"><h2>{t('Purchasing is not available yet', 'ဝယ်ယူရန် အဆင်သင့် မဖြစ်သေးပါ')}</h2><p>{t('Bundle availability and receiving accounts must be ready before you pay. Refresh this page to check again.', 'ငွေမချေမီ Package နှင့် ငွေလက်ခံအကောင့်များ အဆင်သင့် ဖြစ်ရန်လိုပါတယ်။ ဒီစာမျက်နှာကို ပြန်ကြည့်ပါ။')}</p><Packages lang={lang} /></section>}
      {customer && data && <div className="rh-layout" key={customer.id}><div>
        {selected ? <><RunningHubOrderPanel key={selected.id} order={selected} lang={lang} onUpdated={update} onRefresh={refresh} onIdentityChange={identityChanged} />{!pending(selected) && <button type="button" className="rh-secondary rh-new-order" onClick={() => { selection.current = null; setSelectedId(null); window.history.replaceState(window.history.state, '', '/runninghub'); refresh(); }}>{t('Choose another bundle', 'နောက်ထပ် Package ရွေးရန်')}<ArrowRight size={16} /></button>}</>
          : <Purchase data={data} lang={lang} stockReady={!error} onSaved={order => { update(order); refresh(); }} onRefresh={refresh} onIdentityChange={identityChanged} />}
      </div><aside className="rh-history" aria-labelledby="rh-history-title"><h2 id="rh-history-title">{t('Your Running HUB orders', 'သင့် Running HUB အော်ဒါများ')}</h2><p>{t('Return to this page to recover approved keys and check payments.', 'အတည်ပြုပြီးသော Key များ ပြန်ယူရန်နှင့် ငွေပေးချေမှု စစ်ဆေးရန် ဒီစာမျက်နှာကို ပြန်လာနိုင်ပါတယ်။')}</p>
        {data.orders.length ? <ol>{data.orders.map(order => <li key={order.id}><button type="button" aria-current={selectedId === order.id ? 'true' : undefined} onClick={() => select(order)}><span><strong>{RUNNINGHUB_PACKS.find(pack => pack.id === order.packId)?.usd} USD</strong><span>{order.priceMmk.toLocaleString('en-US')} Ks</span></span><span className="rh-history-status">{runningHubStatus(order.status, lang)}</span><small>#{order.id.slice(0, 8).toUpperCase()} · {new Intl.DateTimeFormat(lang === 'my' ? 'my-MM' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Yangon' }).format(new Date(order.createdAt))}</small></button></li>)}</ol> : <p className="rh-empty">{t('Your orders and approved keys will appear here.', 'သင့်အော်ဒါနှင့် အတည်ပြုပြီးသော Key များကို ဒီမှာ ပြပေးပါမယ်။')}</p>}
      </aside></div>}
    </div>
  </main>;
}
