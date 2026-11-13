import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showcaseSlides } from '../lib/showcase.ts';

const monthly = { id: 'monthly', duration: '1 month', price: '20,000 MMK', published: true };
const gift = { ...monthly, id: 'gift', duration: '3 months + 1 month free' };
const service = { id: 'service', published: true, availability: 'available', category: 1, duration: '', price: '' };

test('a promotion and a discounted best-selling plan link to the matching published plans', () => {
  const secondGift = { ...gift, id: 'annual', duration: '1 year + 10 days free' };
  const special = { ...monthly, bestSeller: true, discountPrice: '15000' };
  const product = { ...service, bestSeller: true, plans: [gift, special, secondGift] };
  const slides = showcaseSlides([product]);
  assert.deepEqual(slides.map(s => [s.kind, s.items[0].plan?.id]), [
    ['best', 'monthly'], ['promotion', 'gift'], ['discount', 'monthly'], ['promotion', 'annual'],
  ]);
  assert.deepEqual(product.plans.map(plan => plan.id), ['gift', 'monthly', 'annual']);
});

test('fallback categories return when the last selectable offer ends, alongside any best seller', () => {
  const hiddenGift = { ...gift, bestSeller: true, published: false };
  const parent = { ...service, bestSeller: true, duration: gift.duration, price: monthly.price, discountPrice: '1', plans: [monthly, hiddenGift] };
  const unavailable = { ...service, id: 'unavailable', availability: 'unavailable', plans: [gift] };
  const hidden = { ...service, id: 'draft', published: false, plans: [gift] };
  const slides = showcaseSlides([parent, unavailable, hidden, { ...service, id: 'design', category: 2 }]);
  assert.deepEqual(slides.map(s => [s.kind, s.category]), [['best', undefined], ['category', 1], ['category', 2]]);
  assert.equal(slides[0].items[0].plan.id, monthly.id);
  assert.deepEqual(slides[1].items.map(item => item.product.id), [parent.id]);
  assert.deepEqual(showcaseSlides([unavailable, hidden]), []);
});

test('a service with no published plans advertises its own valid sale or bonus', () => {
  const product = { ...service, price: monthly.price, discountPrice: '0', plans: [{ ...gift, published: false }] };
  assert.deepEqual(showcaseSlides([product]), [{ kind: 'discount', items: [{ product }] }]);
  assert.equal(showcaseSlides([{ ...product, discountPrice: '', duration: gift.duration }])[0].kind, 'promotion');
  assert.equal(showcaseSlides([{ ...service, category: 4 }])[0].category, 4);
});
