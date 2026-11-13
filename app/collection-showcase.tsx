import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { ArrowRight, ArrowUpRight, AudioLines, ChevronLeft, ChevronRight, Gift, LayoutGrid, PenTool, Sparkles, Star, Tag } from 'lucide-react';
import type { Product } from '../lib/catalog';
import { categoryName, durationText, planName, type ShopLanguage } from '../lib/shop-language';
import { showcaseSlides } from '../lib/showcase';
import { Mark } from './product-mark';
import { OfferPrice } from './offer-price';
import { OfferSculpture, ServiceTiles } from './showcase-artwork';
import './collection-showcase.css';

const collections = [
  { icon: Sparkles, en: 'Think', my: 'အလုပ်', enTitle: 'A brighter way\nto work.', myTitle: 'အလုပ်တွေကို\nပိုလွယ်ကူစေဖို့။', enText: 'A little help. A lot of possibility.', myText: 'အလုပ်အတွက် အသုံးဝင်တဲ့ AI နဲ့ ကိရိယာများ။' },
  { icon: PenTool, en: 'Create', my: 'ဖန်တီးမှု', enTitle: 'An idea.\nThen anything.', myTitle: 'စိတ်ကူးတွေကို\nပုံဖော်လိုက်ပါ။', enText: 'Make room for your next great idea.', myText: 'ဒီဇိုင်းနဲ့ ဗီဒီယို ဖန်တီးသူတွေအတွက်။' },
  { icon: AudioLines, en: 'Unwind', my: 'အပန်းဖြေ', enTitle: 'Your time.\nWell spent.', myTitle: 'သင့်စိတ်ကြိုက်\nအပန်းဖြေစရာ။', enText: 'Press play on a little more you.', myText: 'နှစ်သက်ရာ သီချင်းနဲ့ ရုပ်ရှင်တွေကို ခံစားလိုက်ပါ။' },
  { icon: LayoutGrid, en: 'Everyday', my: 'နေ့စဉ်သုံး', enTitle: 'Everyday\nessentials.', myTitle: 'နေ့စဉ်သုံး\nဝန်ဆောင်မှုများ။', enText: '', myText: '' },
];
const rotationDelay = 7000;
const maxVisibleDashes = 7;
const motionQuery = '(prefers-reduced-motion: reduce)';
function watchMotion(onChange: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const prefersReducedMotion = () => window.matchMedia(motionQuery).matches;
const serverReducedMotion = () => true;
function watchVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
const pageIsHidden = () => document.hidden;
const serverPageHidden = () => false;

type Props = {
  products: Product[];
  lang: ShopLanguage;
  motionPaused: boolean;
  onProduct: (product: Product, planId?: string) => void;
  onCategory: (category: number) => void;
};

export function CollectionShowcase({ products, lang, motionPaused, onProduct, onCategory }: Props) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const slides = useMemo(() => showcaseSlides(products), [products]);
  const [page, setPage] = useState({ index: 0, direction: 0 });
  const [held, setHeld] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [touching, setTouching] = useState(false);
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const reducedMotion = useSyncExternalStore(watchMotion, prefersReducedMotion, serverReducedMotion);
  const hidden = useSyncExternalStore(watchVisibility, pageIsHidden, serverPageHidden);
  const motionStopped = motionPaused || hidden;
  const count = slides.length;
  const rotating = count > 1 && !motionStopped && !reducedMotion && !held && !hovered && !focusWithin && !touching;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setPage({ index: (page.index + 1) % count, direction: 1 }), rotationDelay);
    return () => window.clearTimeout(timer);
  }, [count, page, rotating]);

  if (!count) return null;
  const current = page.index % count;
  const dashCount = Math.min(count, maxVisibleDashes);
  const firstDash = Math.min(Math.max(current - Math.floor(dashCount / 2), 0), count - dashCount);
  const slide = slides[current];
  const category = slide.category;
  const collection = category ? collections[category - 1] : undefined;
  const categories = slides.flatMap((item, i) => item.category ? [{ ...collections[item.category - 1], index: i }] : []);
  const { product, plan } = slide.items[0];
  const offer = plan ?? product;
  const showOfferDetails = Boolean(plan || !product.plans?.length);
  const label = collection ? t('Explore a collection', 'အမျိုးအစားအလိုက် ရွေးချယ်ပါ')
    : slide.kind === 'best' ? t('Best Seller', 'အရောင်းရဆုံး')
    : slide.kind === 'promotion' ? t('Promotion', 'ပရိုမိုးရှင်း') : t('Discount', 'လျှော့ဈေး');
  const Icon = slide.kind === 'best' ? Star : slide.kind === 'promotion' ? Gift : Tag;
  const viewPlan = plan ? t('View plan', 'Plan ကြည့်ရန်') : t('View plans', 'Plan များ ကြည့်ရန်');
  const slideLabel = (i: number) => t(`Slide ${i + 1} of ${count}`, `ပြကွက် ${i + 1} / ${count}`);

  function goTo(index: number, direction = Math.sign(index - current)) {
    setHeld(index === current);
    if (index !== current) setPage({ index, direction });
  }

  function step(direction: number) {
    goTo((current + direction + count) % count, direction);
  }

  function startSwipe(event: PointerEvent<HTMLElement>) {
    suppressClick.current = false;
    if (event.pointerType !== 'touch' || count < 2) return;
    swipeStart.current = event.isPrimary
      ? { id: event.pointerId, x: event.clientX, y: event.clientY }
      : null;
    setTouching(true);
  }

  function endSwipe(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'touch') return;
    const start = swipeStart.current;
    swipeStart.current = null;
    setTouching(false);
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      // A swipe starting over the full-card offer link must not also open a plan.
      suppressClick.current = true;
      step(dx < 0 ? 1 : -1);
    }
  }

  function openProduct(item: Product, planId?: string) {
    // Keep the opener on screen so the plan picker can restore focus on close.
    setHeld(true);
    onProduct(item, planId);
  }

  return <section className="showcase" data-kind={slide.kind} data-motion-paused={motionStopped} aria-roledescription={t('carousel', 'ဆလိုက်ရှိုး')} aria-label={t('Service highlights', 'ရွေးချယ်ထားသော ဝန်ဆောင်မှုများ')}
    onPointerEnter={event => setHovered(event.pointerType !== 'touch')} onPointerLeave={() => setHovered(false)}
    onPointerDownCapture={startSwipe} onPointerUpCapture={endSwipe} onPointerCancel={() => {
      swipeStart.current = null;
      setTouching(false);
    }} onClickCapture={event => {
      if (suppressClick.current && event.detail > 0) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    }}
    onFocusCapture={() => setFocusWithin(true)} onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
    }}>
    <ServiceTiles />
    <div className="showcase-surface">
      <div className="showcase-top">
        <span className="showcase-label">{collection ? <img src="/assets/symbol-white.png" alt="" /> : <Icon size={18} aria-hidden="true" />}{label}</span>
        {count > 1 && <div className="showcase-controls">
          <button type="button" aria-label={t('Previous slide', 'ရှေ့ပြကွက်')} onClick={() => step(-1)}><ChevronLeft size={18} /></button>
          <button type="button" aria-label={t('Next slide', 'နောက်ပြကွက်')} onClick={() => step(1)}><ChevronRight size={18} /></button>
        </div>}
      </div>
      {collection && categories.length > 1 && <div className="collection-switch" role="group" aria-label={t('Collections', 'ဝန်ဆောင်မှု အမျိုးအစားများ')}>
        {categories.map(item => <button key={item.index} type="button" aria-pressed={item.index === current} onClick={() => goTo(item.index)}>
          <item.icon size={15} />{item[lang]}
        </button>)}
      </div>}
      <div role="group" aria-roledescription={t('slide', 'ပြကွက်')} aria-label={slideLabel(current)}
        className="showcase-slide" data-direction={page.direction}>
        <div className="showcase-backdrop" aria-hidden="true">
          <img className="portal" src="/assets/symbol-white.png" alt="" />
        </div>
        <div aria-live={rotating ? 'off' : 'polite'} aria-atomic="true">
          <div className={collection ? 'collection-art' : 'collection-art showcase-offer'}>
            {!collection && <OfferSculpture gift={slide.kind === 'promotion'} />}
            <div key={current} className="showcase-copy">
              {collection ? <>
                <h2>{t(collection.enTitle, collection.myTitle)}</h2>
                {collection.enText && <p>{t(collection.enText, collection.myText)}</p>}
              </> : <>
                <span className="showcase-logo"><Mark product={product} /></span>
                <h2>{product.name}</h2>
                {plan && <p className="showcase-plan">{planName(plan, lang)}</p>}
                {showOfferDetails && <div className="showcase-terms">
                  {offer.duration && <span>{durationText(offer.duration, lang)}</span>}
                  <OfferPrice offer={offer} lang={lang} />
                </div>}
              </>}
            </div>
          </div>
          {collection && <div className="collection-bottom">{slide.items.map(({ product: item }) => <button key={item.id} type="button" onClick={() => openProduct(item)}
            aria-label={item.name + ' · ' + t('Choose plan', 'အစီအစဉ် ရွေးရန်')}><Mark product={item} /><span>{item.name}</span><ArrowUpRight size={14} /></button>)}</div>}
        </div>
        {count > 1 && <div className="showcase-pages" role="group" aria-label={t('Choose a slide', 'ပြကွက် ရွေးရန်')}>
          {Array.from({ length: dashCount }, (_, offset) => {
            const i = firstDash + offset;
            const clippedEdge = (offset === 0 && i > 0) || (offset === dashCount - 1 && i < count - 1);
            return <button key={i} type="button" aria-label={slideLabel(i)} aria-current={i === current ? 'step' : undefined}
              className={clippedEdge ? 'more-slides' : undefined} onClick={() => goTo(i)} />;
          })}
        </div>}
        {collection && category
          ? <button className="collection-link" type="button" onClick={() => onCategory(category)}>{categoryName(category, lang)} <ArrowRight size={17} /></button>
          : <button type="button" className="collection-link showcase-offer-link" onClick={() => openProduct(product, plan?.id)}
              aria-label={[product.name, plan && planName(plan, lang), viewPlan].filter(Boolean).join(' · ')}>{viewPlan} <ArrowUpRight size={17} /></button>}
      </div>
    </div>
  </section>;
}
