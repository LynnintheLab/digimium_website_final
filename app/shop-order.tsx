'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { Product } from '../lib/catalog';
import { CART_KEY, orderMessages, resolveOrder, restoreCart, sameItem, telegramDraft, totalMmk, withSelection, type CartItem, type OrderLine } from '../lib/cart-order';
import { effectivePrice } from '../lib/pricing';
import { productLogoSrc } from '../lib/product-logo';
import { durationDetail, durationText, planName, priceOnEnquiry, priceText, productDescription } from '../lib/shop-language';
import { OfferPrice } from './offer-price';
import './shop-order.css';

type Locale = 'en' | 'my';
export type ShopOrderHandle = { openProduct(product: Product): void; openCart(): void };
type Props = { products: Product[]; lang: Locale; telegram: string; hideShortDescriptions?: boolean; onCountChange: (count: number) => void };
type Screen = 'product' | 'cart' | 'handoff' | null;

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

function CheckoutNote({askAboutPrice}: {askAboutPrice: boolean}) {
  return <p lang="my" className="order-checkout-note">
    ဝယ်ယူရန် (သို့မဟုတ်) Plan အကြောင်း အသေးစိတ်မေးမြန်ရန် Check Out ကို နှိပ်ပြီး Telegram မှာမေးမြန်နိုင်ပါသည်။
    {askAboutPrice && <><br/>ဈေးနှုန်းအသေးစိတ်ကိုလည်း Admin မှ ချက်ချင်းပြန်လည် ဖြေကြားပေးပါမည်။</>}
  </p>;
}

