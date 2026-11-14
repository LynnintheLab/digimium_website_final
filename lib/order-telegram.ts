import { orderMessages } from './cart-order.ts';
import type { TelegramCheckout, TelegramOrder } from './commerce-types';
import { durationDetail, priceText, type ShopLanguage } from './shop-language.ts';

export function orderTelegramMessages(order: TelegramOrder, customer: TelegramCheckout['customer'], lang: ShopLanguage): string[] {
  const my = lang === 'my';
  const header = [
    my ? 'မင်္ဂလာပါ Digimium၊ ဒီဝန်ဆောင်မှုတွေကို မှာယူချင်ပါတယ်။' : 'Hi Digimium, I’d like to order the following.',
    (my ? 'အော်ဒါအမှတ်' : 'Order') + ' #' + order.id.toUpperCase(),
    customer.name && (customer.guest ? (my ? 'နာမည်' : 'Name') : (my ? 'အကောင့်နာမည်' : 'Account name')) + ' — ' + customer.name,
    customer.guest ? (my ? 'အကောင့်မသုံးဘဲ မှာယူခြင်း' : 'Guest order')
      : (my ? 'အီးမေးလ်' : 'Email') + ' — ' + customer.email,
  ].filter(Boolean).join('\n');
  const rows = order.lines.map(line => {
    const duration = durationDetail(line.duration, line.planName || '', lang);
    const offer = [line.productName, line.planName, duration].filter(Boolean).join(' · ');
    return line.quantity + ' × ' + offer + ' — ' + priceText(line.price, lang);
  });
  const total = order.totalMmk === null
    ? my ? 'စုစုပေါင်းဈေးနှုန်းကို အတည်ပြုပေးပါ။' : 'Please confirm the total price.'
    : (my ? 'စုစုပေါင်း — ' : 'Total — ') + priceText(order.totalMmk.toLocaleString('en-US') + ' MMK', lang);
  return orderMessages(header, rows, total, (part, count) => my ? `အပိုင်း ${part} / ${count}` : `Part ${part} of ${count}`);
}
