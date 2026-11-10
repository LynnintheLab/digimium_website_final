"use client";

import { useState, useRef } from "react";
import { ArrowUpRight, ArrowRight, Search, X, Menu, Check, Mail, ChevronDown, AudioLines, Sparkles, Clapperboard, PenTool, LayoutGrid, Globe2 } from "lucide-react";

import { categories as groups, type Catalog } from "../lib/catalog";

const collections = [
  {label:"Think", title:"A brighter way\nto work.", subtitle:"A little help. A lot of possibility.", names:["ChatGPT", "Gemini", "Claude"], marks:["chatgpt", "gemini", null], category:1, icon:Sparkles},
  {label:"Create",title:"An idea.\nThen anything.", subtitle:"Make room for your next great idea.", names:["Canva", "Adobe", "CapCut"],marks:["canva", "adobe", null],category:2,icon:PenTool},
  {label:"Unwind",title:"Your time.\nWell spent.",subtitle:"Press play on a little more you.",names:["Spotify", "Netflix", "YouTube"],marks:["spotify", "netflix", null],category:3,icon:AudioLines},
];
function Mark({mark,name}:{mark?:string|null;name:string}) {
  const [failed,setFailed]=useState(false);
  return mark && !failed ? <img src={`/assets/marks/${mark}.svg`} alt="" className={`service-mark mark-${mark}`} onError={()=>setFailed(true)} /> : <span className="letter-mark" aria-hidden="true">{name.slice(0,1)}</span>;
}

