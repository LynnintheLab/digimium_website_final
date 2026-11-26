import { ArrowUpRight } from 'lucide-react';
import type { ShopLanguage } from '@/lib/shop-language';
import './store-entry.css';

export function RunningHubEntry({ lang }: { lang: ShopLanguage }) {
  return <a className="runninghub-store-entry" href="/runninghub">
    <div><strong>Running HUB API Key</strong><p>10 USD · 70,000 Ks <span>20 USD · 138,000 Ks</span></p></div>
    <span>{lang === 'my' ? 'Package ကြည့်ပြီး ဝယ်မယ်' : 'View bundles and buy'}<ArrowUpRight size={19} aria-hidden="true" /></span>
  </a>;
}
