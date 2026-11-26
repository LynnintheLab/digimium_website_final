import { ArrowUpRight, Send } from 'lucide-react';
import type { ShopLanguage } from '@/lib/shop-language';
import './order-telegram-status.css';

export function OrderTelegramStatus({ botUrl, orderId, linked, lang }: {
  botUrl?: string; orderId?: string; linked: boolean; lang: ShopLanguage;
}) {
  if (!botUrl || !linked) return null;
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const label = orderId
    ? t('Check this order in Telegram', 'အော်ဒါအဆင့်ကို Telegram မှာ ကြည့်မယ်')
    : t('Get order updates in Telegram', 'အော်ဒါအခြေအနေကို Telegram မှာ လက်ခံမယ်');
  return <div className="order-telegram-status">
    <a href={orderId ? `${botUrl}?start=order_${orderId}` : botUrl} target="_blank" rel="noopener noreferrer">
      <Send size={17} aria-hidden="true" /><span>{label}</span><ArrowUpRight size={16} aria-hidden="true" />
    </a>
    <p>{t('Open the bot and press Start once to receive order updates.', 'အော်ဒါအခြေအနေ သိရဖို့ bot ကို ဖွင့်ပြီး Start တစ်ကြိမ် နှိပ်ပါ။')}</p>
  </div>;
}
