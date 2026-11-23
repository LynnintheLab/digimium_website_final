import type { WebsiteCheckout } from './payment';

export const CUSTOMER_ORDER_STATUS_LIMIT = 3;
export const TEST_ORDER_STATUS_ORIGIN = 'https://test.buywith-digimium.store';
const orderIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type CustomerOrderStatus = { id: string; stage: WebsiteCheckout['stage'] | null; rejected: boolean };
export type CustomerOrderStatusRequest = { senderId: string; chatId: string; chatType: string; text: string };
export type CustomerOrderStatusReply = {
  method: 'sendMessage'; chat_id: number; text: string;
  protect_content: true;
  link_preview_options: { is_disabled: true };
  reply_markup: { inline_keyboard: { text: string; url: string }[][] };
};

export function customerOrderStatusCommand(request: CustomerOrderStatusRequest): { orderId?: string } | null {
  if (request.chatType !== 'private' || request.senderId !== request.chatId ||
      !/^[1-9]\d{0,15}$/.test(request.senderId) || Number(request.senderId) > 2 ** 52 - 1 || request.text.length > 128) return null;
  const command = /^\/(start|status)(?:@[a-zA-Z0-9_]{5,32})?(?:\s+(order_([a-f0-9-]{36})))?\s*$/i.exec(request.text);
  if (!command || (command[2] && (command[1].toLowerCase() !== 'start' || !orderIdPattern.test(command[3])))) return null;
  return command[3] ? { orderId: command[3].toLowerCase() } : {};
}

export function customerOrderStatusLabel(order: CustomerOrderStatus) {
  if (order.rejected) return 'အော်ဒါ ငြင်းပယ်ထားသည်';
  switch (order.stage) {
    case 'quote_required': return 'ဈေးနှုန်း အတည်ပြုရန် စောင့်နေသည်';
    case 'awaiting_payment': return 'ငွေပေးချေရန်';
    case 'payment_review': return 'ငွေပေးချေမှု စစ်ဆေးနေသည်';
    case 'payment_rejected': return 'ငွေလွှဲ screenshot ပြန်စစ်ရန်';
    case 'processing': return 'ဝန်ဆောင်မှု ပြင်ဆင်နေသည်';
    case 'completed': return 'ဝန်ဆောင်မှု ပေးပြီး';
    default: return 'လက်ရှိအဆင့်ကို website မှာ ကြည့်ပါ';
  }
}

export function formatCustomerOrderStatus(senderId: string, result: { linked: boolean; orders: CustomerOrderStatus[]; requestedOrder?: boolean }): CustomerOrderStatusReply {
  const buttons: { text: string; url: string }[][] = [];
  let text: string;
  if (!result.linked) {
    text = 'ဒီ Telegram နှင့် ချိတ်ထားသော website အကောင့် မတွေ့သေးပါ။\n\nဝယ်ယူထားသော website အကောင့်ကို ဝင်ပြီး Account မှာ Telegram ချိတ်ပါ။ ချိတ်ပြီးလျှင် /status ကို ပြန်ပို့ပါ။';
    buttons.push([{ text: 'Website အကောင့်မှာ Telegram ချိတ်မယ်', url: TEST_ORDER_STATUS_ORIGIN + '/account' }]);
  } else {
    const orders = result.orders.filter(order => orderIdPattern.test(order.id)).slice(0, CUSTOMER_ORDER_STATUS_LIMIT);
    text = orders.length ? 'သင့် website အော်ဒါအဆင့်များ\n\n' + orders.map(order => `အော်ဒါ #${order.id.slice(0, 8).toUpperCase()}\n${customerOrderStatusLabel(order)}`).join('\n\n')
      : result.requestedOrder ? 'ဒီအော်ဒါကို သင်နှင့်ချိတ်ထားသော website အကောင့်မှာ မတွေ့ပါ။'
        : 'သင်နှင့်ချိတ်ထားသော website အကောင့်မှာ website မှတင်ထားသော အော်ဒါ မရှိသေးပါ။';
    for (const order of orders) buttons.push([{ text: `အော်ဒါ #${order.id.slice(0, 8).toUpperCase()} ကြည့်မယ်`, url: `${TEST_ORDER_STATUS_ORIGIN}/checkout?order=${order.id}` }]);
    buttons.push([{ text: 'အော်ဒါမှတ်တမ်းနှင့် ရရှိသောအကောင့် ကြည့်မယ်', url: TEST_ORDER_STATUS_ORIGIN + '/order-history' }]);
    text += '\n\nလက်ရှိအဆင့် ပြန်ကြည့်ရန် /status ပို့ပါ။ အကောင့်အချက်အလက်ကို website အော်ဒါမှတ်တမ်းမှာ ကြည့်နိုင်ပါတယ်။';
  }
  return { method: 'sendMessage', chat_id: Number(senderId), text, protect_content: true, link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: buttons } };
}
