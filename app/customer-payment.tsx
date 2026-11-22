'use client';

import Image from 'next/image';
import { Check, ChevronDown, Copy, Eye, EyeOff, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CommerceOrder } from '@/lib/commerce-types';
import { PAYMENT_METHODS, type CustomerOrderInput, type PaymentMethodId, type WebsiteCheckout } from '@/lib/payment';
import { priceText, type ShopLanguage } from '@/lib/shop-language';
import './customer-payment.css';

const MAX_PROOF_SIZE = 5 * 1024 * 1024;

export function checkoutStageText(stage: WebsiteCheckout['stage'], lang: ShopLanguage) {
  const labels = {
    quote_required: ['Awaiting price confirmation', 'ဈေးနှုန်း အတည်ပြုရန်'],
    awaiting_payment: ['Awaiting payment', 'ငွေပေးချေရန်'],
    payment_review: ['Payment under review', 'ငွေပေးချေမှု စစ်ဆေးနေသည်'],
    payment_rejected: ['Payment needs correction', 'ငွေပေးချေမှု ပြန်စစ်ရန်'],
    processing: ['Preparing your service', 'ဝန်ဆောင်မှု ပြင်ဆင်နေသည်'],
    completed: ['Delivered', 'ဝန်ဆောင်မှု ပေးပြီး'],
  } as const;
  return labels[stage][lang === 'my' ? 1 : 0];
}

