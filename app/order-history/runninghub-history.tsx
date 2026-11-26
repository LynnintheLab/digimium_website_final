import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { CommerceOrder } from '@/lib/commerce-types';
import type { RunningHubHistoryOrder } from '@/lib/runninghub-history';
import type { ShopLanguage } from '@/lib/shop-language';
import { priceText } from '@/lib/shop-language';
import './runninghub-history.css';

type Translate = (en: string, my: string) => string;
export type HistoryEntry = { kind: 'commerce'; order: CommerceOrder } | { kind: 'runninghub'; order: RunningHubHistoryOrder };

export function mergeHistory(orders: CommerceOrder[], runningHub: RunningHubHistoryOrder[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [...orders.map(order => ({ kind: 'commerce' as const, order })),
    ...runningHub.map(order => ({ kind: 'runninghub' as const, order }))];
  return entries.sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt) || a.order.id.localeCompare(b.order.id));
}

export function runningHubHistoryStatus(order: RunningHubHistoryOrder, t: Translate) {
  switch (order.status) {
    case 'approved': return t('API key ready', 'API Key ရပါပြီ');
    case 'payment_review': return t('Payment under review', 'ငွေပေးချေမှု စစ်ဆေးနေသည်');
    case 'awaiting_payment': return t('Awaiting payment', 'ငွေပေးချေရန်');
    case 'expired': return t('Reservation expired', 'သီးသန့်ထားပေးချိန် ကုန်သွားပါပြီ');
    case 'rejected': return t('Payment not approved', 'ငွေပေးချေမှု အတည်မပြုပါ');
  }
}

export function RunningHubHistoryCard({ order, lang, t }: { order: RunningHubHistoryOrder; lang: ShopLanguage; t: Translate }) {
  const status = order.status === 'approved' ? 'approved' : ['rejected', 'expired'].includes(order.status) ? 'rejected' : 'pending';
  return <article className="customer-order customer-runninghub-order" data-status={status}>
    <div className="customer-order-meta"><div>
      <h3>{t('Order', 'အော်ဒါ')} <bdi>#{order.id.slice(0, 8).toUpperCase()}</bdi></h3>
      <time dateTime={order.createdAt}>{new Intl.DateTimeFormat(lang === 'my' ? 'my-MM' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Yangon' }).format(new Date(order.createdAt))}</time>
    </div><span className="customer-order-status">{runningHubHistoryStatus(order, t)}</span></div>
    <div className="customer-product-heading"><span className="customer-product-logo" aria-hidden="true"><Image src="/assets/marks/runninghub.png" width={28} height={28} alt="" unoptimized/></span><div className="customer-product-copy">
      <div className="customer-item-title"><strong>Running HUB API Key</strong></div><p className="customer-item-plan">{order.packLabel}</p>
    </div></div>
    <div className="customer-total"><span>{t('Order total', 'စုစုပေါင်း')}</span><strong>{priceText(order.priceMmk.toLocaleString('en-US') + ' MMK', lang)}</strong></div>
    <p className="customer-runninghub-help">{order.status === 'approved'
      ? t('Your key is ready in your purchase details.', 'သင့် API Key ကို အော်ဒါအချက်အလက်မှာ ရယူနိုင်ပါတယ်။')
      : order.status === 'payment_review' ? t('Your receipt is saved and awaiting payment approval.', 'Screenshot သိမ်းပြီးပါပြီ။ ငွေပေးချေမှု အတည်ပြုရန် စောင့်နေပါတယ်။')
      : order.status === 'awaiting_payment' ? t('Open your order to check the reservation and payment steps.', 'သီးသန့်ထားပေးချိန်နှင့် ငွေပေးချေရန် အဆင့်များကို အော်ဒါထဲမှာ ကြည့်ပါ။')
      : t('Open your order for its latest status and next steps.', 'နောက်ဆုံးအခြေအနေနှင့် ဆက်လုပ်ရမည့်အဆင့်များကို အော်ဒါထဲမှာ ကြည့်ပါ။')}</p>
    <a className="customer-runninghub-link" href={`/runninghub?order=${order.id}`}>
      {order.status === 'approved' ? t('View API key', 'API Key ကြည့်ရန်') : t('View order', 'အော်ဒါ ကြည့်ရန်')}<ArrowRight size={16} aria-hidden="true"/>
    </a>
  </article>;
}

export function RunningHubRecentPurchase({ order, t, onClose }: { order: RunningHubHistoryOrder; t: Translate; onClose?: () => void }) {
  return <li className="customer-recent-brief"><a className="customer-runninghub-preview" href={`/runninghub?order=${order.id}`} onClick={onClose}>
    <span className="customer-product-logo" aria-hidden="true"><Image src="/assets/marks/runninghub.png" width={28} height={28} alt="" unoptimized/></span><span className="customer-recent-copy">
      <strong>Running HUB API Key</strong><span className="customer-item-plan">{order.packLabel}</span><span className="customer-runninghub-ready">{t('View API key', 'API Key ကြည့်ရန်')}</span>
    </span><ArrowRight size={16} aria-hidden="true"/>
  </a></li>;
}
