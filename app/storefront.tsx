"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, Clapperboard, Globe2, LayoutGrid, Mail, Menu, PenTool, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { categories, type Catalog, type ProductPlan } from "../lib/catalog";
import { categoryName, durationDetail, durationText, planName, productDescription } from "../lib/shop-language";
import { Mark } from "./product-mark";
import { CollectionShowcase } from "./collection-showcase";
import { commerceEnabled } from "../lib/commerce-enabled";
import { resolveTelegramContact } from "../lib/telegram-contact";
import { AccountMenu } from "./account-menu";
import { ShopOrder, type ShopOrderHandle } from "./shop-order";
import { OfferPrice } from "./offer-price";
import { BestSellerBadge } from "./best-seller-badge";
import { CursorLight } from "./cursor-light";
import { ScrollRail } from "./scroll-rail";
import "./storefront-order.css";
import "./contact-links.css";
import "./order-guide.css";

type Language = 'en' | 'my';
function PlanSummary({ plan, bestSeller, id, lang }: { plan: ProductPlan; bestSeller?: ProductPlan; id: string; lang: Language }) {
  const title = planName(plan, lang);
  const duration = durationDetail(plan.duration, title, lang);
  return <div className="catalog-plan" id={id}>
    {plan.bestSeller && <BestSellerBadge lang={lang} plan />}
    <span className="catalog-plan-name">{title}</span><OfferPrice offer={plan} lang={lang}/>
    {duration && <small>{duration}</small>}
    {bestSeller && bestSeller.id !== plan.id && <div className="catalog-plan-highlight">
      <BestSellerBadge lang={lang} plan /><span className="catalog-plan-name">{planName(bestSeller, lang)}</span>
    </div>}
  </div>;
}

