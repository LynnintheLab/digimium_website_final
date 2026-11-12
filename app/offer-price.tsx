import { effectivePrice } from '../lib/pricing';
import { priceText, type ShopLanguage } from '../lib/shop-language';

type Props = {
  offer: { price: string; discountPrice?: string };
  lang: ShopLanguage;
};

export function OfferPrice({ offer, lang }: Props) {
  const current = effectivePrice(offer);
  return <strong className="offer-price">
    {current !== offer.price && <>
      <del><span className="offer-price-label">{lang === 'my' ? 'မူလဈေးနှုန်း ' : 'Original price '}</span>{priceText(offer.price, lang)}</del>
      <span className="offer-price-label">{lang === 'my' ? 'လျှော့ဈေး ' : 'Sale price '}</span>
    </>}
    {priceText(current, lang)}
  </strong>;
}
