import Image from 'next/image';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { RUNNINGHUB_PACKS, RUNNINGHUB_PRODUCT_NAME } from '@/lib/runninghub';
import { categoryName, type ShopLanguage } from '@/lib/shop-language';
import './store-entry.css';

const catalogCategory = 1; // AI & productivity
const searchText = [RUNNINGHUB_PRODUCT_NAME, 'RunningHub', ...RUNNINGHUB_PACKS.map(pack => pack.label)]
  .join(' ').toLocaleLowerCase();

export function runningHubMatchesCatalog(category: number, terms: string[]) {
  return (category === 0 || category === catalogCategory) && terms.every(term => searchText.includes(term));
}

export function RunningHubEntry({ lang }: { lang: ShopLanguage }) {
  return (
    <a className="product runninghub-store-entry" href="/runninghub" aria-labelledby="runninghub-product runninghub-product-action" aria-describedby="runninghub-product-packs">
      <div className="product-top">
        <Image className="runninghub-store-mark" src="/assets/marks/runninghub.png" width={36} height={36} alt="" unoptimized />
        <ArrowUpRight size={20} aria-hidden="true" />
      </div>
      <h3 id="runninghub-product">{RUNNINGHUB_PRODUCT_NAME}</h3>
      <span className="product-category">{categoryName(catalogCategory, lang)}</span>
      <dl id="runninghub-product-packs" className="runninghub-store-packs">
        {RUNNINGHUB_PACKS.map(pack => <div key={pack.id}>
          <dt>{pack.usd} USD</dt>
          <dd>{pack.priceMmk.toLocaleString('en-US')} Ks</dd>
        </div>)}
      </dl>
      <span id="runninghub-product-action" className="product-action">
        {lang === 'my' ? 'API Key ဝယ်ရန်' : 'Buy API key'} <ArrowRight size={15} aria-hidden="true" />
      </span>
    </a>
  );
}