export default function Storefront({ initialCatalog, initialLanguage = 'en' }: { initialCatalog: Catalog; initialLanguage?: Language }) {
  const [lang, setLang] = useState<Language>(initialLanguage);
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const [category, setCategory] = useState(0);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const [cartCount, setCartCount] = useState(0);
  const [motionPaused, setMotionPaused] = useState(false);
  const shop = useRef<ShopOrderHandle>(null);
  const { products, settings } = initialCatalog;
  const hideShortDescriptions = settings.hideShortDescriptions === true;
  const telegram = resolveTelegramContact(settings);
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
    {
      title: t('Find your service.', 'လိုချင်တာကိုရှာပါ'),
      detail: <p>{t('Browse the catalog and open a product to see its plans.', 'website ထဲမှ ကိုယ်နှစ်သက်ရာ Product ကိုရှာပါ')}</p>,
    },
    {
      title: t('Choose your plan.', 'Plan ရွေးချယ်ပါ'),
      detail: lang === 'my' ? <>
        <p>ဝယ်ယူလိုသော Product ကိုနှိပ်ပြီး စိတ်ကြိုက် Plan ကိုရွေးချယ်ပါ။</p>
        <p>ပြီးလျှင် “Add to Cart” လုပ်ပြီး နောက်ထပ် လိုချင်တာကိုရှာပါ (သို့မဟုတ်) “Check Out” နှိပ်ပြီး Order တင်ပါ။</p>
        <p className="step-enquiry">ကိုယ်ဝယ်ယူလိုသော Plan (သို့မဟုတ်) Product အကြောင်း အသေးစိတ်မေးမြန်းချင်တာပဲဖြစ်ဖြစ် သိချင်တာပဲဖြစ်ဖြစ် “<a href="#contact">ဆက်သွယ်ရန်</a>” ကိုနှိပ်ပြီး Telegram မှတစ်ဆင့် စိတ်ကြိုက်မေးမြန်းလို့ရပါတယ်ခင်ဗျ။</p>
      </> : <p>Add it to your cart to keep browsing, or choose Checkout to order.</p>,
    },
    {
      title: t('Send your order.', 'Order တင်မယ်'),
      detail: commerceEnabled ? <p>{t('Sign in and continue to Telegram. Your message includes your name, email and chosen plans. Digimium arranges payment and account delivery in the chat, then updates your purchase history.', 'အကောင့်ဝင်ပြီး Telegram မှာ ဆက်မှာယူပါ။ စာထဲမှာ သင့်နာမည်၊ email နဲ့ ရွေးထားတဲ့ Plan တွေ ပါဝင်ပါတယ်။ ငွေပေးချေမှုနဲ့ service အကောင့်ရယူမှုကို Telegram မှာ ဆောင်ရွက်ပြီး ဝယ်ယူမှုမှတ်တမ်းကို Website မှာ ကြည့်နိုင်ပါတယ်။')}</p> : <p>{t('Checkout opens your full order in our Telegram chat. Tap Send and we’ll confirm availability and payment details.', 'Check Out ကိုနှိပ်တဲ့အခါမှာ Order အပြည့်အစုံ နဲ့ Telegram Chat ပွင့်လာပါမယ်။ Send ကိုနှိပ်ပြီး Order ပို့ပါ။ ကြာချိန်၊ အာမခံ နှင့် Payment အသေးစိတ်ကိုပါ တစ်ခါတည်း မေးမြန်းလို့ရပါတယ်ခင်ဗျ။')}</p>,
    },
  ];
  const faqs = [
    [t('Can I order several services together?', 'ဝန်ဆောင်မှု အများအပြားကို တစ်ခါတည်း မှာလို့ရပါသလား။'), t('Yes. Choose a plan, add it to your cart and keep browsing. Checkout includes every item in your cart.', 'ရပါတယ်။ အစီအစဉ်ကို ရွေးပြီး ဈေးခြင်းထဲ ထည့်ပါ။ မှာယူတဲ့အခါ ဈေးခြင်းထဲက ပစ္စည်းအားလုံး အမှာစာထဲမှာ ပါဝင်ပါမယ်။')],
    [t('What does “Price on enquiry” mean?', '“ဈေးနှုန်း မေးရန်” ဆိုတာ ဘာကို ဆိုလိုပါသလဲ။'), t('You can add the plan to your order. Digimium will confirm its current price before you pay.', 'အဲဒီအစီအစဉ်ကိုလည်း ဈေးခြင်းထဲ ထည့်လို့ရပါတယ်။ ငွေမပေးချေမီ လက်ရှိဈေးနှုန်းကို Digimium က ပြောပြပါမယ်။')],
    commerceEnabled ? [t('Where can I check my order?', 'ကျွန်တော့်အော်ဒါကို ဘယ်မှာကြည့်ရမလဲ။'), t('Open Account to check your saved orders and reopen their Telegram messages. After confirmation in Telegram, Digimium updates your purchase history and subscription dates.', 'Account ကိုနှိပ်ပြီး သိမ်းထားတဲ့ အော်ဒါတွေကို ကြည့်နိုင်သလို Telegram စာကိုလည်း ပြန်ဖွင့်နိုင်ပါတယ်။ Telegram မှာ အတည်ပြုပြီးတဲ့အခါ Digimium က ဝယ်ယူမှုမှတ်တမ်းနဲ့ သက်တမ်းရက်စွဲတွေကို ဖြည့်ပေးပါမယ်။')] :
    [t('When do I pay?', 'ဘယ်အချိန်မှာ ငွေပေးချေရမလဲ။'), t('Digimium will confirm your plan, price and payment options in Telegram after you send the order.', 'အမှာစာ ပို့ပြီးမှ ရွေးထားတဲ့ အစီအစဉ်၊ ဈေးနှုန်းနဲ့ ငွေပေးချေနိုင်တဲ့ နည်းလမ်းတွေကို Telegram မှာ အတည်ပြုပေးပါမယ်။')],
  ];

  return <div className="storefront-shell" lang={lang}>
    <CursorLight paused={motionPaused} />
    <a className="skip" href="#services">{t('Skip to services', 'Product စာရင်းသို့ သွားရန်')}</a>
    <ScrollRail lang={lang} />
    <header ref={header} className="header wrap">
      <a className="brand" href="#" aria-label={t('Digimium home', 'Digimium ပင်မစာမျက်နှာ')}><img src="/assets/logo.png" alt="digimium." /></a>
      <nav id="shop-nav" className={menu ? 'nav open' : 'nav'} aria-label={t('Main navigation', 'ပင်မမီနူး')}>
        <a href="#services" onClick={() => setMenu(false)}>{t('Explore services', 'Product များ')}</a>
        <a href="#how-it-works" onClick={() => setMenu(false)}>{t('How to order', 'ဘယ်လိုဝယ်ယူရမလဲ')}</a>
        <a href="#contact" onClick={() => setMenu(false)}>{t('Contact', 'ဆက်သွယ်ရန်')}</a>
      </nav>
      <div className="shop-header-tools">
        <div className="shop-language" role="group" aria-label={t('Language', 'ဘာသာစကား')}>
          <button type="button" aria-label="English" aria-pressed={lang === 'en'} onClick={() => switchLanguage('en')} lang="en">EN</button>
          <button type="button" aria-label="မြန်မာ" aria-pressed={lang === 'my'} onClick={() => switchLanguage('my')} lang="my">မြန်မာ</button>
        </div>
        {commerceEnabled && <AccountMenu lang={lang} onOpen={() => setMenu(false)} />}
        <button type="button" className="shop-cart-button" aria-label={cartLabel + ' (' + cartCount + ')'} onClick={() => { setMenu(false); shop.current?.openCart(); }}>
          <ShoppingBag size={18} /><span className="shop-cart-word">{cartLabel}</span><span className="shop-cart-count">{cartCount}</span>
        </button>
      </div>
      <button ref={menuButton} type="button" className="menu-button" aria-controls="shop-nav" aria-label={menu ? t('Close menu', 'မီနူး ပိတ်ရန်') : t('Open menu', 'မီနူး ဖွင့်ရန်')} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
    </header>
    <main>
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">{t('Your digital life.', 'သင့်နေစဥ်ဘဝ အတွက်')}<br /><span>{t('A little more', 'စိတ်လှုပ်ရှားစရာ')}</span><br /><span className="blue">{t('premium.', 'Digital ခံစားမှုများ')}</span></h1>
          <p className="hero-description">{t('Discover subscriptions for work, creativity, and entertainment. Choose a plan and order through Digimium on Telegram.', 'အလုပ်အတွက်၊ ကျောင်းအတွက်၊ အပန်းဖြေဖို့အတွက် သင့်တော်တဲ့ ဝန်ဆောင်မှုတွေကို စိတ်ကြိုက်ရွေးချယ်ဝယ်ယူနိုင်ပါသည်။')}</p>
          <div className="hero-actions"><a className="button primary" href="#services">{t('Explore services', 'ပစ္စည်းများ ကြည့်ရန်')} <ArrowUpRight size={18} /></a><a className="text-link" href="#how-it-works">{t('How to order', 'ဘယ်လိုဝယ်ယူရမလဲ')} <ArrowRight size={17} /></a></div>
        </div>
        <CollectionShowcase products={products} lang={lang} motionPaused={motionPaused} onCategory={showCategory}
          onProduct={(product, planId) => shop.current?.openProduct(product, planId)} />
      </section>
      <div className="purpose-strip wrap"><span>{t('One place. More possibilities.', 'တစ်နေရာတည်းမှာ အားလုံးကို စိတ်ကြိုက်ရွေးချယ်လို့ရပါပြီ')}</span><div><span><Sparkles size={16} />{t('Work smarter', 'အလုပ်အတွက်')}</span><span><PenTool size={16} />{t('Create freely', 'ဖန်တီးဖို့')}</span><span><Clapperboard size={16} />{t('Enjoy your downtime', 'အပန်းဖြေဖို့')}</span></div></div>
      <section id="services" className="services wrap" aria-labelledby="services-title">
        <div className="section-heading"><h2 id="services-title">{t('Find your next upgrade', 'သင့်အတွက် ဝန်ဆောင်မှုများ')}{lang === 'en' && <span className="blue">.</span>}</h2></div>
        <div className="catalog-tools">
          <div className="filters" role="group" aria-label={t('Filter services', 'အမျိုးအစား ရွေးရန်')}>{categories.map((name, i) => <button key={name} aria-pressed={category === i} onClick={() => { setCategory(i); setAll(i === 0); }}>{i === 0 && <LayoutGrid size={14} />} {categoryName(i, lang)}</button>)}</div>
          <label className="search"><Search size={19} /><input type="search" enterKeyHint="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} placeholder={t('Find a product or plan', 'Product (သို့) Plan ရှာမယ်')} aria-label={t('Search products and plans', 'Product (သို့) Plan ရှာမယ်')} />{query && <button className="clear-search" type="button" aria-label={t('Clear search', 'ရှာဖွေမှု ရှင်းရန်')} onClick={() => setQuery('')}><X size={18}/></button>}</label>
        </div>
        <div className="catalog-grid">{visible.map(product => {
          const firstPlan = product.plans?.find(plan => plan.published);
          const bestSellerPlan = product.plans?.find(plan => plan.published && plan.bestSeller);
          const badgeId = product.bestSeller ? `product-badge-${product.id}` : undefined;
          const summaryId = firstPlan ? `product-summary-${product.id}` : undefined;
          return <button className="product" type="button" key={product.id} onClick={() => shop.current?.openProduct(product)} aria-label={product.name + ' · ' + t('View plans', 'Plan များ ကြည့်ရန်')}
            aria-describedby={[badgeId, summaryId].filter(Boolean).join(' ') || undefined}>
            <div className="product-top"><Mark product={product} />{product.bestSeller && <BestSellerBadge lang={lang} id={badgeId} />}<ArrowUpRight size={20} /></div>
            <h3>{product.name}</h3><span className="product-category">{categoryName(product.category, lang)}</span>
            {!hideShortDescriptions && <p>{productDescription(product, lang)}</p>}
            {firstPlan && summaryId ? <PlanSummary plan={firstPlan} bestSeller={bestSellerPlan} id={summaryId} lang={lang} /> : (product.price || product.duration) && <div className="product-price">
              <OfferPrice offer={product} lang={lang}/>{product.duration && <span> / {durationText(product.duration, lang)}</span>}
            </div>}
            {product.availability === 'unavailable' && <span className="availability availability-unavailable">{t('Currently unavailable', 'လောလောဆယ် မရနိုင်ပါ')}</span>}
            <span className="product-action">{t('View plans', 'Plan များ ကြည့်ရန်')} <ArrowRight size={15} /></span>
          </button>;
        })}</div>
        {!matches.length && <div className="empty"><Search size={30} /><h3>{t('No matching services', 'ကိုက်ညီသော Product မတွေ့ပါ')}</h3><button className="button secondary" onClick={() => { setQuery(''); setCategory(0); setAll(true); }}>{t('Show all services', 'Product အားလုံး ကြည့်ရန်')}</button></div>}
        <div className="catalog-footer"><p aria-live="polite" lang="en">{visible.length} of {matches.length} services</p>
          {category === 0 && !query && matches.length > featured.length && <button className="text-link" onClick={() => setAll(!all)}>{all ? t('Show featured services', 'ရွေးချယ်ထားသော Product များ ကြည့်ရန်') : t(`Browse all ${products.length} services`, `Product ${products.length} ခုလုံး ကြည့်ရန်`)}<ChevronDown size={17} className={all ? 'rotate' : ''} /></button>}
        </div>
      </section>
      <section id="about" className="about">
        <div className="wrap about-inner">
          <div className="about-heading">
            <img src="/assets/symbol-white.png" alt="" />
            <h2 lang="en">Digital.<br />Premium.<br /><span>Make Simple.</span></h2>
          </div>
          <div className="about-copy">
            <p className="about-intro">{t('More possibility. Less figuring it out.', 'digimium. မှာ Digital Tools များ နဲ့ အပန်းဖြေစရာ ဝန်ဆောင်မှုအစုံကို တစ်နေရာတည်းမှာ စိတ်ကြိုက်ရွေးချယ်နိုင်ပါတယ်။')}</p>
            <p>{t('Digimium brings digital tools and entertainment together. If you need help choosing a subscription, tell us how you plan to use it.', 'ဘယ်လိုဝယ်ယူရမလဲ၊ ဘယ် AI က ကိုယ်အတွက်သင့်တော်မလဲ မသိဘူဆိုရင်တော့ “digimium. ကို ဆက်သွယ်ရန်” ကိုနှိပ်ပြီး အသေးစိတ် မေးမြန်းတိုင်ပင်လို့ရပါတယ်ခင်ဗျ။')}</p>
            <a className="light-link" href="#contact">{t('Talk to Digimium', 'digimium. ကို ဆက်သွယ်ရန်')} <ArrowUpRight size={19} /></a>
          </div>
        </div>
      </section>
      <section id="how-it-works" className="how wrap">
        <div className="section-heading"><h2>{t('How to order', 'ဘယ်လိုဝယ်ယူရမလဲ')}</h2></div>
        <ol className="steps">
          {steps.map(({title, detail}, i) => <li key={i}>
            <span className="step-number" aria-hidden="true">0{i + 1}</span>
            <h3>{title}</h3>
            <div className="step-detail">{detail}</div>
          </li>)}
        </ol>
      </section>
      <section className="faq wrap"><h2>{t('A few things to know.', 'မေးလေ့ရှိသော မေးခွန်းများ')}</h2><div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>
      <section id="contact" className="contact wrap"><div><h2>{t('Talk to Digimium', 'digimium. ကို ဆက်သွယ်ရန်')}{lang === 'en' && <span className="blue">.</span>}</h2><p>{t('Ask about a subscription, availability, or an existing order.', 'ဝန်ဆောင်မှု၊ ရရှိနိုင်မှု သို့မဟုတ် မှာယူပြီးသား အမှာစာအကြောင်း မေးမြန်းနိုင်ပါတယ်။')}</p></div>
        <div className="contact-actions">
          {telegram && <a className="button contact-link contact-telegram" href={'https://t.me/' + telegram} target="_blank" rel="noopener noreferrer">
            <img src="/assets/marks/telegram.svg" width="26" height="26" alt="" />
            <span>{t('Message us on Telegram', 'Telegram မှာ စာပို့ရန်')}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>}
          <a className="button contact-link contact-viber" href={`viber://chat?number=${encodeURIComponent(settings.viber)}`}>
            <img src="/assets/marks/viber.svg" width="26" height="26" alt="" />
            <span>{t('Talk to us on Viber', 'Viber မှ ဆက်သွယ်ရန်')}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
          <span className="contact-number">Viber · {settings.viberLabel}</span><a className="email" href={`mailto:${settings.email}`}><Mail size={15} />{settings.email}</a>
        </div></section>
    </main>
    <footer className="footer wrap"><a className="brand" href="#" aria-label={t('Back to top', 'အပေါ်သို့ ပြန်သွားရန်')}><img src="/assets/logo.png" alt="digimium." /></a><div><Globe2 size={14} />{t('Myanmar & English', 'မြန်မာနှင့် အင်္ဂလိပ်')}
      <button type="button" className="store-motion-control" onClick={() => setMotionPaused(paused => !paused)}>
        {motionPaused ? t('Resume motion', 'လှုပ်ရှားမှု ပြန်ဖွင့်ရန်') : t('Pause motion', 'လှုပ်ရှားမှု ရပ်ရန်')}
      </button>
      <a className="admin-link" href="/admin">{t('Manage catalog', 'စာရင်း စီမံရန်')}</a><span>© {new Date().getFullYear()} Digimium</span></div></footer>
    <ShopOrder ref={shop} products={products} lang={lang} telegram={telegram} hideShortDescriptions={hideShortDescriptions} onCountChange={setCartCount} />
  </div>;
}
