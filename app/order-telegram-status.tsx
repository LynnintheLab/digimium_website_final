import { ArrowUpRight, Send } from 'lucide-react';
import type { ShopLanguage } from '@/lib/shop-language';
import './order-telegram-status.css';

export function OrderTelegramStatus({ botUrl, orderId, linked, lang }: {
  botUrl?: string; orderId: string; linked: boolean; lang: ShopLanguage;
}) {
  if (!botUrl || !linked) return null;
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  return <div className="order-telegram-status">
    <a href={`${botUrl}?start=order_${orderId}`} target="_blank" rel="noopener noreferrer"><Send size={17} aria-hidden="true" /><span>{t('Check this order in Telegram', 'အော်ဒါအဆင့်ကို Telegram မှာ ကြည့်မယ်')}</span><ArrowUpRight size={16} aria-hidden="true" /></a>
  </div>;
}
