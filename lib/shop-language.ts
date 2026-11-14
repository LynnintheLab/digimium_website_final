import type { Product, ProductPlan } from './catalog';

export type ShopLanguage = 'en' | 'my';

export function preferredShopLanguage(preference?: string): ShopLanguage {
  return preference === 'en' ? 'en' : 'my';
}

const categoryLabels = [
  ['All services', 'ဝန်ဆောင်မှုအားလုံး'],
  ['AI & productivity', 'AI နှင့် Tools များ'],
  ['Design & creativity', 'ဒီဇိုင်းနှင့် ဖန်တီးမှု'],
  ['Music & entertainment', 'ဂီတနှင့် ဖျော်ဖြေရေး'],
  ['Everyday essentials', 'နေ့စဉ်သုံး ဝန်ဆောင်မှုများ'],
] as const;

export function categoryName(index: number, lang: ShopLanguage): string {
  const label = categoryLabels[index];
  return label?.[lang === 'my' ? 1 : 0] ?? '';
}

// Key translations by the original copy. Edited descriptions without a Myanmar
// version must still show the owner's latest wording.
const seedDescriptions = new Map<string, string>([
  ['A fresh perspective for your questions, ideas, and everyday work.', 'မေးခွန်းတွေ ဖြေရှင်းဖို့၊ အကြံဉာဏ်ထုတ်ဖို့နဲ့ နေ့စဉ်အလုပ်တွေအတွက် AI အကူအညီ ရယူနိုင်ပါတယ်။'],
  ['From the first idea to the final design. Make something yours.', 'သင့်စိတ်ကူးကို ကိုယ်ပိုင်ဒီဇိုင်းအဖြစ် ဖန်တီးနိုင်ပါတယ်။'],
  ['Your favourite artists. Your next discovery. Your daily soundtrack.', 'နှစ်သက်တဲ့ အနုပညာရှင်တွေရဲ့ သီချင်းတွေကို နားဆင်ရင်း သီချင်းသစ်တွေ ရှာဖွေနိုင်ပါတယ်။'],
  ['Explore ideas, learn something new, and move your projects forward.', 'စိတ်ကူးသစ်တွေ ရှာဖွေဖို့၊ လေ့လာဖို့နဲ့ လုပ်လက်စအလုပ်တွေ ရှေ့ဆက်ဖို့ AI အကူအညီ ရယူနိုင်ပါတယ်။'],
  ['Bring your creative vision to life, from images to moving pictures.', 'ဓာတ်ပုံကနေ ဗီဒီယိုအထိ သင့်စိတ်ကူးအတိုင်း ဖန်တီးနိုင်ပါတယ်။'],
  ['Find your next story for a night in, a day off, or just one more episode.', 'အိမ်မှာ အနားယူရင်း ကြည့်ရှုဖို့ ရုပ်ရှင်နဲ့ ဇာတ်လမ်းတွဲတွေ ရွေးချယ်နိုင်ပါတယ်။'],
  ['An AI assistant for writing, thinking, and working through ideas.', 'စာရေးဖို့၊ အကြောင်းအရာတွေ စဉ်းစားဖို့နဲ့ စိတ်ကူးတွေကို ပုံဖော်ဖို့ ကူညီပေးတဲ့ AI ဖြစ်ပါတယ်။'],
  ['Explore AI-assisted coding for your next project.', 'သင့်ပရောဂျက်အတွက် AI အကူအညီနဲ့ ကုဒ်ရေးနိုင်ပါတယ်။'],
  ['Explore questions and discover information for your research.', 'သုတေသနအတွက် မေးခွန်းတွေ မေးပြီး လိုအပ်တဲ့ အချက်အလက်တွေ ရှာဖွေနိုင်ပါတယ်။'],
  ['Explore another perspective with an AI assistant.', 'အကြောင်းအရာတစ်ခုကို တခြားရှုထောင့်ကနေ ကြည့်နိုင်ဖို့ AI နဲ့ ဆွေးနွေးနိုင်ပါတယ်။'],
  ['Turn your footage into videos worth sharing.', 'ရိုက်ကူးထားတဲ့ ဗီဒီယိုတွေကို စိတ်ကြိုက် တည်းဖြတ်မျှဝေနိုင်ပါတယ်။'],
  ['Discover resources for your next creative project.', 'ဒီဇိုင်းဖန်တီးဖို့ လိုအပ်တဲ့ ပုံတွေနဲ့ အခြားအရင်းအမြစ်တွေ ရှာဖွေနိုင်ပါတယ်။'],
  ['Photo editing tools for your personal creative touch.', 'ဓာတ်ပုံတွေကို ကိုယ်ပိုင်စတိုင်နဲ့ ပြုပြင်နိုင်ပါတယ်။'],
  ['Explore music creation with AI.', 'AI အကူအညီနဲ့ ကိုယ်ပိုင်တေးဂီတ ဖန်တီးနိုင်ပါတယ်။'],
  ['Find the music that fits your moment.', 'ကိုယ့်စိတ်ခံစားချက်နဲ့ လိုက်ဖက်တဲ့ သီချင်းတွေ ရှာဖွေနားဆင်နိုင်ပါတယ်။'],
  ['Explore premium options for your everyday viewing.', 'နေ့စဉ် YouTube ကြည့်ရှုဖို့ ရရှိနိုင်တဲ့ Premium အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Find something new to play in your downtime.', 'အားလပ်ချိန်မှာ ဆော့ကစားဖို့ ဂိမ်းသစ်တွေ ရှာဖွေနိုင်ပါတယ်။'],
  ['Stay connected for meetings, lessons, and collaboration.', 'အစည်းအဝေးတွေ၊ သင်ခန်းစာတွေနဲ့ အဖွဲ့လိုက်လုပ်ငန်းတွေအတွက် အွန်လိုင်းမှာ တွေ့ဆုံနိုင်ပါတယ်။'],
  ['Bring notes, plans, and projects into one workspace.', 'မှတ်စုတွေ၊ အစီအစဉ်တွေနဲ့ ပရောဂျက်တွေကို တစ်နေရာတည်းမှာ စီမံနိုင်ပါတယ်။'],
  ['Make learning a language part of your day.', 'နေ့စဉ် အချိန်ပေးပြီး ဘာသာစကားအသစ် လေ့လာနိုင်ပါတယ်။'],
  ['Ask about available VPN services and compatible devices.', 'ရရှိနိုင်တဲ့ VPN ဝန်ဆောင်မှုတွေနဲ့ အသုံးပြုနိုင်တဲ့ စက်အမျိုးအစားတွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Everyday tools for documents, spreadsheets, and presentations.', 'စာရွက်စာတမ်း၊ စာရင်းဇယားနဲ့ တင်ပြချက်တွေ ပြုလုပ်ဖို့ လိုအပ်တဲ့ ကိရိယာတွေကို အသုံးပြုနိုင်ပါတယ်။'],
  ['Explore Quillbot options for writing and editing.', 'စာရေးသားတာနဲ့ စာပြင်ဆင်တာတွေအတွက် Quillbot အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Explore Manus plans and ask about available options.', 'ရရှိနိုင်တဲ့ Manus အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Explore Gamma plans for presentations and documents.', 'တင်ပြချက်တွေနဲ့ စာရွက်စာတမ်းတွေ ဖန်တီးဖို့ Gamma အစီအစဉ်တွေကို ရွေးချယ်နိုင်ပါတယ်။'],
  ['Explore Kling AI plans for creative projects.', 'သင့်ဖန်တီးမှုလုပ်ငန်းတွေအတွက် Kling AI အစီအစဉ်တွေကို လေ့လာနိုင်ပါတယ်။'],
  ['Ask about GitHub Copilot plans for your coding workflow.', 'ကုဒ်ရေးသားရာမှာ အသုံးပြုဖို့ GitHub Copilot အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Explore Higgsfield plans for creative projects.', 'သင့်ဖန်တီးမှုလုပ်ငန်းတွေအတွက် Higgsfield အစီအစဉ်တွေကို လေ့လာနိုင်ပါတယ်။'],
  ['Explore Runway plans for video and creative work.', 'ဗီဒီယိုနဲ့ တခြားဖန်တီးမှုလုပ်ငန်းတွေအတွက် Runway အစီအစဉ်တွေကို လေ့လာနိုင်ပါတယ်။'],
  ['Explore HeyGen plans for video projects.', 'ဗီဒီယိုဖန်တီးဖို့ HeyGen အစီအစဉ်တွေကို လေ့လာနိုင်ပါတယ်။'],
  ['Explore Midjourney plans for image creation.', 'ပုံတွေဖန်တီးဖို့ Midjourney အစီအစဉ်တွေကို ရွေးချယ်နိုင်ပါတယ်။'],
  ['Ask about available AI API services and rates.', 'ရရှိနိုင်တဲ့ AI API ဝန်ဆောင်မှုတွေနဲ့ အသုံးပြုခနှုန်းထားတွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available HBO Max plans.', 'ရရှိနိုင်တဲ့ HBO Max အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Explore Prime Video options for your next watch.', 'ရုပ်ရှင်နဲ့ ဇာတ်လမ်းတွဲတွေ ကြည့်ရှုဖို့ Prime Video အစီအစဉ်တွေကို လေ့လာနိုင်ပါတယ်။'],
  ['Ask about available Disney+ plans.', 'ရရှိနိုင်တဲ့ Disney+ အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available iQIYI plans.', 'ရရှိနိုင်တဲ့ iQIYI အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about Figma options for your design workflow.', 'ဒီဇိုင်းဆွဲဖို့ ရရှိနိုင်တဲ့ Figma အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about Picsart options for photo editing and design.', 'ဓာတ်ပုံပြင်ဆင်ဖို့နဲ့ ဒီဇိုင်းဆွဲဖို့ Picsart အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available Google storage plans.', 'Google မှာ ဖိုင်တွေသိမ်းဖို့ ရရှိနိုင်တဲ့ သိုလှောင်မှုပမာဏနဲ့ အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Explore Telegram Premium subscription durations.', 'Telegram Premium အတွက် ရွေးချယ်နိုင်တဲ့ သက်တမ်းတွေကို ကြည့်နိုင်ပါတယ်။'],
  ['Ask about available Windows license options.', 'ရရှိနိုင်တဲ့ Windows လိုင်စင်အမျိုးအစားတွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available iCloud+ storage plans.', 'iCloud+ မှာ ဖိုင်တွေသိမ်းဖို့ ရရှိနိုင်တဲ့ သိုလှောင်မှုအစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Explore Grammarly plans for your writing workflow.', 'သင့်စာရေးသားမှုအတွက် Grammarly အစီအစဉ်တွေကို လေ့လာနိုင်ပါတယ်။'],
  ['Ask about available LinkedIn Premium plans.', 'ရရှိနိုင်တဲ့ LinkedIn Premium အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available Coursera Plus plans.', 'ရရှိနိုင်တဲ့ Coursera Plus အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available Scribd plans.', 'ရရှိနိုင်တဲ့ Scribd အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available Turnitin options.', 'ရရှိနိုင်တဲ့ Turnitin ဝန်ဆောင်မှုတွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available Udemy learning options.', 'Udemy မှာ လေ့လာနိုင်တဲ့ သင်တန်းတွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Explore ExpressVPN options for phones and laptops.', 'ဖုန်းနဲ့ လက်ပ်တော့မှာ အသုံးပြုဖို့ ExpressVPN အစီအစဉ်တွေကို လေ့လာနိုင်ပါတယ်။'],
  ['Explore VPN key options by device allowance and data amount.', 'အသုံးပြုမယ့် စက်အရေအတွက်နဲ့ ဒေတာပမာဏအလိုက် VPN Key ကို ရွေးချယ်နိုင်ပါတယ်။'],
  ['Ask about available Discord Nitro plans.', 'ရရှိနိုင်တဲ့ Discord Nitro အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available Steam Wallet options.', 'ရရှိနိုင်တဲ့ Steam Wallet ငွေဖြည့်နည်းတွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about available PlayStation Plus plans.', 'ရရှိနိုင်တဲ့ PlayStation Plus အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
  ['Ask about supported games and available top-up options.', 'ငွေဖြည့်လို့ရတဲ့ ဂိမ်းတွေနဲ့ ရရှိနိုင်တဲ့ ငွေဖြည့်အစီအစဉ်တွေကို စုံစမ်းနိုင်ပါတယ်။'],
]);

export function productDescription(product: Product, lang: ShopLanguage): string {
  if (lang === 'en') return product.description;
  return product.mm?.trim() || seedDescriptions.get(product.description) || product.description;
}

const units: Record<string, string> = { month: 'လ', week: 'ပတ်', day: 'ရက်', year: 'နှစ်' };

function translateDurations(text: string): string {
  return text
    .replace(/\b(\d+)\s*(month|week|day|year)s?\b/gi, (_, amount: string, unit: string) => amount + ' ' + units[unit.toLowerCase()])
    .replace(/\b(\d+)\s+(လ|ပတ်|ရက်|နှစ်)\s+free\b/gi, '$1 $2 လက်ဆောင်');
}

export function durationText(raw: string, lang: ShopLanguage): string {
  return lang === 'my' ? translateDurations(raw) : raw;
}

export function priceOnEnquiry(raw: string): boolean {
  const price = raw.trim();
  return !price || /^price on (?:enquiry|inquiry)$/i.test(price) || price === 'ဈေးနှုန်း စုံစမ်းရန်';
}

export function priceText(raw: string, lang: ShopLanguage): string {
  if (priceOnEnquiry(raw)) {
    return lang === 'my' ? 'ဈေးနှုန်း စုံစမ်းရန်' : 'Price on enquiry';
  }
  const price = raw.trim();
  if (lang === 'en') return price;
  return price.replace(/\b(MMK|Ks)\b/gi, 'ကျပ်');
}

export function planName(plan: ProductPlan, lang: ShopLanguage): string {
  if (lang === 'en') return plan.name;
  const english = plan.name.trim();
  const fixed: Record<string, string> = {
    'plan details on enquiry': 'အစီအစဉ်အသေးစိတ် စုံစမ်းရန်',
    'other plans — price on enquiry': 'အခြားအစီအစဉ်များအတွက် ဈေးနှုန်း စုံစမ်းရန်',
    '1 usd rate': '1 USD အတွက် နှုန်းထား',
    'over 100 usd rate': '100 USD အထက်အတွက် နှုန်းထား',
  };
  const exactTranslation = fixed[english.toLowerCase()];
  if (typeof exactTranslation === 'string') return exactTranslation;

  let translated = translateDurations(english);
  const monthDuration = /^(\d+)\s+months?$/i.exec(plan.duration.trim());
  if (monthDuration) {
    // The export abbreviates Spotify's "1 month" as "1m" in plan titles.
    translated = translated.replace(/\b(\d+)m\b/g, (label, months: string) =>
      months === monthDuration[1] ? months + ' လ' : label);
  }
  return translated
    .replace(/\bofficial own mail\b/gi, 'ကိုယ်ပိုင်အီးမေးလ်ဖြင့် တရားဝင်အသုံးပြုခွင့်')
    .replace(/\bown mail\b/gi, 'ကိုယ်ပိုင်အီးမေးလ်ဖြင့်')
    .replace(/\bprovided account\b/gi, 'ဆိုင်မှ ပေးသောအကောင့်')
    .replace(/\b(\d+)\s+devices?\b/gi, 'စက် $1 လုံး')
    .replace(/\b(\d+)\s+slots?\b/gi, '$1 ဦးစာ')
    .replace(/\bphone\b/gi, 'ဖုန်း')
    .replace(/\blaptop\b/gi, 'လက်ပ်တော့')
    .replace(/\bmyanmar region\b/gi, 'မြန်မာဒေသ')
    .replace(/\bplan\b/gi, 'အစီအစဉ်');
}

export function durationDetail(raw: string, displayedName: string, lang: ShopLanguage): string {
  const duration = durationText(raw, lang);
  if (!duration) return '';
  // Match complete words so a title containing "12 months" cannot hide "2 months".
  const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  return (' ' + words(displayedName) + ' ').includes(' ' + words(duration) + ' ') ? '' : duration;
}
