import { Star } from 'lucide-react';
import type { ShopLanguage } from '../lib/shop-language';
import './best-seller-badge.css';

export function BestSellerBadge({ lang, plan = false, id }: { lang: ShopLanguage; plan?: boolean; id?: string }) {
  const label = plan
    ? (lang === 'my' ? 'အရောင်းရဆုံး အစီအစဉ်' : 'Best-selling plan')
    : (lang === 'my' ? 'အရောင်းရဆုံး' : 'Best seller');
  return <span className="best-seller-badge" id={id}><Star size={12} aria-hidden="true" />{label}</span>;
}
