import Image from 'next/image';
import type { ShopLanguage } from '../lib/shop-language';
import { PAYMENT_METHODS } from '../lib/payment';
import { commerceEnabled } from '../lib/commerce-enabled';
import './payment-methods.css';

export function PaymentMethods({lang, compact = false}: {lang: ShopLanguage; compact?: boolean}) {
  const title = lang === 'my' ? 'ပေးချေနိုင်သော နည်းလမ်းများ' : 'Payment methods';
  return <section className={'payment-methods' + (compact ? ' payment-methods-compact' : '')} aria-label={title}>
    <div className="payment-methods-heading"><strong>{title}</strong>
      {!compact && <p>{commerceEnabled
        ? lang === 'my' ? 'အကောင့်ဝင်ပြီး အော်ဒါထဲမှာ ငွေပေးချေနည်း ရွေးပါ။' : 'Sign in and choose a payment method in your order.'
        : lang === 'my' ? 'ငွေပေးချေမှုကို Telegram မှာ ဆက်လုပ်ပါ။' : 'Arrange payment with Digimium on Telegram.'}</p>}
    </div>
    <ul>{PAYMENT_METHODS.map(method => <li key={method.name}>
      <Image src={'/assets/payments/' + method.file} width={28} height={28} alt="" unoptimized/>
      <span lang="en">{method.name}</span>
    </li>)}</ul>
  </section>;
}
