type LoginNotice = {
  origin: string;
  context: string;
  created: number;
  location?: string;
  purpose?: 'login' | 'link';
};

export const TELEGRAM_LOGIN_CAPTION_LIMIT = 1024;
export function telegramLoginCaptionFits(text: string) {
  // Telegram entity offsets and our safe caption limit both use UTF-16 code units.
  return text.length <= TELEGRAM_LOGIN_CAPTION_LIMIT;
}

export function telegramLoginTitleEntities(text: string) {
  const newline = text.indexOf('\n');
  return [{ type: 'bold' as const, offset: 0, length: newline < 0 ? text.length : newline }];
}

export function telegramBrowserContext(userAgent: string) {
  const ua = userAgent.slice(0, 1000);
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? 'Edge'
    : /(?:Firefox|FxiOS)\//.test(ua) ? 'Firefox'
    : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
    : /(?:Chrome|CriOS)\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const device = /iPhone/.test(ua) ? 'iPhone'
    : /iPad|Macintosh.*Mobile/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : 'Device';
  return browser + ' · ' + device;
}

function details(notice: LoginNotice) {
  const deviceIcon = /iPhone|iPad|Android/.test(notice.context) ? '📱' : '💻';
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Yangon', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(notice.created * 1000));
  return [
    '🌐 ' + new URL(notice.origin).hostname,
    deviceIcon + ' ' + notice.context,
    '📍 ' + (notice.location ? 'နိုင်ငံ (IP ခန့်မှန်း) — ' + notice.location : 'တည်နေရာ မသိနိုင်ပါ'),
    '🕒 စတင်ချိန် — ' + time + ' MMT',
  ].join('\n');
}

function attribution(notice: LoginNotice) {
  return notice.location ? '\n\nIP Geolocation by DB-IP: https://db-ip.com' : '';
}

export function telegramLoginRequest(notice: LoginNotice) {
  return (notice.purpose === 'link' ? '🔗 လက်ရှိ Website အကောင့်နှင့် Telegram ချိတ်ရန်' : '🔐 Website အကောင့်ဝင်ရန်') + '\nDigimium\n\n' + details(notice) +
    '\n\nWebsite မှာ ပြထားတဲ့ code နဲ့ တူတဲ့ နံပါတ်ကို ရွေးပါ။' +
    '\n⏳ Code သက်တမ်း — ၅ မိနစ်' +
    (notice.purpose === 'link' ? '\n\nWebsite မှာ ဝင်ထားတဲ့ အကောင့်ရဲ့ ယခင်ဝယ်ယူမှုတွေကို ဒီ Telegram မှ ကြည့်နိုင်ပါမည်။' : '') +
    '\n\nကိုယ်တိုင် မစတင်ထားရင် အောက်က “ကျွန်ုပ် မဟုတ်ပါ” ကို နှိပ်ပါ။' + attribution(notice);
}

export function telegramLoginApproved(notice: LoginNotice) {
  return '✅ Code အတည်ပြုပြီးပါပြီ\n\n' + details(notice) +
    (notice.purpose === 'link' ? '\n\nWebsite ကို ပြန်သွားပြီး Telegram ချိတ်ဆက်ခြင်း ပြီးဆုံးအောင် စောင့်ပါ။' : '\n\nWebsite ကို ပြန်သွားပြီး အကောင့်ဝင်ခြင်း ပြီးဆုံးအောင် စောင့်ပါ။') + attribution(notice);
}

export function telegramLoginComplete(notice: LoginNotice) {
  return (notice.purpose === 'link' ? '✅ Telegram ချိတ်ဆက်ပြီးပါပြီ' : '✅ Website အကောင့်ဝင်ပြီးပါပြီ') + '\n\n' + details(notice) +
    '\n\nအော်ဒါမှတ်တမ်းနဲ့ Plan သက်တမ်းကို အောက်ကခလုတ်တွေကနေ စစ်နိုင်ပါတယ်။' +
    '\nကိုယ်တိုင် ဝင်ထားတာမဟုတ်ရင် ဆိုင်ကို ဆက်သွယ်ပါ။' + attribution(notice);
}
