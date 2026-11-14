'use client';

import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, CheckCircle2, Copy, Minus, Plus, RefreshCw, ShoppingBag, Trash2, X } from 'lucide-react';
import type { Product } from '../lib/catalog';
import { CART_KEY, orderMessages, resolveOrder, restoreCart, sameItem, telegramDraft, totalMmk, withSelection, type CartItem, type OrderLine } from '../lib/cart-order';
import { orderTelegramMessages } from '../lib/order-telegram';
import type { TelegramCheckout, TelegramOrder } from '../lib/commerce-types';
import { ORDER_RECEIPT_KEY, createOrderReceipt, parseOrderReceipt, receiptCanResume, type OrderReceipt } from '../lib/order-receipt';
import { commerceEnabled } from '../lib/commerce-enabled';
import { effectivePrice } from '../lib/pricing';
import { productLogoSrc } from '../lib/product-logo';
import { durationDetail, durationText, planName, priceOnEnquiry, priceText, productDescription } from '../lib/shop-language';
import { OfferPrice } from './offer-price';
import { BestSellerBadge } from './best-seller-badge';
import { PaymentMethods } from './payment-methods';
import './shop-order.css';

const CheckoutAuth = lazy(() => import('./account/account').then(module => ({default: module.CheckoutAuth})));

type Locale = 'en' | 'my';
export type ShopOrderHandle = { openProduct(product: Product, planId?: string): void; openCart(): void };
type Props = { products: Product[]; lang: Locale; telegram: string; hideShortDescriptions?: boolean; onCountChange: (count: number) => void; onOpenChange?: (open: boolean) => void };
type Screen = 'product' | 'cart' | 'auth' | 'guest' | 'handoff' | null;
type CheckoutSession = { status: 'checking' | 'signed-in' | 'signed-out' | 'failed'; customerId: string | null };

function orderDescription({product, plan}: OrderLine, lang: Locale) {
  const name = plan ? planName(plan, lang) : lang === 'my' ? 'အစီအစဉ် စုံစမ်းရန်' : 'Plan enquiry';
  const duration = durationDetail((plan ?? product).duration, name, lang);
  return [name, duration].filter(Boolean).join(' · ');
}

function Logo({product}: {product: Product}) {
  const src = productLogoSrc(product);
  const [failed, setFailed] = useState('');
  return <span className="order-logo" aria-hidden="true">{src && failed !== src
    ? <img src={src} alt="" onError={() => setFailed(src)} /> : product.name.slice(0, 1)}</span>;
}

function CheckoutNote({askAboutPrice, lang, compact = false}: {askAboutPrice: boolean; lang: Locale; compact?: boolean}) {
  if (commerceEnabled && compact) return askAboutPrice ? <p className="order-checkout-note">{lang === 'my'
    ? 'ဈေးနှုန်း မဖော်ပြထားသော အစီအစဉ်အတွက် Admin က ဈေးနှုန်း အတည်ပြုပေးပါမယ်။'
    : 'Digimium will confirm the price of any plan marked “Price on enquiry”.'}</p> : null;
  if (commerceEnabled) return <p className="order-checkout-note">{lang === 'my'
    ? 'ငွေပေးချေမှုနဲ့ service အကောင့်ရယူမှုကို Telegram မှာ ဆက်လုပ်ပါ။'
    : 'Arrange payment and service delivery in Telegram.'}
    {askAboutPrice && <><br/>{lang === 'my' ? 'ဈေးနှုန်း မဖော်ပြထားသော အစီအစဉ်အတွက် Admin က ဈေးနှုန်း အတည်ပြုပေးပါမယ်။' : 'Digimium will confirm the price of any plan marked “Price on enquiry”.'}</>}
  </p>;
  return <p lang="my" className="order-checkout-note">
    ဝယ်ယူရန် (သို့မဟုတ်) Plan အကြောင်း အသေးစိတ်မေးမြန်ရန် ဝယ်ယူမည် ကို နှိပ်ပြီး Telegram မှာမေးမြန်နိုင်ပါသည်။
    {askAboutPrice && <><br/>ဈေးနှုန်းအသေးစိတ်ကိုလည်း Admin မှ ချက်ချင်းပြန်လည် ဖြေကြားပေးပါမည်။</>}
  </p>;
}