export function CustomerPayment({ order, methods, lang, onUpdated, showTotal = true }: {
  order: CommerceOrder;
  methods: PaymentMethodId[];
  lang: ShopLanguage;
  onUpdated: (order: CommerceOrder) => void;
  showTotal?: boolean;
}) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [methodUncertain, setMethodUncertain] = useState(false);
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useRef<{ requestId: string; revision: number; file: File } | null>(null);
  const methodAttempt = useRef<{ revision: number; methodId: PaymentMethodId } | null>(null);
  const checkout = order.checkout;
  const payment = checkout?.payment;
  const canPay = order.status === 'pending' && (checkout?.stage === 'awaiting_payment' || checkout?.stage === 'payment_rejected');
  const currentStep = checkout?.stage === 'completed' ? 3 : checkout?.stage === 'processing' ? 2 : 1;
  const availableMethods = PAYMENT_METHODS.filter(method => methods.includes(method.id));

  useEffect(() => {
    const attempt = upload.current;
    if (!attempt || order.revision <= attempt.revision) return;
    const frame = requestAnimationFrame(() => {
      // Any newer server revision makes an unacknowledged old-revision upload
      // either an existing receipt or a conflict. A new submission needs a new ID.
      setUncertain(false); setFile(null); setPreview(''); upload.current = null;
      if (fileInput.current) fileInput.current.value = '';
    });
    return () => cancelAnimationFrame(frame);
  }, [order.revision]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setPreview(url));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    if (!uncertain && !busy) return;
    function confirmLeave(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [uncertain, busy]);

  async function readStatus() {
    const response = await fetch(`/api/customer/orders/${order.id}?view=status`, { cache: 'no-store' });
    if (!response.ok) throw new Error(t('Couldn’t refresh this order. Sign in again if your session expired.', 'အော်ဒါ ပြန်ကြည့်မရသေးပါ။ အကောင့်ဝင်ချိန် ကုန်လျှင် ပြန်ဝင်ပါ။'));
    const result = await response.json() as { order: CommerceOrder };
    if (!methodAttempt.current || result.order.revision > methodAttempt.current.revision) {
      setMethodUncertain(false); methodAttempt.current = null;
    }
    onUpdated(result.order);
    return result.order;
  }

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    try {
      if (methodAttempt.current) await saveSelectedMethod();
      else await readStatus();
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('Couldn’t refresh. Try again.', 'ပြန်ကြည့်မရသေးပါ။ ထပ်စမ်းပါ။')); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function saveSelectedMethod() {
    if (!methodAttempt.current) return;
    const response = await fetch(`/api/customer/orders/${order.id}/payment`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify(methodAttempt.current),
    });
    const result = await response.json() as { order?: CommerceOrder; error?: string };
    if (response.ok && result.order) {
      methodAttempt.current = null; setMethodUncertain(false); onUpdated(result.order);
      return;
    }
    if (response.status === 409) {
      await readStatus();
      if (!methodAttempt.current) return;
    } else if (response.status < 500) {
      methodAttempt.current = null; setMethodUncertain(false);
    }
    throw new Error(result.error || t('Couldn’t confirm this payment method. Refresh and try again.', 'ငွေပေးချေနည်း အတည်မပြုနိုင်သေးပါ။ ပြန်ကြည့်ပြီး ထပ်စမ်းပါ။'));
  }

  async function selectMethod(methodId: PaymentMethodId) {
    if (inFlight.current || uncertain || methodUncertain || !canPay) return;
    inFlight.current = true;
    setBusy(true); setError(''); setCopied(false); setMethodUncertain(true);
    setFile(null); setPreview(''); upload.current = null;
    if (fileInput.current) fileInput.current.value = '';
    methodAttempt.current = { revision: order.revision, methodId };
    try {
      await saveSelectedMethod();
    } catch (caught) {
      setError(caught instanceof Error && !(caught instanceof TypeError) ? caught.message : t('Couldn’t confirm the payment method. Refresh before paying.', 'ငွေပေးချေနည်း အတည်မပြုနိုင်သေးပါ။ ငွေမချေမီ ပြန်ကြည့်ပါ။'));
    } finally { inFlight.current = false; setBusy(false); }
  }

  function chooseFile(next: File | null) {
    setError('');
    if (!next) { setFile(null); setPreview(''); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type) || next.size > MAX_PROOF_SIZE || !next.size) {
      setError(t('Choose a PNG, JPG or WebP image up to 5 MB.', '5 MB အထိ PNG၊ JPG သို့မဟုတ် WebP ပုံ ရွေးပါ။'));
      if (fileInput.current) fileInput.current.value = '';
      setFile(null); setPreview('');
      return;
    }
    upload.current = null;
    setPreview(''); setFile(next);
  }

  async function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || methodUncertain || !canPay || !file || !payment) return;
    inFlight.current = true;
    setBusy(true); setError('');
    upload.current ??= { requestId: crypto.randomUUID(), revision: order.revision, file };
    const attempt = upload.current;
    let sent = false;
    try {
      sent = true;
      const response = await fetch(`/api/customer/orders/${order.id}/proof?revision=${attempt.revision}&requestId=${attempt.requestId}`, {
        method: 'POST', headers: { 'Content-Type': attempt.file.type }, cache: 'no-store', body: attempt.file,
      });
      const result = await response.json() as { order?: CommerceOrder; error?: string };
      if (response.ok && result.order) {
        onUpdated(result.order);
        setFile(null); setPreview(''); setUncertain(false); upload.current = null;
        if (fileInput.current) fileInput.current.value = '';
        return;
      }
      if (response.status < 500) {
        sent = false; setUncertain(false); upload.current = null;
      }
      if (response.status === 409) await readStatus();
      throw new Error(result.error || t('Couldn’t submit your payment screenshot. Please try again.', 'ငွေလွှဲ screenshot တင်မရသေးပါ။ ပြန်ကြိုးစားပါ။'));
    } catch (caught) {
      if (sent && upload.current?.requestId !== attempt.requestId) return;
      if (sent) setUncertain(true);
      setError(caught instanceof Error && !(caught instanceof TypeError) ? caught.message : t('The upload result is uncertain. Retry the same screenshot.', 'ပုံတင်ပြီးကြောင်း အတည်မပြုနိုင်သေးပါ။ ဒီ screenshot ကိုပဲ ပြန်တင်ပါ။'));
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function copyRecipient() {
    if (!payment || methodUncertain) return;
    try { await navigator.clipboard.writeText(payment.method.accountNumber); setCopied(true); }
    catch { setError(t('Select and copy the payment account shown below.', 'အောက်မှာပြထားတဲ့ ငွေလက်ခံအကောင့်ကို ရွေးပြီး ကူးယူပါ။')); }
  }

  if (!checkout) return null;
  const methodName = PAYMENT_METHODS.find(method => method.id === payment?.method.id)?.name;
  return <section className="customer-payment" aria-label={t('Order progress and payment', 'အော်ဒါအဆင့်နှင့် ငွေပေးချေမှု')}>
    <div className="customer-payment-heading"><h4>{order.status === 'rejected' ? t('Order rejected', 'အော်ဒါ ငြင်းပယ်ထားသည်') : checkoutStageText(checkout.stage, lang)}</h4>
      <button type="button" className="payment-text-button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} />{t('Refresh', 'ပြန်ကြည့်ရန်')}</button>
    </div>
    {order.status !== 'rejected' && <ol className="payment-progress" aria-label={t('Order steps', 'အော်ဒါ အဆင့်များ')}>
      {[t('Order saved', 'အော်ဒါသိမ်းပြီး'), t('Payment', 'ငွေပေးချေမှု'), t('Preparing', 'ပြင်ဆင်နေသည်'), t('Delivered', 'ပေးပြီး')].map((label, index) =>
        <li key={index} data-complete={index < currentStep || checkout.stage === 'completed' || undefined} aria-current={index === currentStep ? 'step' : undefined}><span aria-hidden="true">{index < currentStep || checkout.stage === 'completed' ? <Check size={13} /> : index + 1}</span>{label}</li>)}
    </ol>}
    {showTotal && order.totalMmk !== null && <div className="payment-order-total"><span>{t('Order total', 'စုစုပေါင်း')}</span><strong>{priceText(`${order.totalMmk.toLocaleString('en-US')} MMK`, lang)}</strong></div>}
    {checkout.stage === 'quote_required' && order.status === 'pending' && <p className="payment-guidance">{t('Digimium will confirm the total here. You can pay after the price is ready.', 'Digimium က စုစုပေါင်းဈေးနှုန်းကို ဒီမှာ အတည်ပြုပေးပါမယ်။ ဈေးနှုန်းရပြီးမှ ငွေချေနိုင်ပါတယ်။')}</p>}
    {order.status !== 'rejected' && checkout.stage === 'payment_review' && <p className="payment-guidance">{t('Your screenshot is submitted. Digimium is checking the payment.', 'Screenshot တင်ပြီးပါပြီ။ Digimium က ငွေပေးချေမှုကို စစ်ဆေးနေပါတယ်။')}</p>}
    {order.status !== 'rejected' && checkout.stage === 'processing' && <p className="payment-guidance">{t('Digimium is preparing your service. Delivered account details will appear in your order history.', 'Digimium က ဝန်ဆောင်မှု ပြင်ဆင်ပေးနေပါတယ်။ ပေးအပ်ပြီးသော အကောင့်အချက်အလက်ကို အော်ဒါမှတ်တမ်းမှာ ကြည့်နိုင်ပါမယ်။')}</p>}
    {order.status !== 'rejected' && checkout.stage === 'completed' && <p className="payment-guidance">{t('Your service is ready. Open the purchased account details in order history.', 'ဝန်ဆောင်မှု ရပါပြီ။ အော်ဒါမှတ်တမ်းထဲက ဝယ်ယူထားသော အကောင့်အချက်အလက်ကို ဖွင့်ကြည့်ပါ။')}</p>}
    {canPay && checkout.stage === 'payment_rejected' && <p className="payment-guidance">{t('Review the payment note and upload a corrected receipt for Digimium to check.', 'ငွေပေးချေမှု စစ်ဆေးချက်ကို ဖတ်ပြီး မှန်ကန်သော ငွေလွှဲ screenshot ပြန်တင်ပါ။')}</p>}
    {payment?.note && <div className="payment-review-note"><strong>{t('Payment review note', 'ငွေပေးချေမှု စစ်ဆေးချက်')}</strong><p dir="auto">{payment.note}</p></div>}
    {methodUncertain && <p className="payment-guidance" role="status">{t('Confirm the selected payment method with Refresh before making a payment.', 'ငွေမချေမီ “ပြန်ကြည့်ရန်” ကို နှိပ်ပြီး ရွေးထားသော ငွေချေနည်း အတည်ပြုပါ။')}</p>}
    {canPay && <fieldset className="payment-method-choice" disabled={busy || uncertain || methodUncertain}>
      <legend>{t('Choose how to pay', 'ငွေချေနည်း ရွေးပါ')}</legend>
      <div>{availableMethods.map(method => {
        return <button type="button" key={method.id} aria-pressed={payment?.method.id === method.id} onClick={() => void selectMethod(method.id)}>
          <Image src={`/assets/payments/${method.file}`} width={26} height={26} alt="" unoptimized /><span>{method.name}</span>{payment?.method.id === method.id && <Check size={15} />}
        </button>;
      })}</div>
      {!availableMethods.length && !payment && <p className="payment-guidance">{t('Payment instructions are being prepared. Check back here or contact Digimium for help.', 'ငွေပေးချေရန် အချက်အလက် ပြင်ဆင်နေပါတယ်။ ဒီမှာ ပြန်ကြည့်ပါ သို့မဟုတ် Digimium ကို ဆက်သွယ်ပါ။')}</p>}
    </fieldset>}
    {payment && !methodUncertain && <div className="payment-destination">
      <div className="payment-destination-heading"><strong>{methodName}</strong><strong>{payment.amount} {payment.currency}</strong></div>
      {canPay && <>
      {checkout.stage !== 'payment_rejected' && <p className="payment-guidance">{t(`Open ${methodName}, transfer ${payment.amount} ${payment.currency} using this account or QR, then upload the payment screenshot below.`, `${methodName} ကိုဖွင့်ပြီး ဒီအကောင့် သို့မဟုတ် QR မှတစ်ဆင့် ${payment.amount} ${payment.currency} လွှဲပါ။ ပြီးရင် အောက်မှာ ငွေလွှဲ screenshot တင်ပါ။`)}</p>}
      <dl><div><dt>{t('Account name', 'အကောင့်အမည်')}</dt><dd dir="auto">{payment.method.accountName}</dd></div><div><dt>{payment.method.id === 'binance' ? 'Binance Pay ID / UID' : t('Account number', 'အကောင့်နံပါတ်')}</dt><dd><bdi>{payment.method.accountNumber}</bdi><button type="button" className="payment-text-button" onClick={() => void copyRecipient()} aria-label={t('Copy payment account', 'ငွေလက်ခံအကောင့် ကူးယူရန်')}><Copy size={15} /></button></dd></div></dl>
      {copied && <p className="payment-guidance" role="status">{t('Payment account copied.', 'ငွေလက်ခံအကောင့် ကူးယူပြီးပါပြီ။')}</p>}
      {payment.method.id === 'binance' && payment.method.mmkPerUsdt && <p className="payment-guidance">1 USDT = {payment.method.mmkPerUsdt.toLocaleString('en-US')} MMK</p>}
      {canPay && payment.method.qrPath && <Image className="payment-qr" src={payment.method.qrPath} alt={t(`${methodName} payment QR`, `${methodName} ငွေပေးချေရန် QR`)} width={220} height={220} unoptimized />}
      {payment.method.instructions && <p className="payment-instructions" dir="auto">{payment.method.instructions}</p>}
      </>}
    </div>}
    {canPay && payment && !methodUncertain && <form className="payment-proof-form" onSubmit={submitProof}>
      <label>{t('Payment screenshot', 'ငွေလွှဲ screenshot')}<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || uncertain} onChange={event => chooseFile(event.target.files?.[0] || null)} /></label>
      <small>{t('PNG, JPG or WebP, up to 5 MB.', '5 MB အထိ PNG၊ JPG သို့မဟုတ် WebP။')}</small>
      {preview && <Image className="payment-proof-preview" src={preview} alt={t('Selected payment screenshot', 'ရွေးထားသော ငွေလွှဲ screenshot')} width={300} height={220} unoptimized />}
      {uncertain && <p className="payment-guidance" role="status">{t('Retrying sends the same screenshot once.', 'ပြန်တင်လျှင် မူလ screenshot ကိုပဲ ပြန်စစ်ပေးပါမယ်။')}</p>}
      <button className="customer-primary" type="submit" disabled={busy || !file}><Upload size={16} />{busy ? t('Submitting…', 'တင်နေသည်…') : uncertain ? t('Retry screenshot', 'Screenshot ပြန်တင်ရန်') : t('Submit for payment review', 'ငွေပေးချေမှု စစ်ဆေးရန် တင်မယ်')}</button>
    </form>}
    {payment?.proofUrl && <details className="payment-saved-proof"><summary>{t('View submitted screenshot', 'တင်ထားသော screenshot ကြည့်ရန်')}<ChevronDown size={16} /></summary><Image src={payment.proofUrl} alt={t('Your submitted payment screenshot', 'သင်တင်ထားသော ငွေလွှဲ screenshot')} width={360} height={400} unoptimized /></details>}
    {error && <p className="payment-error" role="alert">{error}</p>}
  </section>;
}

