import Image from 'next/image';
import type { ShopLanguage } from '../lib/shop-language';
import './payment-methods.css';

const methods = [
  {name: 'KBZPay', file: 'kbzpay.jpg'},
  {name: 'Wave', file: 'wavepay.jpg'},
  {name: 'AYA Pay', file: 'ayapay.jpg'},
  {name: 'UABpay', file: 'uabpay.jpg'},
  {name: 'Binance', file: 'binance.png'},
];

export function PaymentMethods({lang, compact = false}: {lang: ShopLanguage; compact?: boolean}) {
  const title = lang === 'my' ? 'ပေးချေနိုင်သော နည်းလမ်းများ' : 'Payment methods';
  return <section className={'payment-methods' + (compact ? ' payment-methods-compact' : '')} aria-label={title}>
    <div className="payment-methods-heading"><strong>{title}</strong>
      {!compact && <p>{lang === 'my' ? 'ငွေပေးချေမှုကို Telegram မှာ ဆက်လုပ်ပါ။' : 'Arrange payment with Digimium on Telegram.'}</p>}
    </div>
    <ul>{methods.map(method => <li key={method.name}>
      <Image src={'/assets/payments/' + method.file} width={28} height={28} alt="" unoptimized/>
      <span lang="en">{method.name}</span>
    </li>)}</ul>
  </section>;
}