export default function Storefront({initialCatalog}:{initialCatalog:Catalog}) {
  const products=initialCatalog.products;
  const {email,viber,viberLabel}=initialCatalog.settings;
  const emailLink=(name:string)=>`mailto:${email}?subject=${encodeURIComponent(`Digimium enquiry — ${name}`)}&body=${encodeURIComponent(`Hi Digimium,\n\nI am interested in ${name}. Please share the available plans, current prices, duration, and activation details.\n\nThank you!`)}`;
  const [collection,setCollection]=useState(0);
  const [category,setCategory]=useState(0);
  const [query,setQuery]=useState("");
  const [all,setAll]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [menu,setMenu]=useState(false);
  const [copied,setCopied]=useState(false);
  const [copyError,setCopyError]=useState(false);
  const contact=useRef<HTMLElement>(null);
  const c=collections[collection];
  const matches=products.filter(p=>(category===0||p.category===category)&&p.name.toLowerCase().includes(query.toLowerCase().trim()));
  const featured=matches.filter(p=>p.featured);
  const visible=all||category!==0||query?matches:(featured.length?featured:matches.slice(0,6));
  const collectionProducts=products.filter(p=>p.category===c.category).slice(0,3);
  const choose=(name:string)=>{setSelected(name);setCopied(false);setCopyError(false);setTimeout(()=>contact.current?.scrollIntoView({behavior:"smooth",block:"start"}),30);};
  const copy=async()=>{try{await navigator.clipboard.writeText(`Hi Digimium, I'm interested in ${selected||"your digital services"}. Please share the available plans, prices, and activation details. Contact: ${email}`);setCopied(true);setCopyError(false);}catch{setCopied(false);setCopyError(true);}};
  return <>
    <a className="skip" href="#services">Skip to services</a>
    <header className="header wrap">
      <a className="brand" href="#" aria-label="Digimium home"><img src="/assets/logo.png" alt="digimium." /></a>
      <nav className={menu?"nav open":"nav"} aria-label="Main navigation">
        <a href="#services" onClick={()=>setMenu(false)}>Explore services</a>
        <a href="#how-it-works" onClick={()=>setMenu(false)}>How it works</a>
        <a href="#about" onClick={()=>setMenu(false)}>About us</a>
      </nav>
      <a href="#contact" className="nav-contact">Let’s talk <ArrowUpRight size={17}/></a>
      <button className="menu-button" aria-label={menu?"Close menu":"Open menu"} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button>
    </header>
    <main>
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Your digital life.<br/><span>A little more</span><br/><span className="blue">premium.</span></h1>
          <p className="hero-mm" lang="my">သင့်နေ့စဉ်ဘဝအတွက် ပိုကောင်းတဲ့<br className="desktop-break"/> ဒီဂျစ်တယ်အတွေ့အကြုံ။</p>
          <p className="hero-description">The tools you need. The entertainment you love.<br className="desktop-break"/> All together, with digimium.</p>
          <div className="hero-actions"><a className="button primary" href="#services">Explore services <ArrowUpRight size={18}/></a><a className="text-link" href="#how-it-works">How it works <ArrowRight size={17}/></a></div>
        </div>
        <div className="showcase">
          <div className="showcase-top"><span>Find your everyday upgrade.</span><img src="/assets/symbol-white.png" alt=""/></div>
          <div className="collection-switch" role="group" aria-label="Explore service collections">{collections.map((item,i)=><button key={item.label} aria-pressed={collection===i} onClick={()=>setCollection(i)}><item.icon size={15}/>{item.label}</button>)}</div>
          <div className="collection-art" key={collection}>
            <img className="portal" src="/assets/symbol-white.png" alt=""/>
            <h2>{c.title}</h2>
            <p>{c.subtitle}</p>
          </div>
          <div className="collection-bottom">{collectionProducts.map(p=><button key={p.id} onClick={()=>choose(p.name)} aria-label={`Enquire about ${p.name}`}><Mark name={p.name} mark={p.mark}/><span>{p.name}</span><ArrowUpRight size={14}/></button>)}</div>
          <button className="collection-link" onClick={()=>{setCategory(c.category);document.getElementById("services")?.scrollIntoView({behavior:"smooth"});}}>Explore {groups[c.category].toLowerCase()}<ArrowRight size={17}/></button>
        </div>
      </section>
      <div className="purpose-strip wrap"><span>One place. More possibilities.</span><div><span><Sparkles size={16}/> Work smarter</span><span><PenTool size={16}/> Create freely</span><span><Clapperboard size={16}/> Enjoy your downtime</span></div></div>
      <section id="services" className="services wrap" aria-labelledby="services-title">
        <div className="section-heading"><div><h2 id="services-title">Find your next upgrade<span className="blue">.</span></h2><p lang="my">သင်လိုအပ်တဲ့ ဝန်ဆောင်မှုကို ရွေးချယ်လိုက်ပါ။</p></div><p className="section-note">Made for the way you<br/>work, create, and unwind.</p></div>
        <div className="catalog-tools"><div className="filters" role="group" aria-label="Filter services">{groups.map((g,i)=><button key={g} aria-pressed={category===i} onClick={()=>{setCategory(i);setAll(false);}}>{i===0&&<LayoutGrid size={14}/>} {g}</button>)}</div><label className="search"><Search size={17}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a service" aria-label="Search services"/></label></div>
        <div className="catalog-grid">{visible.map(p=><button className="product" key={p.id} onClick={()=>choose(p.name)} aria-label={`Enquire about ${p.name}`}><div className="product-top"><Mark mark={p.mark} name={p.name}/><ArrowUpRight size={20}/></div><h3>{p.name}</h3><span className="product-category">{groups[p.category]}</span><p>{p.description}</p>{p.mm&&<p className="product-myanmar" lang="my">{p.mm}</p>}{p.price&&<div className="product-price">{p.price}{p.duration&&<span> / {p.duration}</span>}</div>}<span className={`availability availability-${p.availability}`}>{p.availability==="available"?"Available to order":p.availability==="unavailable"?"Currently unavailable":"Check availability"}</span><span className="product-action">{p.availability==="unavailable"?"Ask about availability":"Ask about plans"} <ArrowRight size={15}/></span></button>)}</div>
        {matches.length===0&&<div className="empty"><Search size={30}/><h3>{query?`No services found for “${query}”`:category?"No services in this category yet.":"The collection is being updated."}</h3><p>{products.length?"Try another category or reset the filters.":"Contact us to ask about current services."}</p>{products.length?<button className="button secondary" onClick={()=>{setQuery("");setCategory(0);}}>Reset filters</button>:<a className="button primary" href="#contact">Contact Digimium</a>}</div>}
        <div className="catalog-footer"><p aria-live="polite">{visible.length} of {matches.length} services <span>· Current plans & prices confirmed on enquiry</span></p>{category===0&&!query&&<button className="text-link" onClick={()=>setAll(!all)}>{all?"Show featured services":"View all services"}<ChevronDown size={17} className={all?"rotate":""}/></button>}</div>
      </section>
      <section id="about" className="about"><div className="wrap about-inner"><div className="about-heading"><img src="/assets/symbol-white.png" alt=""/><h2>Digital.<br/>Premium.<br/><span>Made simple.</span></h2></div><div className="about-copy"><p className="about-intro">More possibility.<br/>Less figuring it out.</p><p>Digimium brings premium digital tools and entertainment together in one place. Discover what fits your day, then talk to us about the right plan.</p><p lang="my">အလုပ်အတွက်ဖြစ်ဖြစ်၊ ဖန်တီးမှုအတွက်ဖြစ်ဖြစ်၊ အပန်းဖြေဖို့ပဲဖြစ်ဖြစ် — သင်လိုအပ်တာတွေကို digimium. မှာ ရှာဖွေနိုင်ပါတယ်။</p><a className="light-link" href="#contact">Let’s find your fit <ArrowUpRight size={19}/></a></div></div></section>
      <section id="how-it-works" className="how wrap"><div className="section-heading"><div><h2>A simple way to get started.</h2><p lang="my">ရွေးချယ်ပါ။ ဆက်သွယ်ပါ။ စတင်အသုံးပြုပါ။</p></div></div><ol className="steps"><li><span className="step-number">01</span><h3>Find your service.</h3><p>Browse the collection and choose the tool or entertainment service you have in mind.</p></li><li><span className="step-number">02</span><h3>Let’s find your plan.</h3><p>Contact us to confirm available plans, the latest price, duration, and payment options.</p></li><li><span className="step-number">03</span><h3>Make it part of your day.</h3><p>Once your order is confirmed, we’ll guide you through the next steps for your service.</p></li></ol></section>
      <section className="faq wrap"><h2>A few things to know.</h2><div>{[
        ["How do I place an order?","Choose a service above, then use the enquiry section to email Digimium or contact us on Viber. We’ll confirm the available plan and current price before you order."],
        ["Where can I see the prices?","Prices are shown on service cards when listed. For other options, contact us for the current plans, duration, and any account or device requirements. Confirm availability before placing an order."],
        ["Can you help me choose a plan?","Yes. Tell us the service you want, how you plan to use it, and your preferred duration. We can discuss the available options with you."],
        ["Can I pay directly on this website?","Orders are currently arranged through direct contact. This website helps you explore services and prepare an enquiry; it does not process payments."],
      ].map(([q,a])=><details key={q}><summary>{q}<ChevronDown size={18}/></summary><p>{a}</p></details>)}</div></section>
      <section id="contact" className="contact wrap" ref={contact}><div><h2>Your next upgrade<br/>starts with a hello<span className="blue">.</span></h2><p lang="my">သင်လိုအပ်တာကို ပြောပြပါ။<br/>သင့်အတွက် သင့်တော်တဲ့ plan ကို အတူရွေးချယ်ကြရအောင်။</p></div><div className="contact-actions">{selected&&<div className="selection" role="status"><div><span>YOUR SELECTED SERVICE</span><strong>{selected}</strong></div><button aria-label="Clear selected service" onClick={()=>setSelected(null)}><X size={18}/></button></div>}<a className="button primary" href={emailLink(selected||"your digital services")}>Enquire {selected?`about ${selected}`:"by email"}<ArrowUpRight size={18}/></a><a className="button secondary" href={`viber://chat?number=${encodeURIComponent(viber)}`}>Talk to us on Viber <ArrowUpRight size={18}/></a><span className="contact-number">Viber: {viberLabel}</span>{selected&&<button className="text-link copy" onClick={copy}>{copied?<><Check size={16}/> Enquiry copied</>:"Copy enquiry text"}</button>}{copyError&&<p className="copy-feedback" role="status">Copy unavailable. Use the email button to open your prepared enquiry.</p>}<a className="email" href={`mailto:${email}`}><Mail size={15}/>{email}</a></div></section>
    </main>
    <footer className="footer wrap"><a className="brand" href="#" aria-label="Back to top"><img src="/assets/logo.png" alt="digimium."/></a><span>Elevating digital services.</span><div><Globe2 size={14}/> Myanmar & English <a className="admin-link" href="/admin">Manage catalog</a><span>© {new Date().getFullYear()} Digimium</span></div></footer>
  </>;
}
