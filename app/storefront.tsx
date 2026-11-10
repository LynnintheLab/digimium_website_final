"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, AudioLines, ChevronDown, Clapperboard, Globe2, LayoutGrid, Mail, Menu, PenTool, Search, Send, ShoppingBag, Sparkles, X } from "lucide-react";
import { categories, type Catalog, type Product, type ProductPlan } from "../lib/catalog";
import { categoryName, durationText, planName, priceText, productDescription } from "../lib/shop-language";
import { productLogoSrc } from "../lib/product-logo";
import { resolveTelegramContact } from "../lib/telegram-contact";
import { ShopOrder, type ShopOrderHandle } from "./shop-order";
import { CursorLight } from "./cursor-light";
import "./storefront-order.css";

type Language = 'en' | 'my';
const stages = [
  { en: 'Think', my: 'အလုပ်', enTitle: 'A brighter way\nto work.', myTitle: 'အလုပ်တွေကို\nပိုလွယ်ကူစေဖို့။', enText: 'A little help. A lot of possibility.', myText: 'အလုပ်အတွက် အသုံးဝင်တဲ့ AI နဲ့ ကိရိယာများ။', category: 1, icon: Sparkles },
  { en: 'Create', my: 'ဖန်တီးမှု', enTitle: 'An idea.\nThen anything.', myTitle: 'စိတ်ကူးတွေကို\nပုံဖော်လိုက်ပါ။', enText: 'Make room for your next great idea.', myText: 'ဒီဇိုင်းနဲ့ ဗီဒီယို ဖန်တီးသူတွေအတွက်။', category: 2, icon: PenTool },
  { en: 'Unwind', my: 'အပန်းဖြေ', enTitle: 'Your time.\nWell spent.', myTitle: 'သင့်စိတ်ကြိုက်\nအပန်းဖြေစရာ။', enText: 'Press play on a little more you.', myText: 'နှစ်သက်ရာ သီချင်းနဲ့ ရုပ်ရှင်တွေကို ခံစားလိုက်ပါ။', category: 3, icon: AudioLines },
];

function Mark({ product }: { product: Product }) {
  const src = productLogoSrc(product);
  const [failed, setFailed] = useState<string>();
  if (!src || failed === src) return <span className="letter-mark" aria-hidden="true">{product.name.slice(0, 1)}</span>;
  return <img src={src} alt="" className={`service-mark mark-${product.logoPath ? 'uploaded' : product.mark}`} onError={() => setFailed(src)} />;
}

function PlanSummary({ plan, lang }: { plan: ProductPlan; lang: Language }) {
  const title = planName(plan, lang);
  const duration = durationText(plan.duration, lang);
  return <div className="catalog-plan"><span>{title}</span><strong>{priceText(plan.price, lang)}</strong>
    {duration && !title.toLowerCase().includes(duration.toLowerCase()) && <small>{duration}</small>}
  </div>;
}

