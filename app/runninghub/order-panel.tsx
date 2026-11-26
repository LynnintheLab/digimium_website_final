'use client';

import Image from 'next/image';
import { Check, Copy, Eye, EyeOff, ImagePlus, KeyRound, RefreshCw, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { RUNNINGHUB_PACKS, RUNNINGHUB_PROOF_MAX_BYTES, type RunningHubOrder, type RunningHubPaymentMethod } from '@/lib/runninghub';
import type { ShopLanguage } from '@/lib/shop-language';

export const walletName = (method: RunningHubPaymentMethod['id']) => method === 'kpay' ? 'KPay' : 'AYA Pay';
export function runningHubStatus(status: RunningHubOrder['status'], lang: ShopLanguage) {
  const labels = { awaiting_payment: ['Awaiting payment', 'ငွေပေးချေရန်'], payment_review: ['Payment under review', 'ငွေပေးချေမှု စစ်ဆေးနေသည်'], approved: ['API key ready', 'API Key ရပါပြီ'], rejected: ['Payment not approved', 'ငွေပေးချေမှု အတည်မပြုပါ'], expired: ['Reservation expired', 'သီးသန့်ထားပေးချိန် ကုန်သွားပါပြီ'] };
  return labels[status][lang === 'my' ? 1 : 0];
}

export function RunningHubOrderPanel({ order, lang, onUpdated, onRefresh, onIdentityChange }: {
  order: RunningHubOrder; lang: ShopLanguage; onUpdated: (order: RunningHubOrder) => void; onRefresh: () => void; onIdentityChange: () => void;
}) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [now, setNow] = useState(() => Date.now());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [copied, setCopied] = useState<'recipient' | 'key' | null>(null);
  const [proofFailed, setProofFailed] = useState(false);
  const [proofRetry, setProofRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<{ revision: number; requestId: string; file: File } | null>(null);
  const active = useRef(true);
  const flight = useRef(false);
  const keyGeneration = useRef(0);
  const keyRequest = useRef<AbortController | null>(null);
  const previousStatus = useRef(order.status);
  const allowAutomaticReveal = useRef(true);
  const expiry = order.expiresAt ? Date.parse(order.expiresAt) : NaN;
  const expiredLocally = order.status === 'awaiting_payment' && (!Number.isFinite(expiry) || expiry <= now);
  const canPay = order.status === 'awaiting_payment' && !expiredLocally;
  const stage = expiredLocally ? 'expired' : order.status;
  const progressStopped = stage === 'expired' || stage === 'rejected';
  const progressStep = stage === 'approved' ? 2 : stage === 'payment_review' || stage === 'rejected' ? 1 : 0;
  const api = `/api/customer/runninghub/${order.id}`;
  const bundle = RUNNINGHUB_PACKS.find(pack => pack.id === order.packId);

  useEffect(() => {
    active.current = true;
    const clearKey = () => { allowAutomaticReveal.current = false; keyGeneration.current += 1; keyRequest.current?.abort(); setApiKey(''); setCopied(null); };
    const hidden = () => { if (document.hidden) clearKey(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', clearKey);
    return () => { active.current = false; keyGeneration.current += 1; keyRequest.current?.abort(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', clearKey); };
  }, []);
  useEffect(() => {
    if (order.status !== 'awaiting_payment') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [order.status]);
  useEffect(() => {
    const attempt = request.current;
    if (!attempt || order.revision <= attempt.revision) return;
    const frame = requestAnimationFrame(() => { request.current = null; setUncertain(false); setFile(null); setPreview(''); if (input.current) input.current.value = ''; });
    return () => cancelAnimationFrame(frame);
  }, [order.revision]);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setPreview(url));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [file]);
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, uncertain]);

  useEffect(() => {
    const wasReviewing = previousStatus.current === 'payment_review';
    previousStatus.current = order.status;
    if (!wasReviewing || order.status !== 'approved' || document.hidden || !allowAutomaticReveal.current) return;
    const generation = ++keyGeneration.current;
    const controller = new AbortController();
    keyRequest.current?.abort(); keyRequest.current = controller;
    async function showApprovedKey() {
      try {
        const response = await fetch(api, { cache: 'no-store', signal: controller.signal });
        const result = await response.json() as { order?: RunningHubOrder; apiKey?: string };
        if (!active.current || generation !== keyGeneration.current || document.hidden) return;
        if (response.status === 401) { onIdentityChange(); return; }
        if (response.ok && result.order?.customerId === order.customerId && result.order.status === 'approved' && result.apiKey) setApiKey(result.apiKey);
      } catch { /* Explicit View API key remains available if this automatic check fails. */ }
    }
    void showApprovedKey();
  }, [api, order.status, order.customerId, onIdentityChange]);

  function choose(next: File | null) {
    if (flight.current || uncertain || !canPay || !next) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type) || !next.size || next.size > RUNNINGHUB_PROOF_MAX_BYTES) { setError(t('Choose a PNG, JPG or WebP image up to 5 MB.', '5 MB အထိ PNG၊ JPG သို့မဟုတ် WebP ပုံ ရွေးပါ။')); return; }
    request.current = null; setError(''); setPreview(''); setFile(next);
  }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); if (event.dataTransfer.files.length !== 1) { setError(t('Add one screenshot at a time.', 'Screenshot တစ်ပုံစီ ထည့်ပါ။')); return; } choose(event.dataTransfer.files[0]); }
  function paste(event: ClipboardEvent<HTMLDivElement>) { const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file'); if (!files.length) return; event.preventDefault(); if (files.length !== 1) { setError(t('Paste one screenshot at a time.', 'Screenshot တစ်ပုံစီ paste လုပ်ပါ။')); return; } choose(files[0].getAsFile()); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current || !canPay || !file) return;
    flight.current = true; setBusy(true); setError('');
    request.current ??= { revision: order.revision, requestId: crypto.randomUUID(), file };
    const attempt = request.current;
    try {
      const response = await fetch(`${api}/proof?revision=${attempt.revision}&requestId=${attempt.requestId}`, { method: 'POST', headers: { 'Content-Type': attempt.file.type }, cache: 'no-store', body: attempt.file });
      const result = await response.json() as { order?: RunningHubOrder; error?: string };
      if (!active.current) return;
      if (response.ok && result.order) { request.current = null; setFile(null); setPreview(''); setUncertain(false); onUpdated(result.order); return; }
      if (response.status === 401) { onIdentityChange(); return; }
      if (response.status < 500) { request.current = null; setUncertain(false); }
      else setUncertain(true);
      if (response.status === 409) onRefresh();
      setError(result.error || t('The screenshot could not be submitted. Please try again.', 'Screenshot တင်မရသေးပါ။ ပြန်ကြိုးစားပါ။'));
    } catch {
      if (active.current && request.current?.requestId === attempt.requestId) { setUncertain(true); setError(t('The upload result is not confirmed. Retry the same screenshot or refresh this order.', 'ပုံတင်ပြီးကြောင်း အတည်မပြုနိုင်သေးပါ။ မူလ screenshot ကို ပြန်တင်ပါ သို့မဟုတ် အော်ဒါ ပြန်ကြည့်ပါ။')); }
    } finally { flight.current = false; if (active.current) setBusy(false); }
  }

  async function revealKey() {
    if (apiKey) { keyGeneration.current += 1; keyRequest.current?.abort(); setApiKey(''); setCopied(null); return; }
    if (flight.current || order.status !== 'approved') return;
    flight.current = true; setBusy(true); setError('');
    const generation = ++keyGeneration.current;
    const controller = new AbortController(); keyRequest.current = controller;
    try {
      const response = await fetch(api, { cache: 'no-store', signal: controller.signal });
      const result = await response.json() as { order?: RunningHubOrder; apiKey?: string; error?: string };
      if (!active.current || generation !== keyGeneration.current) return;
      if (response.status === 401) { onIdentityChange(); return; }
      if (!response.ok || result.order?.customerId !== order.customerId || result.order.status !== 'approved' || !result.apiKey) throw new Error('key');
      setApiKey(result.apiKey);
    } catch { if (active.current && !controller.signal.aborted) setError(t('Your key could not be loaded. Refresh or sign in again, then retry.', 'Key ဖော်ပြမရသေးပါ။ ပြန်ကြည့်ပါ သို့မဟုတ် အကောင့်ပြန်ဝင်ပြီး ထပ်စမ်းပါ။')); }
    finally { flight.current = false; if (active.current) setBusy(false); }
  }

  async function copy(kind: 'recipient' | 'key') {
    if (kind === 'recipient' && !canPay) return;
    const value = kind === 'key' ? apiKey : order.payment.accountNumber;
    if (!value) return;
    try { await navigator.clipboard.writeText(value); if (active.current) setCopied(kind); }
    catch { if (active.current) setError(t('Select the displayed text and copy it manually.', 'ပြထားသောစာသားကို ရွေးပြီး ကိုယ်တိုင် ကူးယူပါ။')); }
  }

  return <section className="rh-panel rh-order" aria-labelledby={`rh-order-${order.id}`}>
    <div className="rh-order-heading"><div><h2 id={`rh-order-${order.id}`}>{bundle?.usd} USD · {order.priceMmk.toLocaleString('en-US')} Ks</h2><p>#{order.id.slice(0, 8).toUpperCase()}</p></div><span id={`rh-order-status-${order.id}`} className="rh-state" data-status={stage}>{stage === 'approved' && <Check size={17} />}{runningHubStatus(stage, lang)}</span></div>
    <ol className="rh-progress" role="list" aria-label={t('Order progress', 'အော်ဒါအဆင့်များ')} aria-describedby={`rh-order-status-${order.id}`}
      data-animate={!progressStopped && stage !== 'approved' && !error && !uncertain || undefined}>
      {[t('Order saved', 'အော်ဒါသိမ်းပြီး'), t('Payment review', 'ငွေပေးချေမှု စစ်ဆေးရန်'), t('API key', 'API Key')].map((label, index) => {
        const state = stage === 'approved' || index < progressStep ? 'complete' : index === progressStep ? progressStopped ? 'stopped' : 'current' : 'upcoming';
        return <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
          <span className="rh-progress-number" lang="en" dir="ltr" aria-hidden="true">{index + 1}</span>
          {index < 2 && <span className="rh-progress-connector" aria-hidden="true" />}
          <span className="rh-progress-label">{label}</span>
          {state === 'complete' && <span className="rh-sr-only">{t('Completed', 'ပြီးစီးပြီ')}</span>}
          {state === 'stopped' && <span className="rh-sr-only">{t('Stopped', 'ရပ်ဆိုင်းထားသည်')}</span>}
        </li>;
      })}
    </ol>
    {canPay && <>
      <p className="rh-deadline">{t('Reserved until', 'သီးသန့်ထားပေးချိန်')} <time dateTime={order.expiresAt!}>{new Intl.DateTimeFormat(lang === 'my' ? 'my-MM' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yangon' }).format(new Date(expiry))}</time> {t('(Myanmar time)', '(မြန်မာစံတော်ချိန်)')} · {Math.max(0, Math.ceil((expiry - now) / 60000))} {t('min left', 'မိနစ် ကျန်')}</p>
      <div className="rh-recipient"><h3>{walletName(order.payment.id)}</h3><p>{t(`Transfer ${order.priceMmk.toLocaleString('en-US')} Ks in ${walletName(order.payment.id)}, then upload the receipt before the reservation expires.`, `${walletName(order.payment.id)} မှ ${order.priceMmk.toLocaleString('en-US')} Ks လွှဲပြီး သီးသန့်ထားပေးချိန် မကုန်မီ screenshot တင်ပါ။`)}</p><dl><div><dt>{t('Receiver', 'ငွေလက်ခံသူ')}</dt><dd>{order.payment.accountLabel}</dd></div><div><dt>{t('Account number', 'အကောင့်နံပါတ်')}</dt><dd><bdi>{order.payment.accountNumber}</bdi><button type="button" className="rh-icon-button" onClick={() => void copy('recipient')} aria-label={t('Copy account number', 'အကောင့်နံပါတ် ကူးယူရန်')}><Copy size={17} /></button></dd></div></dl>{copied === 'recipient' && <p className="rh-help" role="status">{t('Account number copied.', 'အကောင့်နံပါတ် ကူးယူပြီးပါပြီ။')}</p>}{order.payment.qrPath && <Image className="rh-qr" src={order.payment.qrPath} width={220} height={220} alt={`${walletName(order.payment.id)} QR`} unoptimized />}</div>
      <form className="rh-proof-form" onSubmit={submit}><h3>{t('Upload your payment screenshot', 'ငွေလွှဲ screenshot တင်ပါ')}</h3><div className="rh-upload" role="group" aria-label={t('Payment screenshot upload', 'ငွေလွှဲ screenshot တင်ရန်')} tabIndex={0} onDrop={drop} onDragOver={event => event.preventDefault()} onPaste={paste}>
        {preview ? <Image className="rh-local-preview" src={preview} width={300} height={220} alt={t('Selected payment screenshot', 'ရွေးထားသော ငွေလွှဲ screenshot')} unoptimized /> : <ImagePlus size={32} strokeWidth={1.5} aria-hidden="true" />}
        {file ? <p className="rh-filename">{file.name}</p> : <strong>{t('Choose, drop or paste your image here', 'ပုံရွေးပါ၊ ဆွဲထည့်ပါ သို့မဟုတ် paste လုပ်ပါ')}</strong>}
        <div className="rh-upload-actions"><label className="rh-file-picker">{file ? t('Change image', 'ပုံပြောင်းရန်') : t('Choose image', 'ပုံရွေးရန်')}<input ref={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || uncertain} onChange={event => choose(event.target.files?.[0] || null)} /></label>{file && <button type="button" className="rh-text-button" disabled={busy || uncertain} onClick={() => { setFile(null); setPreview(''); if (input.current) input.current.value = ''; }}><X size={16} />{t('Remove', 'ဖယ်ရန်')}</button>}</div>
        <p className="rh-help">PNG, JPG, WebP · {t('up to 5 MB', '5 MB အထိ')}<br />{t('Focus here to paste a copied image with Ctrl / ⌘ + V.', 'ကူးထားသောပုံကို ဒီနေရာမှာ Ctrl / ⌘ + V ဖြင့် paste လုပ်နိုင်ပါတယ်။')}</p>
      </div>{uncertain && <p className="rh-notice" role="status">{t('Retry uses the same screenshot and request.', 'ပြန်တင်လျှင် မူလ screenshot နှင့် အော်ဒါကိုပဲ သုံးပါမယ်။')}</p>}<button className="rh-primary" type="submit" disabled={busy || !file}><Upload size={17} />{busy ? t('Submitting…', 'တင်နေသည်…') : uncertain ? t('Retry screenshot', 'Screenshot ပြန်တင်ရန်') : t('Submit for payment review', 'ငွေပေးချေမှု စစ်ဆေးရန် တင်မယ်')}</button></form>
    </>}
    {order.status === 'payment_review' && <div className="rh-review" role="status"><RefreshCw size={22} aria-hidden="true" /><h3>{t('Your payment is being reviewed', 'ငွေပေးချေမှု စစ်ဆေးနေပါတယ်')}</h3><p>{t('Your receipt is saved. This page checks for approval automatically. Your API key will be ready here when Digimium approves the payment.', 'Screenshot သိမ်းပြီးပါပြီ။ ဒီစာမျက်နှာက အတည်ပြုမှုကို အလိုအလျောက် ပြန်စစ်ပေးနေပါတယ်။ Digimium က ငွေပေးချေမှု အတည်ပြုပြီးရင် API Key ကို ဒီမှာ ရယူနိုင်ပါမယ်။')}</p><p>{t('You can return to this page later.', 'ဒီစာမျက်နှာကို နောက်မှ ပြန်လာကြည့်နိုင်ပါတယ်။')}</p></div>}
    {order.status === 'approved' && <div className="rh-key"><KeyRound size={26} aria-hidden="true" /><h3>{t('Your API key is ready', 'သင့် API Key ရပါပြီ')}</h3><p>{t('View and copy your key. It stays available in your Running HUB order history.', 'Key ကို ဖွင့်ကြည့်ပြီး ကူးယူနိုင်ပါတယ်။ Running HUB အော်ဒါမှတ်တမ်းမှာ နောက်မှ ပြန်ယူနိုင်ပါတယ်။')}</p><div className="rh-key-value"><code dir="ltr">{apiKey || '••••••••••••••••••••••••'}</code></div><div className="rh-key-actions"><button type="button" className="rh-secondary" disabled={busy} onClick={() => void revealKey()}>{apiKey ? <EyeOff size={17} /> : <Eye size={17} />}{busy ? t('Loading…', 'ဖော်ပြနေသည်…') : apiKey ? t('Hide key', 'Key ဖျောက်ရန်') : t('View API key', 'API Key ကြည့်ရန်')}</button>{apiKey && <button type="button" className="rh-primary" onClick={() => void copy('key')}><Copy size={17} />{t('Copy API key', 'API Key ကူးယူရန်')}</button>}</div>{copied === 'key' && <p role="status">{t('API key copied.', 'API Key ကူးယူပြီးပါပြီ။')}</p>}</div>}
    {/* Full document navigation keeps storefront scripts out of the private page. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    {stage === 'expired' && <div className="rh-notice"><h3>{t('This reservation has expired', 'သီးသန့်ထားပေးချိန် ကုန်သွားပါပြီ')}</h3><p>{t('Do not transfer money for this order. If you already paid, contact Digimium with this order reference and your receipt.', 'ဒီအော်ဒါအတွက် ငွေမလွှဲတော့ပါနှင့်။ ငွေလွှဲပြီးသားဖြစ်လျှင် အော်ဒါအမှတ်နှင့် screenshot ကိုယူပြီး Digimium ကို ဆက်သွယ်ပါ။')}</p><button type="button" className="rh-text-button" onClick={onRefresh} lang="en">Refresh availability</button><a href="/#contact">{t('Contact Digimium', 'Digimium ကို ဆက်သွယ်ရန်')}</a></div>}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full document boundary for storefront scripts. */}
    {order.status === 'rejected' && <div className="rh-notice"><h3>{t('Payment was not approved', 'ငွေပေးချေမှု အတည်မပြုထားပါ')}</h3><p>{t('Read the note below. If you paid, contact Digimium with this order reference before placing another order.', 'အောက်က မှတ်ချက်ကို ဖတ်ပါ။ ငွေလွှဲပြီးသားဖြစ်လျှင် နောက်အော်ဒါ မတင်မီ ဒီအော်ဒါအမှတ်ဖြင့် Digimium ကို ဆက်သွယ်ပါ။')}</p><a href="/#contact">{t('Contact Digimium', 'Digimium ကို ဆက်သွယ်ရန်')}</a></div>}
    {order.note && <div className="rh-note"><strong>{t('Note from Digimium', 'Digimium မှ မှတ်ချက်')}</strong><p dir="auto">{order.note}</p></div>}
    {order.proofUrl && <details className="rh-saved-proof"><summary>{t('View submitted screenshot', 'တင်ထားသော screenshot ကြည့်ရန်')}</summary>{proofFailed ? <p role="alert">{t('The image could not be loaded. Sign in again if your session expired.', 'ပုံ ဖော်ပြမရသေးပါ။ အကောင့်ဝင်ချိန် ကုန်သွားလျှင် ပြန်ဝင်ပါ။')}<button type="button" className="rh-text-button" onClick={() => { setProofFailed(false); setProofRetry(value => value + 1); }}>{t('Retry image', 'ပုံ ပြန်ဖွင့်ရန်')}</button></p> : <Image key={proofRetry} src={order.proofUrl} width={360} height={440} alt={t('Your submitted payment screenshot', 'သင်တင်ထားသော ငွေလွှဲ screenshot')} onError={() => setProofFailed(true)} unoptimized />}<a href={order.proofUrl} target="_blank" rel="noopener noreferrer">{t('Open full-size screenshot', 'Screenshot အပြည့် ကြည့်ရန်')}</a></details>}
    {error && <p className="rh-error" role="alert">{error}</p>}
  </section>;
}