export function SubmittedOrderDetails({ order, lang }: { order: CommerceOrder; lang: ShopLanguage }) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [inputs, setInputs] = useState<CustomerOrderInput[] | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function load() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError('');
    try {
      const response = await fetch(`/api/customer/orders/${order.id}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('load');
      const result = await response.json() as { customerInputs: CustomerOrderInput[] };
      if (!controller.signal.aborted) setInputs(result.customerInputs);
    } catch {
      if (!controller.signal.aborted) setError(t('Couldn’t load your submitted details. Try again.', 'ပို့ထားသော အချက်အလက် ကြည့်မရသေးပါ။ ပြန်စမ်းပါ။'));
    }
  }

  if (!order.checkout) return null;
  return <details className="customer-submitted-details" onToggle={event => {
    if (event.currentTarget.open) void load();
    else { active.current?.abort(); setInputs(null); setVisible({}); setError(''); }
  }}>
    <summary>{t('Your submitted details', 'သင်ပို့ထားသော အချက်အလက်များ')}<ChevronDown size={16} /></summary>
    {!inputs && !error && <p role="status">{t('Loading…', 'ဖော်ပြနေသည်…')}</p>}
    {error && <p className="payment-error" role="alert">{error}<button type="button" className="payment-text-button" onClick={() => void load()}>{t('Retry', 'ပြန်စမ်းရန်')}</button></p>}
    {inputs?.length === 0 && <p>{t('This order required no additional account details.', 'ဒီအော်ဒါအတွက် ထပ်ဖြည့်ရန် အကောင့်အချက်အလက် မလိုပါ။')}</p>}
    {inputs?.map(input => {
      const line = order.lines.find(item => item.id === input.lineId);
      return <div key={`${input.lineId}-${input.unit}`} className="customer-submitted-unit"><h5>{line?.productName}{line && line.quantity > 1 ? ` · ${t('Account', 'အကောင့်')} ${input.unit + 1}` : ''}</h5>
        <dl>{input.fields.map(field => {
          const key = `${input.lineId}-${input.unit}-${field.id}`;
          return <div key={field.id}><dt>{lang === 'my' && field.labelMy ? field.labelMy : field.label}</dt><dd><span dir="auto">{field.type === 'password' && !visible[key] ? '••••••••' : field.value || '—'}</span>{field.type === 'password' && field.value && <button type="button" className="payment-text-button" aria-pressed={!!visible[key]} aria-label={t('Show or hide submitted password', 'ပို့ထားသော စကားဝှက် ပြရန် / ဖျောက်ရန်')} onClick={() => setVisible(current => ({ ...current, [key]: !current[key] }))}>{visible[key] ? <EyeOff size={17} /> : <Eye size={17} />}</button>}</dd></div>;
        })}</dl>
      </div>;
    })}
  </details>;
}
