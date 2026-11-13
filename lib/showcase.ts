import type { Product, ProductPlan } from './catalog';
import { durationPattern } from './duration.ts';
import { effectivePrice } from './pricing.ts';

export type ShowcaseItem = { product: Product; plan?: ProductPlan };
type OfferKind = 'best' | 'promotion' | 'discount';
export type ShowcaseSlide = { kind: OfferKind | 'category'; category?: number; items: ShowcaseItem[] };

export function showcaseSlides(products: Product[]): ShowcaseSlide[] {
  const available = products.filter(product => product.published && product.availability !== 'unavailable');
  const groups: Record<OfferKind, ShowcaseItem[]> = { best: [], promotion: [], discount: [] };
  for (const product of available) {
    const plans = product.plans?.filter(plan => plan.published) ?? [];
    if (product.bestSeller && !plans.some(plan => plan.bestSeller)) {
      groups.best.push(plans.length ? { product, plan: plans[0] } : { product });
    }
    const offers: ShowcaseItem[] = plans.length ? plans.map(plan => ({ product, plan })) : [{ product }];
    for (const item of offers) {
      if (item.plan?.bestSeller) groups.best.push(item);
      const offer = item.plan ?? product;
      if (durationPattern.exec(offer.duration.trim())?.[3]) groups.promotion.push(item);
      if (effectivePrice(offer) !== offer.price) groups.discount.push(item);
    }
  }

  // Alternate offer types so several promoted plans from one collection do not crowd out the others.
  const slides: ShowcaseSlide[] = [];
  const kinds = ['best', 'promotion', 'discount'] as const;
  const rounds = Math.max(...kinds.map(kind => groups[kind].length));
  for (let index = 0; index < rounds; index++) {
    for (const kind of kinds) {
      const item = groups[kind][index];
      if (item) slides.push({ kind, items: [item] });
    }
  }
  if (groups.promotion.length || groups.discount.length) return slides;

  const categories = available.some(product => product.category <= 3) ? [1, 2, 3] : [4];
  for (const category of categories) {
    const items = available.filter(product => product.category === category).slice(0, 3).map(product => ({ product }));
    if (items.length) slides.push({ kind: 'category', category, items });
  }
  return slides;
}