export const ShopOrder = forwardRef<ShopOrderHandle, Props>(function ShopOrder({products, lang, telegram, hideShortDescriptions, onCountChange, onOpenChange}, ref) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const fullOrder = useRef<HTMLTextAreaElement>(null);
  const receiptDetails = useRef<HTMLDetailsElement>(null);
  const [screen, setScreen] = useState<Screen>(null);
  const [productId, setProductId] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [lastAdded, setLastAdded] = useState('');
  const [handoff, setHandoff] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [orderId, setOrderId] = useState('');
  const [handoffContact, setHandoffContact] = useState(telegram);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [guestOrder, setGuestOrder] = useState(false);
  const [handoffOwner, setHandoffOwner] = useState<string | null>(null);
  const [handoffOrder, setHandoffOrder] = useState<TelegramOrder | null>(null);
  const [sessionState, setSessionState] = useState<CheckoutSession>({status: 'checking', customerId: null});
  const [savedReceipt, setSavedReceipt] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [accountNotice, setAccountNotice] = useState(false);
  const authInFlight = useRef(false);
  const screenTitle = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const attempt = useRef<{basket: string; requestId: string} | null>(null);
  const copyAttempt = useRef(0);
  const cartRef = useRef<CartItem[]>([]);
  const sessionRequest = useRef(0);
  const sessionAbort = useRef<AbortController | null>(null);
  const receiptRead = useRef(0);
  const live = useRef(true);
  const product = products.find(item => item.id === productId);
  const plans = product?.plans?.filter(plan => plan.published) ?? [];
  const selectedPlan = plans.find(plan => plan.id === planId);
  const open = screen !== null;
  const rows = useMemo(() => resolveOrder(cart, products), [cart, products]);
  const count = rows.reduce((total, item) => total + item.quantity, 0);
  const selected: CartItem | undefined = product && product.published && product.availability !== 'unavailable' &&
    (!plans.length || plans.some(plan => plan.id === planId)) ? {productId: product.id, planId, quantity: 1} : undefined;
  const effectiveCart = screen === 'product' && selected ? withSelection(cart, selected, false) : cart;
  const checkoutRows = resolveOrder(effectiveCart, products);
  const sum = totalMmk(checkoutRows);
  const formattedTotal = sum === undefined ? '' : priceText(`${sum.toLocaleString('en-US')} MMK`, lang);
  const partLabel = (index: number, length: number) => t(`Part ${index} of ${length}`, `အပိုင်း ${index} / ${length}`);
  const orderText = orderMessages(
    t('Hi Digimium, I’d like to order:', 'မင်္ဂလာပါ Digimium၊ အောက်ပါ ဝန်ဆောင်မှုများကို မှာယူချင်ပါတယ်။'),
    checkoutRows.map(row => {
      const unit = priceText(effectivePrice(row.plan ?? row.product), lang);
      return `${row.quantity} × ${row.product.name} — ${orderDescription(row, lang)} · ${unit}`;
    }),
    formattedTotal ? t(`Total: ${formattedTotal}`, `စုစုပေါင်း — ${formattedTotal}`) :
      t('Please confirm the total price and availability.', 'စုစုပေါင်းစျေးနှုန်းနှင့် ရရှိနိုင်မှုကို အတည်ပြုပေးပါ။'),
    partLabel,
  );
  const checkoutUrl = telegramDraft(telegram, orderText[0]);
  const cartTotal = totalMmk(rows);

  const checkSession = useCallback(async (): Promise<CheckoutSession> => {
    const sequence = ++sessionRequest.current;
    sessionAbort.current?.abort();
    const controller = new AbortController();
    sessionAbort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setSessionState({status: 'checking', customerId: null});
    let result: CheckoutSession;
    try {
      const response = await fetch('/api/customer/session', {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error('session');
      const data = await response.json() as {customer?: {id?: unknown} | null};
      if (data.customer !== null && (!data.customer || typeof data.customer.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.customer.id))) throw new Error('session');
      result = data.customer ? {status: 'signed-in', customerId: data.customer.id as string} : {status: 'signed-out', customerId: null};
    } catch { result = {status: 'failed', customerId: null}; }
    finally { window.clearTimeout(timeout); }
    if (live.current && sequence === sessionRequest.current) setSessionState(result);
    return result;
  }, []);

  const forgetReceipt = useCallback(() => {
    try { sessionStorage.removeItem(ORDER_RECEIPT_KEY); } catch { /* Storage is optional. */ }
    setSavedReceipt(false);
  }, []);
  const clearHandoff = useCallback(() => {
    setHandoff([]); setOrderId(''); setHandoffOwner(null); setHandoffOrder(null); setGuestOrder(false);
  }, []);
  const showReceipt = useCallback((receipt: OrderReceipt) => {
    setHandoff(receipt.messages); setHandoffContact(receipt.telegram); setOrderId(receipt.order.id);
    setGuestOrder(receipt.customerId === null); setHandoffOwner(receipt.customerId); setHandoffOrder(receipt.order);
    setCopyStatus('idle'); setOrderError(''); setScreen('handoff');
  }, []);
  const resumeReceipt = useCallback(async () => {
    const sequence = ++receiptRead.current;
    let receipt: OrderReceipt | null = null;
    try { receipt = parseOrderReceipt(sessionStorage.getItem(ORDER_RECEIPT_KEY)); } catch { /* Storage is optional. */ }
    if (!receipt || !receiptCanResume(receipt, receipt.customerId, telegram)) { forgetReceipt(); return; }
    if (receipt.customerId === null) { showReceipt(receipt); return; }
    clearHandoff(); setHandoffOwner(receipt.customerId); setScreen('handoff');
    const identity = await checkSession();
    if (!live.current || sequence !== receiptRead.current) return;
    if (identity.status === 'failed') return;
    if (!receiptCanResume(receipt, identity.customerId, telegram)) {
      forgetReceipt(); clearHandoff(); setScreen('cart');
      setOrderError(lang === 'my' ? 'သိမ်းထားတဲ့ အော်ဒါကို ကြည့်ရန် မူလအကောင့်ဖြင့် ဝင်ပါ။' : 'Sign in with the original account to view its saved order.');
      return;
    }
    showReceipt(receipt);
  }, [checkSession, clearHandoff, forgetReceipt, lang, showReceipt, telegram]);
  const initialized = useRef(false);
  const initialIntent = useRef<{account: boolean; checkout: boolean; anchor: boolean} | null>(null);

  useEffect(() => {
    // Capture both intents before sibling components consume their query parameters.
    if (!initialIntent.current) {
      const url = new URL(window.location.href);
      initialIntent.current = {account: url.searchParams.get('account') === '1', checkout: url.searchParams.get('checkout') === '1', anchor: url.hash.length > 1};
    }
    const intent = initialIntent.current;
    function read() {
      let next: CartItem[] = cartRef.current;
      try { next = restoreCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'), products); setCart(next); cartRef.current = next; }
      catch { /* A private browser can still use the in-memory cart. */ }
      setReady(true);
      return next;
    }
    const frame = window.requestAnimationFrame(() => {
      const initialCart = read();
      if (initialized.current) return;
      initialized.current = true;
      const url = new URL(window.location.href);
      let receipt: OrderReceipt | null = null;
      try {
        const stored = sessionStorage.getItem(ORDER_RECEIPT_KEY);
        receipt = parseOrderReceipt(stored);
        if (stored && !receipt) sessionStorage.removeItem(ORDER_RECEIPT_KEY);
      } catch { /* Storage is optional. */ }
      setSavedReceipt(Boolean(receipt));
      if (commerceEnabled && intent.checkout) {
        setScreen('cart');
        url.searchParams.delete('checkout');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } else if (commerceEnabled && !intent.account && !intent.anchor && receipt && initialCart.length === 0) void resumeReceipt();
    });
    const synchronize = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) read(); };
    const resume = (event: PageTransitionEvent) => { if (event.persisted) read(); };
    window.addEventListener('storage', synchronize);
    window.addEventListener('pageshow', resume);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('storage', synchronize);
      window.removeEventListener('pageshow', resume);
    };
  }, [products, resumeReceipt]);
  useEffect(() => { onCountChange(count); }, [count, onCountChange]);
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => () => { onOpenChange?.(false); }, [onOpenChange]);
  useEffect(() => {
    live.current = true;
    const pendingReads = receiptRead;
    return () => { live.current = false; sessionAbort.current?.abort(); ++pendingReads.current; };
  }, []);
  useEffect(() => {
    if (!commerceEnabled) return;
    let active = true;
    const generation = receiptRead.current;
    if (screen === 'cart' && !inFlight.current) void checkSession();
    async function returned() {
      if (document.hidden || inFlight.current || authInFlight.current) return;
      if (screen === 'cart') { void checkSession(); return; }
      if (screen === 'handoff' && handoffOwner && !guestOrder) {
        const identity = await checkSession();
        if (!active || !live.current || generation !== receiptRead.current) return;
        if (identity.status !== 'failed' && identity.customerId !== handoffOwner) {
          clearHandoff(); forgetReceipt(); setScreen('cart');
          setOrderError(lang === 'my' ? 'သိမ်းထားတဲ့ အော်ဒါကို ကြည့်ရန် မူလအကောင့်ဖြင့် ဝင်ပါ။' : 'Sign in with the original account to view its saved order.');
        }
      }
    }
    document.addEventListener('visibilitychange', returned);
    window.addEventListener('focus', returned);
    return () => { active = false; document.removeEventListener('visibilitychange', returned); window.removeEventListener('focus', returned); };
  }, [screen, handoffOwner, guestOrder, checkSession, clearHandoff, forgetReceipt, lang]);
  useEffect(() => {
    if (screen && screen !== 'product') screenTitle.current?.focus({preventScroll: true});
  }, [screen]);
  useEffect(() => {
    if (!lastAdded) return;
    const timeout = window.setTimeout(() => setLastAdded(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [lastAdded]);
  useEffect(() => {
    const modal = dialog.current;
    if (!open || !modal) return;
    modal.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      modal.close();
      document.body.style.overflow = previous;
      const target = returnFocus.current;
      window.requestAnimationFrame(() => { if (!modal.open && target?.isConnected) target.focus({preventScroll: true}); });
    };
  }, [open]);

  function begin(next: Exclude<Screen, null>) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (inFlight.current || authInFlight.current) return;
    ++receiptRead.current;
    setOrderError('');
    setLastAdded('');
    ++copyAttempt.current;
    setCopyStatus('idle');
    if (next === 'cart' && commerceEnabled) setSessionState({status: 'checking', customerId: null});
    setScreen(next);
  }
  function closeOrder() {
    if (inFlight.current || authInFlight.current) return;
    ++receiptRead.current; ++copyAttempt.current;
    sessionAbort.current?.abort();
    setScreen(null);
  }
  useImperativeHandle(ref, () => ({
    openProduct(item, requestedPlanId) {
      const published = item.plans?.filter(plan => plan.published) ?? [];
      setProductId(item.id);
      setPlanId(published.find(plan => plan.id === requestedPlanId)?.id ?? published[0]?.id ?? null);
      begin('product');
    },
    openCart() { begin('cart'); },
  }));

  function saveCart(next: CartItem[]) {
    cartRef.current = next;
    setCart(next);
    try { localStorage.setItem(CART_KEY, JSON.stringify(next)); }
    catch { /* The in-memory cart still works when storage is unavailable. */ }
  }
  function clearSubmittedCart(submitted: CartItem[]) {
    const fingerprint = JSON.stringify(submitted);
    if (JSON.stringify(cartRef.current) !== fingerprint) return;
    try {
      const latest = restoreCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'), products);
      if (JSON.stringify(latest) !== fingerprint) { cartRef.current = latest; setCart(latest); return; }
    } catch { /* Compare the in-memory cart when storage is unavailable. */ }
    saveCart([]);
  }

  function add() {
    if (!selected || !product) return;
    saveCart(withSelection(cart, selected, true));
    closeOrder();
    setLastAdded(product.name);
  }
  async function copy(text: string) {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(text);
      if (attempt === copyAttempt.current) setCopyStatus('copied');
    } catch {
      if (attempt === copyAttempt.current) {
        setCopyStatus('manual');
        if (receiptDetails.current) receiptDetails.current.open = true;
        window.requestAnimationFrame(() => { fullOrder.current?.focus(); fullOrder.current?.select(); });
      }
    }
  }
  function checkout() {
    if (!checkoutRows.length) return;
    setOrderId('');
    setHandoffContact(telegram);
    setHandoff(orderText);
    saveCart([]);
    setCopyStatus('idle');
    void copy(orderText.join('\n\n'));
    setScreen('handoff');
  }
  async function placeOrder(asGuest = false) {
    if (inFlight.current || !checkoutRows.length) return;
    ++receiptRead.current;
    const submittedCart = cartRef.current.map(item => ({...item}));
    const items = checkoutRows.map(({productId, planId, quantity}) => ({productId, planId, quantity}));
    const basket = JSON.stringify({items, mode: asGuest ? 'guest' : 'account'});
    const key = 'digimium-checkout-attempt';
    inFlight.current = true;
    setSubmitting(true);
    setOrderError('');
    try {
      if (!asGuest) {
        const identity = await checkSession();
        if (identity.status === 'failed') throw new Error(t('We couldn’t check your account. Please try again.', 'အကောင့်ကို စစ်ဆေးမရသေးပါ။ ပြန်ကြိုးစားပါ။'));
        // Keep a guest's saved retry key intact when reopening checkout after a lost response.
        if (identity.status !== 'signed-in') { setScreen('auth'); return; }
      }
      if (asGuest) {
        const guestSession = await fetch('/api/customer/guest-session', {method: 'POST'});
        if (!guestSession.ok) throw new Error(t('We couldn’t prepare your order. Please try again.', 'အော်ဒါကို ပြင်ဆင်မရသေးပါ။ ပြန်ကြိုးစားပါ။'));
      }
      if (!attempt.current) {
        try { attempt.current = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { /* Storage is optional. */ }
      }
      if (attempt.current?.basket !== basket || !attempt.current?.requestId) {
        attempt.current = {basket, requestId: crypto.randomUUID()};
      }
      try { sessionStorage.setItem(key, JSON.stringify(attempt.current)); } catch { /* Retain the in-memory key for retries. */ }
      const response = await fetch('/api/customer/orders', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({items, requestId: attempt.current.requestId, ...(asGuest ? {checkoutMode: 'guest'} : {})}),
      });
      if (response.status === 401) {
        if (!asGuest) setSessionState({status: 'signed-out', customerId: null});
        setScreen(asGuest ? 'guest' : 'auth');
        if (asGuest) setOrderError(t('Please try again to continue without an account.', 'အကောင့်မရှိဘဲ ဆက်ဝယ်ရန် ပြန်ကြိုးစားပါ။'));
        return;
      }
      const data = await response.json() as TelegramCheckout & {error?: string};
      if (!response.ok || typeof data.id !== 'string' || !data.order || data.order.id !== data.id || !data.customer ||
        (data.customer.guest === true ? data.customerId !== null : typeof data.customerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.customerId))) throw new Error(data.error || '');
      const messages = orderTelegramMessages(data.order, data.customer, lang);
      const contact = telegramDraft(data.telegram, '') ? data.telegram : telegram;
      const url = telegramDraft(contact, messages[0]);
      const receipt = createOrderReceipt({customerId: data.customerId, telegram: contact, messages, order: data.order});
      if (receipt) {
        try { sessionStorage.setItem(ORDER_RECEIPT_KEY, JSON.stringify(receipt)); setSavedReceipt(true); } catch { /* The open receipt remains usable without storage. */ }
      } else forgetReceipt();
      // The POST has succeeded. Consume only that exact cart even if the following account check fails.
      clearSubmittedCart(submittedCart);
      attempt.current = null;
      try { sessionStorage.removeItem(key); } catch { /* No persisted attempt. */ }
      // The receipt belongs to the server's actual order owner, not a possibly stale preflight identity.
      if (data.customerId !== null) {
        clearHandoff(); setHandoffOwner(data.customerId); setScreen('handoff');
        const identity = await checkSession();
        if (identity.status === 'failed') return;
        if (identity.customerId !== data.customerId) {
          forgetReceipt(); clearHandoff(); setScreen('cart');
          setOrderError(t('Your account changed. Sign in with the original account to view the saved order.', 'အကောင့် ပြောင်းသွားပါတယ်။ သိမ်းထားတဲ့ အော်ဒါကို ကြည့်ရန် မူလအကောင့်ဖြင့် ဝင်ပါ။'));
          return;
        }
      }
      setHandoffContact(contact);
      setHandoff(messages);
      setCopyStatus('idle');
      setOrderId(data.id);
      setGuestOrder(Boolean(data.customer.guest));
      setHandoffOwner(data.customerId);
      setHandoffOrder(data.order);
      setScreen('handoff');
      // The same tab avoids popup blockers after the order has been saved.
      if (url) {
        try { window.location.assign(url); }
        catch { setOrderError(t('Your order is saved. Reopen Telegram below or copy your order message.', 'အော်ဒါကို သိမ်းထားပါတယ်။ အောက်ကနေ Telegram ပြန်ဖွင့်ပါ သို့မဟုတ် အော်ဒါစာ ကူးယူပါ။')); }
      } else setOrderError(t('Your order is saved. Copy your message and contact Digimium below.', 'အော်ဒါကို သိမ်းထားပါတယ်။ အော်ဒါစာ ကူးယူပြီး အောက်ကနေ Digimium ကို ဆက်သွယ်ပါ။'));
    } catch (error) {
      setOrderError(error instanceof Error && error.message && !(error instanceof TypeError) && !(error instanceof SyntaxError)
        ? error.message : t('We couldn’t confirm your order. Your cart is saved. Please try again.', 'အော်ဒါတင်ပြီးကြောင်း အတည်မပြုနိုင်သေးပါ။ သင့်ဈေးခြင်းကို သိမ်းထားပါတယ်။ ထပ်စမ်းကြည့်ပါ။'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }
  function changeQuantity(item: CartItem, difference: number) {
    saveCart(cart.map(entry => sameItem(item, entry) ?
      {...entry, quantity: Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, entry.quantity + difference))} : entry));
  }
  const checkoutAllowed = ready && Boolean(checkoutUrl) && checkoutRows.length > 0 && (screen !== 'product' || Boolean(selected));
  const checkoutControl = commerceEnabled
    ? <button type="button" className="order-action order-primary" disabled={!checkoutAllowed || submitting} onClick={() => {
        if (screen === 'product') { saveCart(effectiveCart); begin('cart'); }
        else void placeOrder();
      }}>{screen === 'product' ? t('Buy', 'ဝယ်ယူမည်') : submitting ? t('Preparing order…', 'အော်ဒါ ပြင်ဆင်နေသည်…') : t('Place order', 'Order တင်မည်')}<ArrowUpRight size={17}/></button>
    : checkoutAllowed
    ? <a className="order-action order-primary" href={checkoutUrl} target="_blank" rel="noopener noreferrer" onClick={checkout}>
        {t('Buy on Telegram', 'ဝယ်ယူမည်')}<ArrowUpRight size={17}/>
      </a>
    : <button type="button" className="order-action order-primary" disabled>{t('Buy on Telegram', 'ဝယ်ယူမည်')}</button>;
  const canShowHandoff = !commerceEnabled || guestOrder || (sessionState.status === 'signed-in' && sessionState.customerId === handoffOwner);
  return <>
    <div className="order-notifications" aria-live="polite">{lastAdded && <div className="order-toast">
      <Check size={17}/><span>{t(`${lastAdded} added to cart`, `${lastAdded} ကို ဈေးခြင်းထဲ ထည့်ပြီးပါပြီ`)}</span>
      <button type="button" onClick={() => begin('cart')}>{t('View cart', 'ဈေးခြင်း ကြည့်ရန်')}</button>
    </div>}</div>
    <dialog ref={dialog} className="shop-order" data-screen={screen || undefined} lang={lang} aria-labelledby="shop-order-title"
      aria-describedby={screen === 'product' && product?.bestSeller ? 'shop-product-badge' : undefined}
      onCancel={event => { event.preventDefault(); closeOrder(); }}
      onClick={event => { if (event.target === event.currentTarget) closeOrder(); }}>
      <div className="order-surface">
        <header className="order-heading">
          {screen === 'product' && hideShortDescriptions && product && <Logo product={product}/>}
          <div className="order-heading-title">
            <h2 ref={screenTitle} id="shop-order-title" tabIndex={-1}>{screen === 'product' ? product?.name : screen === 'handoff' ?
              t('Order placed', 'အော်ဒါတင်ပြီးပါပြီ') : screen === 'guest' ? t('Buy on Telegram', 'Telegram မှဝယ်ယူမည်') : screen === 'auth' ? t('Create account', 'အကောင့်ဖွင့်မည်') : t('Your order', 'သင့်အော်ဒါ')}</h2>
            {screen === 'product' && product?.bestSeller && <BestSellerBadge lang={lang} id="shop-product-badge" />}
          </div>
          <button type="button" disabled={submitting || authBusy} className="order-icon" aria-label={t('Close', 'ပိတ်ရန်')} onClick={closeOrder}><X size={20}/></button>
        </header>
        {screen === 'product' && product && <>
          <div className="order-scroll">
            <div className="order-content">
              {!hideShortDescriptions && <div className="order-intro"><Logo product={product}/><p>{productDescription(product, lang)}</p></div>}
              <fieldset className="order-options" disabled={product.availability === 'unavailable'}>
                <legend>{t('Choose a plan', 'အစီအစဉ် ရွေးပါ')}</legend>
                {plans.length ? plans.map(plan => {
                  const name = planName(plan, lang);
                  const duration = durationDetail(plan.duration, name, lang);
                  return <label className="order-option" data-best-seller={plan.bestSeller || undefined} key={plan.id}>
                    <input type="radio" name="shop-plan" checked={plan.id === planId} onChange={() => setPlanId(plan.id)}/>
                    <span className="order-option-name">{name}{plan.bestSeller && <BestSellerBadge lang={lang} />}{duration && <small>{duration}</small>}</span>
                    <OfferPrice offer={plan} lang={lang}/>
                  </label>;
                }) : <label className="order-option"><input type="radio" name="shop-plan" checked readOnly/>
                  <span className="order-option-name">{t('Ask about this service', 'ဝန်ဆောင်မှုအကြောင်း စုံစမ်းရန်')}{product.duration && <small>{durationText(product.duration, lang)}</small>}</span>
                  <OfferPrice offer={product} lang={lang}/></label>}
              </fieldset>
              {product.availability === 'unavailable' && <p className="order-help">{t('Currently unavailable.', 'လက်ရှိ မရရှိနိုင်သေးပါ။')}</p>}
            </div>
            <div className="order-guidance">
              <CheckoutNote lang={lang} askAboutPrice={priceOnEnquiry(effectivePrice(selectedPlan ?? product))}/>
            </div>
          </div>
          <footer className="order-footer">
            <div className="order-actions"><button type="button" disabled={!ready || !selected} className="order-action order-secondary" onClick={add}>
              <ShoppingBag size={16}/>{t('Add to cart', 'ဈေးခြင်းထဲ ထည့်မယ်')}</button>{checkoutControl}</div>
          </footer>
        </>}
        {screen === 'cart' && (rows.length ? <>
          <div className="order-scroll">
            <ul className="order-lines order-content">{rows.map(item => <li key={JSON.stringify([item.productId, item.planId])}>
              <Logo product={item.product}/>
              <div className="order-line-info"><h3>{item.product.name}</h3>
                <p>{orderDescription(item, lang)}</p>
                <OfferPrice offer={item.plan ?? item.product} lang={lang}/>
                <div className="order-quantity" role="group" aria-label={[item.product.name, item.plan && planName(item.plan, lang)].filter(Boolean).join(' · ')}>
                  <button type="button" className="order-icon" disabled={submitting || item.quantity <= 1} aria-label={t('Decrease quantity', 'အရေအတွက် လျှော့ရန်')} onClick={() => changeQuantity(item, -1)}><Minus size={14}/></button>
                  <span>{item.quantity}</span>
                  <button type="button" className="order-icon" disabled={submitting} aria-label={t('Increase quantity', 'အရေအတွက် တိုးရန်')} onClick={() => changeQuantity(item, 1)}><Plus size={14}/></button>
                </div>
              </div>
              <button type="button" className="order-icon" disabled={submitting} aria-label={t(`Remove ${item.product.name}`, `${item.product.name} ကို ဖယ်ရှားရန်`)}
                onClick={() => saveCart(cart.filter(entry => !sameItem(entry, item)))}><Trash2 size={16}/></button>
            </li>)}</ul>
            <div className="order-guidance"><div className="order-total"><span>{t('Order total', 'စုစုပေါင်း')}</span><strong>{cartTotal === undefined ?
              (commerceEnabled ? t('Awaiting price confirmation', 'ဈေးနှုန်း အတည်ပြုရန်') : t('Confirm on Telegram', 'Telegram တွင် စျေးနှုန်း အတည်ပြုပါ')) : priceText(`${cartTotal.toLocaleString('en-US')} MMK`, lang)}</strong></div>
              <PaymentMethods lang={lang} compact />
              <CheckoutNote compact lang={lang} askAboutPrice={rows.some(item => priceOnEnquiry(effectivePrice(item.plan ?? item.product)))}/>
            </div>
          </div>
          <footer className="order-footer">
            {orderError && <p className="order-checkout-note" role="alert">{orderError}</p>}
            {accountNotice && sessionState.status === 'signed-in' && <p className="order-account-notice" role="status">{t('You’re signed in. Review your order before continuing.', 'အကောင့်ဝင်ပြီးပါပြီ။ အော်ဒါကို ပြန်စစ်နိုင်ပါတယ်။')}</p>}
            {commerceEnabled ? sessionState.status === 'checking' ? <p className="order-session-status" role="status">{t('Checking your account…', 'အကောင့် စစ်ဆေးနေသည်…')}</p>
              : sessionState.status === 'failed' ? <div className="order-session-error"><p className="order-checkout-note" role="alert">{t('We couldn’t check your account. Please try again.', 'အကောင့်ကို စစ်ဆေးမရသေးပါ။ ပြန်ကြိုးစားပါ။')}</p><button type="button" className="order-action order-secondary" onClick={() => void checkSession()}><RefreshCw size={16}/>{t('Try again', 'ပြန်စမ်းမယ်')}</button></div>
              : sessionState.status === 'signed-in' ? <div className="order-actions order-place-action"><button type="button" className="order-action order-primary" disabled={!checkoutAllowed || submitting} onClick={() => void placeOrder()}>{submitting ? t('Preparing order…', 'အော်ဒါ ပြင်ဆင်နေသည်…') : t('Place order', 'Order တင်မည်')}<ArrowUpRight size={17}/></button></div>
              : <div className="order-actions order-purchase-options">
                <button type="button" className="order-action order-secondary" disabled={!checkoutAllowed || submitting} onClick={() => { setOrderError(''); setScreen('auth'); }}><strong>{t('Create account', 'အကောင့်ဖွင့်မည်')}</strong><small>{t('Keep history and subscription dates', 'မှတ်တမ်းနဲ့ သက်တမ်း ကြည့်နိုင်')}</small></button>
                <button type="button" className="order-action order-primary" disabled={!checkoutAllowed || submitting} onClick={() => { setOrderError(''); setScreen('guest'); }}><strong>{t('Buy on Telegram', 'Telegram မှဝယ်ယူမည်')}</strong><small>{t('Keep the order message in Telegram', 'Telegram က အော်ဒါစာ သိမ်းထားပါ')}</small></button>
              </div> : <div className="order-actions"><button type="button" className="order-action order-secondary" onClick={closeOrder}>{t('Keep browsing', 'ဆက်လက် ရွေးချယ်ရန်')}</button>{checkoutControl}</div>}
          </footer>
        </> : <div className="order-empty"><ShoppingBag size={30}/><p>{t('Your cart is empty. Choose a product and add a plan.', 'ဈေးခြင်းထဲမှာ ပစ္စည်း မရှိသေးပါ။ ဝန်ဆောင်မှုတစ်ခု ရွေးပြီး အစီအစဉ်ကို ထည့်လိုက်ပါ။')}</p>{orderError && <p className="order-checkout-note" role="alert">{orderError}</p>}{commerceEnabled && savedReceipt && <button className="order-action order-primary" onClick={() => void resumeReceipt()}>{t('View saved order', 'သိမ်းထားတဲ့ အော်ဒါ ကြည့်မယ်')}</button>}<button className="order-action order-secondary" onClick={closeOrder}>{t('Browse products', 'ပစ္စည်းများ ကြည့်ရန်')}</button></div>)}
        {screen === 'auth' && <>
          <div className="order-scroll order-checkout-auth">
            <Suspense fallback={<p role="status">{t('Loading account…', 'အကောင့် ဖွင့်နေသည်…')}</p>}>
              <CheckoutAuth lang={lang} onBusyChange={busy => { authInFlight.current = busy; setAuthBusy(busy); }}
                onSuccess={customer => { authInFlight.current = false; setAuthBusy(false); setOrderError(''); setSessionState({status: 'signed-in', customerId: customer.id}); setAccountNotice(true); setScreen('cart'); }}
                onGuest={() => { setOrderError(''); setScreen('guest'); }} />
            </Suspense>
          </div>
          <footer className="order-footer order-auth-footer"><button type="button" className="order-guest-back" disabled={authBusy} onClick={() => { setSessionState({status: 'checking', customerId: null}); setScreen('cart'); }}>{t('Back to cart', 'ဈေးခြင်းသို့ ပြန်ရန်')}</button></footer>
        </>}
        {screen === 'guest' && <>
          <div className="order-scroll order-content">
            <div id="order-guest-notice" className="order-guest-notice">
              <strong>{t('Your order history stays in Telegram', 'အော်ဒါမှတ်တမ်းကို Telegram မှာ သိမ်းထားပါ')}</strong>
              <p>{t('You’ll buy directly with the Digimium admin in Telegram. This purchase and its expiry date won’t appear in your website account history.', 'Telegram မှာ Admin နဲ့ တိုက်ရိုက်ဆက်သွယ်ပြီး ဝယ်ယူရမှာပါ။ ဒီဝယ်ယူမှုနဲ့ သက်တမ်းကုန်ရက်ကို website ရဲ့ အော်ဒါမှတ်တမ်းမှာ ပြန်ကြည့်လို့ရမှာ မဟုတ်ပါ။')}</p>
            </div>
          </div>
          <footer className="order-footer order-guest-footer">
            {orderError && <p className="order-checkout-note" role="alert">{orderError}</p>}
            <button type="button" className="order-action order-primary" aria-describedby="order-guest-notice" disabled={submitting || !checkoutAllowed} onClick={() => void placeOrder(true)}>{submitting ? t('Preparing order…', 'အော်ဒါ ပြင်ဆင်နေသည်…') : t('Buy on Telegram', 'Telegram မှဝယ်ယူမည်')}<ArrowUpRight size={17}/></button>
            <button type="button" className="order-guest-back" disabled={submitting} onClick={() => { setOrderError(''); setSessionState({status: 'checking', customerId: null}); setScreen('cart'); }}>{t('Back to cart', 'ဈေးခြင်းသို့ ပြန်ရန်')}</button>
          </footer>
        </>}
        {screen === 'handoff' && !canShowHandoff && <div className="order-content order-handoff-locked">
          <p role={sessionState.status === 'failed' ? 'alert' : 'status'}>{sessionState.status === 'failed' ? t('We couldn’t verify your account. Your saved order is still available after verification.', 'အကောင့်ကို အတည်ပြုမရသေးပါ။ အတည်ပြုပြီးရင် သိမ်းထားတဲ့ အော်ဒါကို ပြန်ကြည့်နိုင်ပါတယ်။') : t('Checking your account before showing the saved order…', 'သိမ်းထားတဲ့ အော်ဒါမပြမီ အကောင့် စစ်ဆေးနေသည်…')}</p>
          {sessionState.status === 'failed' && <button type="button" className="order-action order-secondary" onClick={() => void resumeReceipt()}>{t('Try again', 'ပြန်စမ်းမယ်')}</button>}
          <a className="order-account-history" href="/account">{t('Open my account', 'အကောင့် ကြည့်မယ်')}<ArrowUpRight size={15}/></a>
        </div>}
        {screen === 'handoff' && canShowHandoff && <div className="order-content order-handoff">
          {commerceEnabled && orderId && <>
            <p className="order-saved-status"><CheckCircle2 size={19}/>{t('Awaiting shop approval', 'ဆိုင်အတည်ပြုရန် စောင့်နေသည်')}</p>
            <p>{t('Payment is not completed yet.', 'ငွေပေးချေပြီးခြင်း မဟုတ်ပါ။')}</p>
            <div className="order-receipt-reference"><span>{t('Order reference', 'အော်ဒါအမှတ်')}</span><strong><bdi>#{orderId.slice(0, 8).toUpperCase()}</bdi></strong></div>
            {handoffOrder && <ul className="order-receipt-lines">{handoffOrder.lines.map((line, index) => <li key={index}><div><strong>{line.productName}</strong><span>{[line.planName, line.duration, t(`Qty ${line.quantity}`, `${line.quantity} ခု`)].filter(Boolean).join(' · ')}</span></div><strong>{priceText(line.price, lang)}</strong></li>)}</ul>}
            {handoffOrder?.totalMmk !== null && handoffOrder?.totalMmk !== undefined && <div className="order-total"><span>{t('Order total', 'စုစုပေါင်း')}</span><strong>{priceText(handoffOrder.totalMmk.toLocaleString('en-US') + ' MMK', lang)}</strong></div>}
            <p>{guestOrder ? t('Keep your order message in Telegram.', 'Telegram က အော်ဒါစာကို သိမ်းထားပါ။') : t('Saved in your account.', 'အော်ဒါကို သင့်အကောင့်မှာ သိမ်းထားပါတယ်။')}</p>
          </>}
          <p className="order-send-instruction">{t('Tap Send in the Telegram chat to continue.', 'Telegram စာပို့ခန်းမှာ ပို့ရန် / Send ကို နှိပ်ပေးပါ။')}</p>
          {orderError && <p className="order-checkout-note" role="alert">{orderError}</p>}
          {copyStatus === 'copied' && <p role="status">{t('Order message copied.', 'အော်ဒါစာ ကူးယူပြီးပါပြီ။')}</p>}
          {handoff.length > 1 && <p>{t(`Your order uses ${handoff.length} Telegram messages. Send each part in the same chat.`, `ဒီအော်ဒါကို Telegram မှာ စာ ${handoff.length} ပိုင်းခွဲပြီး တစ်ခန်းတည်းမှာ ပို့ပေးပါ။`)}</p>}
          <div className="order-actions order-handoff-actions">
            {handoff.map((part, index) => {
              const url = telegramDraft(handoffContact, part);
              return url ? <a key={index} className="order-action order-primary" href={url} target="_blank" rel="noopener noreferrer">{handoff.length === 1 ? t('Reopen Telegram', 'Telegram ပြန်ဖွင့်မယ်') : partLabel(index + 1, handoff.length)}<ArrowUpRight size={16}/></a> : null;
            })}
            <button type="button" className="order-action order-secondary" onClick={() => void copy(handoff.join('\n\n'))}><Copy size={15}/>{t('Copy full order', 'အော်ဒါ အားလုံး ကူးယူရန်')}</button>
          </div>
          <details className="order-receipt-details" ref={receiptDetails}><summary>{t('View order message', 'အော်ဒါစာ အသေးစိတ် ကြည့်ရန်')}</summary><label className="order-transcript">{t('Order details', 'အော်ဒါ အသေးစိတ်')}<textarea ref={fullOrder} readOnly rows={4} value={handoff.join('\n\n')}/></label></details>
          <a className="order-account-history" href="#contact" onClick={closeOrder}>{t('Need help opening Telegram?', 'Telegram ဖွင့်မရဘူး — အကူအညီလိုတယ်')}<ArrowUpRight size={15}/></a>
          {commerceEnabled && orderId && !guestOrder && <a className="order-account-history" href="/order-history">{t('View my orders', 'ကျွန်ုပ်၏ အော်ဒါများ ကြည့်ရန်')}<ArrowUpRight size={15}/></a>}
          {copyStatus === 'manual' && <p role="status">{t('Select and copy the order details above.', 'အပေါ်က အော်ဒါ အသေးစိတ်ကို ရွေးပြီး ကူးယူပါ။')}</p>}
        </div>}
      </div>
    </dialog>
  </>;
});