export const ShopOrder = forwardRef<ShopOrderHandle, Props>(function ShopOrder({products, lang, telegram, hideShortDescriptions, onCountChange}, ref) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const fullOrder = useRef<HTMLTextAreaElement>(null);
  const [screen, setScreen] = useState<Screen>(null);
  const [productId, setProductId] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [lastAdded, setLastAdded] = useState('');
  const [handoff, setHandoff] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const copyAttempt = useRef(0);
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

  useEffect(() => {
    function read() {
      try { setCart(restoreCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'), products)); }
      catch { /* A private browser can still use the in-memory cart. */ }
      setReady(true);
    }
    read();
    const synchronize = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) read(); };
    const resume = (event: PageTransitionEvent) => { if (event.persisted) read(); };
    window.addEventListener('storage', synchronize);
    window.addEventListener('pageshow', resume);
    return () => {
      window.removeEventListener('storage', synchronize);
      window.removeEventListener('pageshow', resume);
    };
  }, [products]);
  useEffect(() => { onCountChange(count); }, [count, onCountChange]);
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
      returnFocus.current?.focus({preventScroll: true});
    };
  }, [open]);

  function begin(next: Exclude<Screen, null>) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLastAdded('');
    setCopyStatus('idle');
    setScreen(next);
  }
  useImperativeHandle(ref, () => ({
    openProduct(item) {
      setProductId(item.id);
      setPlanId(item.plans?.find(plan => plan.published)?.id ?? null);
      begin('product');
    },
    openCart() { begin('cart'); },
  }));

  function saveCart(next: CartItem[]) {
    // Save in the click handler before the browser switches to Telegram.
    setCart(next);
    try { localStorage.setItem(CART_KEY, JSON.stringify(next)); }
    catch { /* The in-memory cart still works when storage is unavailable. */ }
  }

  function add() {
    if (!selected || !product) return;
    saveCart(withSelection(cart, selected, true));
    setScreen(null);
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
        fullOrder.current?.select();
      }
    }
  }
  function checkout() {
    if (!checkoutRows.length) return;
    setHandoff(orderText);
    saveCart([]);
    setCopyStatus('idle');
    void copy(orderText.join('\n\n'));
    setScreen('handoff');
  }
  function changeQuantity(item: CartItem, difference: number) {
    saveCart(cart.map(entry => sameItem(item, entry) ?
      {...entry, quantity: Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, entry.quantity + difference))} : entry));
  }
  const checkoutAllowed = ready && Boolean(checkoutUrl) && checkoutRows.length > 0 && (screen !== 'product' || Boolean(selected));
  const checkoutControl = checkoutAllowed
    ? <a className="order-action order-primary" href={checkoutUrl} target="_blank" rel="noopener noreferrer" onClick={checkout}>
        {t('Checkout on Telegram', 'Check Out')}<ArrowUpRight size={17}/>
      </a>
    : <button type="button" className="order-action order-primary" disabled>{t('Checkout on Telegram', 'Check Out')}</button>;
  return <>
    <div className="order-notifications" aria-live="polite">{lastAdded && <div className="order-toast">
      <Check size={17}/><span>{t(`${lastAdded} added to cart`, `${lastAdded} ကို ဈေးခြင်းထဲ ထည့်ပြီးပါပြီ`)}</span>
      <button type="button" onClick={() => begin('cart')}>{t('View cart', 'ဈေးခြင်း ကြည့်ရန်')}</button>
    </div>}</div>
    <dialog ref={dialog} className="shop-order" lang={lang} aria-labelledby="shop-order-title"
      onCancel={event => { event.preventDefault(); setScreen(null); }}
      onClick={event => { if (event.target === event.currentTarget) setScreen(null); }}>
      <div className="order-surface">
        <header className="order-heading">
          {screen === 'product' && hideShortDescriptions && product && <Logo product={product}/>}
          <h2 id="shop-order-title">{screen === 'product' ? product?.name : screen === 'handoff' ?
            t('Your Telegram order', 'သင့် Telegram အော်ဒါ') : t('Your cart', 'သင့်ဈေးခြင်း')}</h2>
          <button type="button" className="order-icon" aria-label={t('Close', 'ပိတ်ရန်')} onClick={() => setScreen(null)}><X size={20}/></button>
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
                  return <label className="order-option" key={plan.id}>
                    <input type="radio" name="shop-plan" checked={plan.id === planId} onChange={() => setPlanId(plan.id)}/>
                    <span className="order-option-name">{name}{duration && <small>{duration}</small>}</span>
                    <OfferPrice offer={plan} lang={lang}/>
                  </label>;
                }) : <label className="order-option"><input type="radio" name="shop-plan" checked readOnly/>
                  <span className="order-option-name">{t('Ask about this service', 'ဝန်ဆောင်မှုအကြောင်း စုံစမ်းရန်')}{product.duration && <small>{durationText(product.duration, lang)}</small>}</span>
                  <OfferPrice offer={product} lang={lang}/></label>}
              </fieldset>
              {product.availability === 'unavailable' && <p className="order-help">{t('Currently unavailable.', 'လက်ရှိ မရရှိနိုင်သေးပါ။')}</p>}
            </div>
            <div className="order-guidance">
              <CheckoutNote askAboutPrice={priceOnEnquiry(effectivePrice(selectedPlan ?? product))}/>
            </div>
          </div>
          <footer className="order-footer">
            <div className="order-actions"><button type="button" disabled={!ready || !selected} className="order-action order-secondary" onClick={add}>
              <ShoppingBag size={16}/>{t('Add to cart', 'Add to Cart')}</button>{checkoutControl}</div>
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
                  <button type="button" className="order-icon" disabled={item.quantity <= 1} aria-label={t('Decrease quantity', 'အရေအတွက် လျှော့ရန်')} onClick={() => changeQuantity(item, -1)}><Minus size={14}/></button>
                  <span>{item.quantity}</span>
                  <button type="button" className="order-icon" aria-label={t('Increase quantity', 'အရေအတွက် တိုးရန်')} onClick={() => changeQuantity(item, 1)}><Plus size={14}/></button>
                </div>
              </div>
              <button type="button" className="order-icon" aria-label={t(`Remove ${item.product.name}`, `${item.product.name} ကို ဖယ်ရှားရန်`)}
                onClick={() => saveCart(cart.filter(entry => !sameItem(entry, item)))}><Trash2 size={16}/></button>
            </li>)}</ul>
            <div className="order-guidance"><div className="order-total"><span>{t('Order total', 'စုစုပေါင်း')}</span><strong>{cartTotal === undefined ?
              t('Confirm on Telegram', 'Telegram တွင် စျေးနှုန်း အတည်ပြုပါ') : priceText(`${cartTotal.toLocaleString('en-US')} MMK`, lang)}</strong></div>
              <CheckoutNote askAboutPrice={rows.some(item => priceOnEnquiry(effectivePrice(item.plan ?? item.product)))}/>
            </div>
          </div>
          <footer className="order-footer">
            <div className="order-actions"><button type="button" className="order-action order-secondary" onClick={() => setScreen(null)}>{t('Keep browsing', 'ဆက်လက် ရွေးချယ်ရန်')}</button>{checkoutControl}</div>
          </footer>
        </> : <div className="order-empty"><ShoppingBag size={30}/><p>{t('Your cart is empty. Choose a product and add a plan.', 'ဈေးခြင်းထဲမှာ ပစ္စည်း မရှိသေးပါ။ ဝန်ဆောင်မှုတစ်ခု ရွေးပြီး အစီအစဉ်ကို ထည့်လိုက်ပါ။')}</p><button className="order-action order-secondary" onClick={() => setScreen(null)}>{t('Browse products', 'ပစ္စည်းများ ကြည့်ရန်')}</button></div>)}
        {screen === 'handoff' && <div className="order-content order-handoff">
          <p role="status">{copyStatus === 'copied' ? t('Order copied. Tap Send in the Telegram chat to confirm your request.', 'အော်ဒါကို ကူးယူပြီးပါပြီ။ Telegram စာပို့ခန်းမှာ ပို့ရန်ကို နှိပ်ပေးပါ။') :
            t('Your order is ready. Copy the details or open your draft in Telegram.', 'အော်ဒါ အဆင်သင့်ဖြစ်ပါပြီ။ အသေးစိတ်ကို ကူးယူပါ သို့မဟုတ် Telegram တွင် ဖွင့်ပါ။')}</p>
          {handoff.length > 1 && <p>{t(`Your order uses ${handoff.length} Telegram messages. Send each part in the same chat.`, `ဒီအော်ဒါကို Telegram မှာ စာ ${handoff.length} ပိုင်းခွဲပြီး တစ်ခန်းတည်းမှာ ပို့ပေးပါ။`)}</p>}
          <label className="order-transcript">{t('Order details', 'အော်ဒါ အသေးစိတ်')}<textarea ref={fullOrder} readOnly rows={5} value={handoff.join('\n\n')}/></label>
          <div className="order-actions">
            <button type="button" className="order-action order-secondary" onClick={() => void copy(handoff.join('\n\n'))}><Copy size={15}/>{t('Copy full order', 'အော်ဒါ အားလုံး ကူးယူရန်')}</button>
            {handoff.map((part, index) => {
              const url = telegramDraft(telegram, part);
              return url ? <a key={index} className="order-action order-primary" href={url} target="_blank" rel="noopener noreferrer">{handoff.length === 1 ? t('Open Telegram', 'Telegram ဖွင့်ရန်') : partLabel(index + 1, handoff.length)}<ArrowUpRight size={16}/></a> : null;
            })}
          </div>
          {copyStatus === 'manual' && <p role="status">{t('Select and copy the order details above.', 'အပေါ်က အော်ဒါ အသေးစိတ်ကို ရွေးပြီး ကူးယူပါ။')}</p>}
        </div>}
      </div>
    </dialog>
  </>;
});