export default function Storefront({ initialCatalog, initialLanguage = 'en' }: { initialCatalog: Catalog; initialLanguage?: Language }) {
  const [lang, setLang] = useState<Language>(initialLanguage);
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [collection, setCollection] = useState(0);
  const [category, setCategory] = useState(0);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const [cartCount, setCartCount] = useState(0);
  const shop = useRef<ShopOrderHandle>(null);
  const { products, settings } = initialCatalog;
  const hideShortDescriptions = settings.hideShortDescriptions === true;
  const telegram = resolveTelegramContact(settings);
  const stage = stages[collection];
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = products.filter(product => {
    if (category && product.category !== category) return false;
    if (!terms.length) return true;
    const text = [product.name, ...(hideShortDescriptions ? [] : [product.description, productDescription(product, lang)]),
      ...(product.plans || []).map(plan => plan.name + ' ' + planName(plan, lang))
    ].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  const featured = matches.filter(product => product.featured);
  const browsingAll = all || category !== 0 || terms.length > 0;
  const visible = browsingAll ? matches : featured.length ? featured : matches.slice(0, 6);
  const collectionProducts = products.filter(product => product.category === stage.category).slice(0, 3);
  const cartLabel = t('Cart', 'ဈေးခြင်း');

  useEffect(() => {
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = 'en'; };
  }, [lang]);

  useEffect(() => {
    if (!menu) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenu(false);
        menuButton.current?.focus();
      }
    }
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setMenu(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [menu]);

  function switchLanguage(next: Language) {
    setLang(next);
    document.cookie = `digimium-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  function showCategory(next: number) {
    setCategory(next);
    setQuery('');
    setAll(next === 0);
    document.getElementById('services')?.scrollIntoView({ block: 'start' });
  }

  const steps = [
    [t('Find your service.', 'ထုတ်ကုန် ရှာပါ။'), t('Browse the catalog and open a product to see its plans.', 'စာရင်းထဲက နှစ်သက်ရာ ထုတ်ကုန်ကို နှိပ်ပြီး အစီအစဉ်တွေကို ကြည့်ပါ။')],
    [t('Choose your plan.', 'အစီအစဉ် ရွေးပါ။'), t('Add it to your cart to keep browsing, or choose Checkout to order.', 'ဆက်လက်ရွေးချယ်ဖို့ ဈေးခြင်းထဲ ထည့်ပါ။ မှာယူဖို့ အသင့်ဖြစ်ရင် မှာယူရန်ကို နှိပ်ပါ။')],
    [t('Send your order.', 'အမှာစာ ပို့ပါ။'), t('Checkout opens your full order in our Telegram chat. Tap Send and we’ll confirm availability and payment details.', 'မှာယူရန်ကို နှိပ်တဲ့အခါ အမှာစာအပြည့်အစုံနဲ့အတူ Telegram ချတ် ပွင့်လာပါမယ်။ ပို့ရန်ကို နှိပ်ပါ။ ရရှိနိုင်မှုနဲ့ ငွေပေးချေမှုအသေးစိတ်ကို ပြန်လည်အတည်ပြုပေးပါမယ်။')],
  ];
  const faqs = [
    [t('Can I order several services together?', 'ဝန်ဆောင်မှု အများအပြားကို တစ်ခါတည်း မှာလို့ရပါသလား။'), t('Yes. Choose a plan, add it to your cart and keep browsing. Checkout includes every item in your cart.', 'ရပါတယ်။ အစီအစဉ်ကို ရွေးပြီး ဈေးခြင်းထဲ ထည့်ပါ။ မှာယူတဲ့အခါ ဈေးခြင်းထဲက ပစ္စည်းအားလုံး အမှာစာထဲမှာ ပါဝင်ပါမယ်။')],
    [t('What does “Price on enquiry” mean?', '“ဈေးနှုန်း မေးရန်” ဆိုတာ ဘာကို ဆိုလိုပါသလဲ။'), t('You can add the plan to your order. Digimium will confirm its current price before you pay.', 'အဲဒီအစီအစဉ်ကိုလည်း ဈေးခြင်းထဲ ထည့်လို့ရပါတယ်။ ငွေမပေးချေမီ လက်ရှိဈေးနှုန်းကို Digimium က ပြောပြပါမယ်။')],
    [t('When do I pay?', 'ဘယ်အချိန်မှာ ငွေပေးချေရမလဲ။'), t('Digimium will confirm your plan, price and payment options in Telegram after you send the order.', 'အမှာစာ ပို့ပြီးမှ ရွေးထားတဲ့ အစီအစဉ်၊ ဈေးနှုန်းနဲ့ ငွေပေးချေနိုင်တဲ့ နည်းလမ်းတွေကို Telegram မှာ အတည်ပြုပေးပါမယ်။')],
  ];

  return <div className="storefront-shell" lang={lang}>
    <CursorLight />
    <a className="skip" href="#services">{t('Skip to services', 'ထုတ်ကုန်စာရင်းသို့ သွားရန်')}</a>
    <header ref={header} className="header wrap">
      <a className="brand" href="#" aria-label={t('Digimium home', 'Digimium ပင်မစာမျက်နှာ')}><img src="/assets/logo.png" alt="digimium." /></a>
      <nav id="shop-nav" className={menu ? 'nav open' : 'nav'} aria-label={t('Main navigation', 'ပင်မမီနူး')}>
        <a href="#services" onClick={() => setMenu(false)}>{t('Explore services', 'ထုတ်ကုန်များ')}</a>
        <a href="#how-it-works" onClick={() => setMenu(false)}>{t('How to order', 'မှာယူနည်း')}</a>
        <a href="#contact" onClick={() => setMenu(false)}>{t('Contact', 'ဆက်သွယ်ရန်')}</a>
      </nav>
      <div className="shop-header-tools">
        <div className="shop-language" role="group" aria-label={t('Language', 'ဘာသာစကား')}>
          <button type="button" aria-label="English" aria-pressed={lang === 'en'} onClick={() => switchLanguage('en')} lang="en">EN</button>
          <button type="button" aria-label="မြန်မာ" aria-pressed={lang === 'my'} onClick={() => switchLanguage('my')} lang="my">မြန်မာ</button>
        </div>
        <button type="button" className="shop-cart-button" aria-label={cartLabel + ' (' + cartCount + ')'} onClick={() => { setMenu(false); shop.current?.openCart(); }}>
          <ShoppingBag size={18} /><span className="shop-cart-word">{cartLabel}</span><span className="shop-cart-count">{cartCount}</span>
        </button>
      </div>
      <button ref={menuButton} type="button" className="menu-button" aria-controls="shop-nav" aria-label={menu ? t('Close menu', 'မီနူး ပိတ်ရန်') : t('Open menu', 'မီနူး ဖွင့်ရန်')} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
    </header>
    <main>
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">{t('Your digital life.', 'သင့်နေ့စဉ်ဘဝအတွက်')}<br /><span>{t('A little more', 'ပိုကောင်းတဲ့')}</span><br /><span className="blue">{t('premium.', 'ဒီဂျစ်တယ်အတွေ့အကြုံ။')}</span></h1>
          <p className="hero-description">{t('Discover subscriptions for work, creativity, and entertainment. Choose a plan and order through Digimium on Telegram.', 'အလုပ်အတွက်၊ ဖန်တီးမှုအတွက်၊ အပန်းဖြေဖို့အတွက် သင့်တော်တဲ့ ဝန်ဆောင်မှုတွေကို ရွေးချယ်ပြီး Digimium ရဲ့ Telegram ကနေ မှာယူနိုင်ပါတယ်။')}</p>
          <div className="hero-actions"><a className="button primary" href="#services">{t('Explore services', 'ထုတ်ကုန်များ ကြည့်ရန်')} <ArrowUpRight size={18} /></a><a className="text-link" href="#how-it-works">{t('How to order', 'မှာယူနည်း')} <ArrowRight size={17} /></a></div>
        </div>
        <div className="showcase">
          <div className="showcase-top"><span>{t('Explore a collection', 'အမျိုးအစားအလိုက် ရွေးချယ်ပါ')}</span><img src="/assets/symbol-white.png" alt="" /></div>
          <div className="collection-switch" role="group" aria-label={t('Collections', 'ဝန်ဆောင်မှု အမျိုးအစားများ')}>{stages.map((item, i) => <button key={item.en} aria-pressed={collection === i} onClick={() => setCollection(i)}><item.icon size={15} />{item[lang]}</button>)}</div>
          <div className="collection-art" key={collection}><img className="portal" src="/assets/symbol-white.png" alt="" /><h2>{t(stage.enTitle, stage.myTitle)}</h2><p>{t(stage.enText, stage.myText)}</p></div>
          <div className="collection-bottom">{collectionProducts.map(product => <button key={product.id} onClick={() => shop.current?.openProduct(product)} aria-label={product.name + ' · ' + t('Choose plan', 'အစီအစဉ် ရွေးရန်')}><Mark product={product} /><span>{product.name}</span><ArrowUpRight size={14} /></button>)}</div>
          <button className="collection-link" onClick={() => showCategory(stage.category)}>{categoryName(stage.category, lang)} <ArrowRight size={17} /></button>
        </div>
      </section>
      <div className="purpose-strip wrap"><span>{t('One place. More possibilities.', 'တစ်နေရာတည်းမှာ စိတ်ကြိုက်ရွေးချယ်ပါ။')}</span><div><span><Sparkles size={16} />{t('Work smarter', 'အလုပ်အတွက်')}</span><span><PenTool size={16} />{t('Create freely', 'ဖန်တီးဖို့')}</span><span><Clapperboard size={16} />{t('Enjoy your downtime', 'အပန်းဖြေဖို့')}</span></div></div>
      <section id="services" className="services wrap" aria-labelledby="services-title">
        <div className="section-heading"><h2 id="services-title">{t('Find your next upgrade', 'သင့်အတွက် ထုတ်ကုန်များ')}<span className="blue">.</span></h2></div>
        <div className="catalog-tools">
          <div className="filters" role="group" aria-label={t('Filter services', 'အမျိုးအစား ရွေးရန်')}>{categories.map((name, i) => <button key={name} aria-pressed={category === i} onClick={() => { setCategory(i); setAll(i === 0); }}>{i === 0 && <LayoutGrid size={14} />} {categoryName(i, lang)}</button>)}</div>
          <label className="search"><Search size={19} /><input type="search" enterKeyHint="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} placeholder={t('Find a product or plan', 'ထုတ်ကုန် သို့မဟုတ် အစီအစဉ် ရှာရန်')} aria-label={t('Search products and plans', 'ထုတ်ကုန်နှင့် အစီအစဉ်များ ရှာရန်')} />{query && <button className="clear-search" type="button" aria-label={t('Clear search', 'ရှာဖွေမှု ရှင်းရန်')} onClick={() => setQuery('')}><X size={18}/></button>}</label>
        </div>
        <div className="catalog-grid">{visible.map(product => <button className="product" type="button" key={product.id} onClick={() => shop.current?.openProduct(product)} aria-label={product.name + ' · ' + t('View plans', 'အစီအစဉ်များ ကြည့်ရန်')}>
          <div className="product-top"><Mark product={product} /><ArrowUpRight size={20} /></div>
          <h3>{product.name}</h3><span className="product-category">{categoryName(product.category, lang)}</span>
          {!hideShortDescriptions && <p>{productDescription(product, lang)}</p>}
          {product.plans?.[0] && <PlanSummary plan={product.plans[0]} lang={lang} />}
          {product.price && <div className="product-price">{priceText(product.price, lang)}{product.duration && <span> / {durationText(product.duration, lang)}</span>}</div>}
          {product.availability === 'unavailable' && <span className="availability availability-unavailable">{t('Currently unavailable', 'လောလောဆယ် မရနိုင်ပါ')}</span>}
          <span className="product-action">{t('View plans', 'အစီအစဉ်များ ကြည့်ရန်')} <ArrowRight size={15} /></span>
        </button>)}</div>
        {!matches.length && <div className="empty"><Search size={30} /><h3>{t('No matching services', 'ကိုက်ညီသော ထုတ်ကုန် မတွေ့ပါ')}</h3><button className="button secondary" onClick={() => { setQuery(''); setCategory(0); setAll(true); }}>{t('Show all services', 'ထုတ်ကုန်အားလုံး ကြည့်ရန်')}</button></div>}
        <div className="catalog-footer"><p aria-live="polite">{t(`${visible.length} of ${matches.length} services`, `ထုတ်ကုန် ${matches.length} ခုအနက် ${visible.length} ခု ပြထားသည်`)}</p>
          {category === 0 && !query && matches.length > featured.length && <button className="text-link" onClick={() => setAll(!all)}>{all ? t('Show featured services', 'ရွေးချယ်ထားသော ထုတ်ကုန်များ ကြည့်ရန်') : t(`Browse all ${products.length} services`, `ထုတ်ကုန် ${products.length} ခုလုံး ကြည့်ရန်`)}<ChevronDown size={17} className={all ? 'rotate' : ''} /></button>}
        </div>
      </section>
      <section id="about" className="about"><div className="wrap about-inner"><div className="about-heading"><img src="/assets/symbol-white.png" alt="" /><h2>{t('Digital.', 'ဒီဂျစ်တယ်။')}<br />{t('Premium.', 'ပရီမီယမ်။')}<br /><span>{t('Made simple.', 'ရိုးရိုးရှင်းရှင်း။')}</span></h2></div><div className="about-copy"><p className="about-intro">{t('More possibility. Less figuring it out.', 'သင်လိုအပ်တာကို လွယ်လွယ်ကူကူ ရွေးချယ်ပါ။')}</p><p>{t('Digimium brings digital tools and entertainment together. If you need help choosing a subscription, tell us how you plan to use it.', 'Digimium မှာ ဒီဂျစ်တယ်ကိရိယာတွေနဲ့ အပန်းဖြေစရာ ဝန်ဆောင်မှုတွေကို တစ်နေရာတည်းမှာ ရွေးချယ်နိုင်ပါတယ်။ ဘယ်အစီအစဉ်ကို ရွေးရမလဲ မသေချာရင် သင်ဘယ်လို သုံးချင်လဲဆိုတာ ပြောပြပါ။')}</p><a className="light-link" href="#contact">{t('Talk to Digimium', 'Digimium ကို ဆက်သွယ်ရန်')} <ArrowUpRight size={19} /></a></div></div></section>
      <section id="how-it-works" className="how wrap"><div className="section-heading"><h2>{t('How to order', 'မှာယူနည်း')}</h2></div>
        <ol className="steps">{steps.map(([title, detail], i) => <li key={i}><span className="step-number">0{i + 1}</span><h3>{title}</h3><p>{detail}</p></li>)}</ol>
      </section>
      <section className="faq wrap"><h2>{t('A few things to know.', 'မေးလေ့ရှိသော မေးခွန်းများ')}</h2><div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>
      <section id="contact" className="contact wrap"><div><h2>{t('Talk to Digimium', 'Digimium ကို ဆက်သွယ်ရန်')}<span className="blue">.</span></h2><p>{t('Ask about a subscription, availability, or an existing order.', 'ဝန်ဆောင်မှု၊ ရရှိနိုင်မှု သို့မဟုတ် မှာယူပြီးသား အမှာစာအကြောင်း မေးမြန်းနိုင်ပါတယ်။')}</p></div>
        <div className="contact-actions">{telegram && <a className="button primary" href={'https://t.me/' + telegram} target="_blank" rel="noopener noreferrer"><Send size={16} />{t('Message us on Telegram', 'Telegram မှာ စာပို့ရန်')} <ArrowUpRight size={18} /></a>}
          <a className="button secondary" href={`viber://chat?number=${encodeURIComponent(settings.viber)}`}>{t('Talk to us on Viber', 'Viber မှ ဆက်သွယ်ရန်')} <ArrowUpRight size={18} /></a>
          <span className="contact-number">Viber · {settings.viberLabel}</span><a className="email" href={`mailto:${settings.email}`}><Mail size={15} />{settings.email}</a>
        </div></section>
    </main>
    <footer className="footer wrap"><a className="brand" href="#" aria-label={t('Back to top', 'အပေါ်သို့ ပြန်သွားရန်')}><img src="/assets/logo.png" alt="digimium." /></a><div><Globe2 size={14} />{t('Myanmar & English', 'မြန်မာနှင့် အင်္ဂလိပ်')}<a className="admin-link" href="/admin">{t('Manage catalog', 'စာရင်း စီမံရန်')}</a><span>© {new Date().getFullYear()} Digimium</span></div></footer>
    <ShopOrder ref={shop} products={products} lang={lang} telegram={telegram} hideShortDescriptions={hideShortDescriptions} onCountChange={setCartCount} />
  </div>;
}
