import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, ArrowUpRight, AudioLines, ChevronLeft, ChevronRight, Gift, LayoutGrid, Pause, PenTool, Play, Sparkles, Star, Tag } from 'lucide-react';
import type { Product } from '../lib/catalog';
import { categoryName, durationText, planName, type ShopLanguage } from '../lib/shop-language';
import { showcaseSlides } from '../lib/showcase';
import { Mark } from './product-mark';
import { OfferPrice } from './offer-price';
import './collection-showcase.css';

const collections = [
  { icon: Sparkles, en: 'Think', my: 'အလုပ်', enTitle: 'A brighter way\nto work.', myTitle: 'အလုပ်တွေကို\nပိုလွယ်ကူစေဖို့။', enText: 'A little help. A lot of possibility.', myText: 'အလုပ်အတွက် အသုံးဝင်တဲ့ AI နဲ့ ကိရိယာများ။' },
  { icon: PenTool, en: 'Create', my: 'ဖန်တီးမှု', enTitle: 'An idea.\nThen anything.', myTitle: 'စိတ်ကူးတွေကို\nပုံဖော်လိုက်ပါ။', enText: 'Make room for your next great idea.', myText: 'ဒီဇိုင်းနဲ့ ဗီဒီယို ဖန်တီးသူတွေအတွက်။' },
  { icon: AudioLines, en: 'Unwind', my: 'အပန်းဖြေ', enTitle: 'Your time.\nWell spent.', myTitle: 'သင့်စိတ်ကြိုက်\nအပန်းဖြေစရာ။', enText: 'Press play on a little more you.', myText: 'နှစ်သက်ရာ သီချင်းနဲ့ ရုပ်ရှင်တွေကို ခံစားလိုက်ပါ။' },
  { icon: LayoutGrid, en: 'Everyday', my: 'နေ့စဉ်သုံး', enTitle: 'Everyday\nessentials.', myTitle: 'နေ့စဉ်သုံး\nဝန်ဆောင်မှုများ။', enText: '', myText: '' },
];
const rotationDelay = 7000;
const motionQuery = '(prefers-reduced-motion: reduce)';
function watchMotion(onChange: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const prefersReducedMotion = () => window.matchMedia(motionQuery).matches;
const serverReducedMotion = () => true;

type Props = {
  products: Product[];
  lang: ShopLanguage;
  onProduct: (product: Product, planId?: string) => void;
  onCategory: (category: number) => void;
};

export function CollectionShowcase({ products, lang, onProduct, onCategory }: Props) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const slides = useMemo(() => showcaseSlides(products), [products]);
  const [index, setIndex] = useState(0);
  const [play, setPlay] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const reducedMotion = useSyncExternalStore(watchMotion, prefersReducedMotion, serverReducedMotion);
  const rotationEnabled = play ?? !reducedMotion;
  const rotating = slides.length > 1 && rotationEnabled && !hovered && !focusWithin;
  const count = slides.length;

  useEffect(() => {
    if (!rotating) return;
    let timer: number | undefined;
    function schedule() {
      window.clearInterval(timer);
      if (!document.hidden) timer = window.setInterval(() => setIndex(i => (i + 1) % count), rotationDelay);
    }
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [count, rotating]);

  if (!count) return null;
  const current = index % count;
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
  const rotationAction = rotationEnabled ? t('Pause slideshow', 'အလိုအလျောက် ပြသမှုကို ရပ်ရန်') : t('Play slideshow', 'အလိုအလျောက် ပြသရန်');
  const position = t(`Slide ${current + 1} of ${count}`, `ပြကွက် ${current + 1} / ${count}`);

  function openProduct(item: Product, planId?: string) {
    // Keep the opener on screen so the plan picker can restore focus on close.
    setPlay(false);
    onProduct(item, planId);
  }

  return <section className="showcase" aria-roledescription={t('carousel', 'ဆလိုက်ရှိုး')} aria-label={t('Service highlights', 'ရွေးချယ်ထားသော ဝန်ဆောင်မှုများ')}
    onPointerEnter={event => setHovered(event.pointerType !== 'touch')} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocusWithin(true)} onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
    }}>
    <div className="showcase-top">
      <span className="showcase-label">{collection ? <img src="/assets/symbol-white.png" alt="" /> : <Icon size={18} aria-hidden="true" />}{label}</span>
      {count > 1 && <div className="showcase-controls">
        <button type="button" aria-label={rotationAction} title={rotationAction} onClick={() => setPlay(!rotationEnabled)}>
          {rotationEnabled ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button type="button" aria-label={t('Previous slide', 'ရှေ့ပြကွက်')} onClick={() => setIndex((current - 1 + count) % count)}><ChevronLeft size={18} /></button>
        <span aria-hidden="true">{current + 1} / {count}</span>
        <button type="button" aria-label={t('Next slide', 'နောက်ပြကွက်')} onClick={() => setIndex((current + 1) % count)}><ChevronRight size={18} /></button>
      </div>}
    </div>
    {collection && categories.length > 1 && <div className="collection-switch" role="group" aria-label={t('Collections', 'ဝန်ဆောင်မှု အမျိုးအစားများ')}>
      {categories.map(item => <button key={item.index} type="button" aria-pressed={item.index === current} onClick={() => setIndex(item.index)}>
        <item.icon size={15} />{item[lang]}
      </button>)}
    </div>}
    <div aria-live={rotating ? 'off' : 'polite'} aria-atomic="true">
      <div role="group" aria-roledescription={t('slide', 'ပြကွက်')} aria-label={position} className="showcase-slide">
        {collection && category ? <>
          <div key={current} className="collection-art"><img className="portal" src="/assets/symbol-white.png" alt="" />
            <h2>{t(collection.enTitle, collection.myTitle)}</h2>
            {collection.enText && <p>{t(collection.enText, collection.myText)}</p>}
          </div>
          <div className="collection-bottom">{slide.items.map(({ product: item }) => <button key={item.id} type="button" onClick={() => openProduct(item)}
            aria-label={item.name + ' · ' + t('Choose plan', 'အစီအစဉ် ရွေးရန်')}><Mark product={item} /><span>{item.name}</span><ArrowUpRight size={14} /></button>)}</div>
          <button className="collection-link" type="button" onClick={() => onCategory(category)}>{categoryName(category, lang)} <ArrowRight size={17} /></button>
        </> : <>
          <div key={current} className="collection-art showcase-offer">
            <img className="portal" src="/assets/symbol-white.png" alt="" />
            <span className="showcase-logo"><Mark product={product} /></span>
            <h2>{product.name}</h2>
            {plan && <p className="showcase-plan">{planName(plan, lang)}</p>}
            {showOfferDetails && <div className="showcase-terms">
              {offer.duration && <span>{durationText(offer.duration, lang)}</span>}
              <OfferPrice offer={offer} lang={lang} />
            </div>}
          </div>
          <button type="button" className="collection-link showcase-offer-link" onClick={() => openProduct(product, plan?.id)}
            aria-label={[product.name, plan && planName(plan, lang), viewPlan].filter(Boolean).join(' · ')}>{viewPlan} <ArrowUpRight size={17} /></button>
        </>}
      </div>
    </div>
  </section>;
}
