import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveOrder, totalMmk, withSelection } from '../lib/cart-order.ts';
import { durationText, planName, priceText, productDescription } from '../lib/shop-language.ts';

test('Myanmar descriptions use the current owner copy when it differs from the catalog default', () => {
  const original = { description: 'Bring notes, plans, and projects into one workspace.' };
  assert.match(productDescription(original, 'my'), /[\u1000-\u109F]/);
  const edited = { description: 'Notion for your whole team.' };
  assert.equal(productDescription(edited, 'my'), edited.description);
  const translated = { ...edited, mm: 'အဖွဲ့လိုက် အသုံးပြုနိုင်ပါတယ်။' };
  assert.equal(productDescription(translated, 'my'), translated.mm);
  assert.equal(productDescription(translated, 'en'), edited.description);
});

test('the cart preserves each product’s plan, price and offer length when the customer switches language', () => {
  const musicPlan = { id: 'monthly', name: 'Individual 1m (Own Mail)', price: '16,000 MMK', duration: '1 month', published: true };
  const designPlan = { id: 'monthly', name: 'Pro', price: '25,000 MMK', duration: '3 months + 1 month free', published: true };
  const products = [
    { id: 'music', name: 'Music', published: true, availability: 'available', plans: [musicPlan] },
    { id: 'design', name: 'Design', published: true, availability: 'available', plans: [designPlan] },
  ];
  const savedCart = [{ productId: 'music', planId: 'monthly', quantity: 2 }];
  const basket = withSelection(savedCart, { productId: 'design', planId: 'monthly', quantity: 1 }, false);
  const rows = resolveOrder(basket, products);
  assert.deepEqual(rows.map(row => [row.product.name, row.quantity]), [['Music', 2], ['Design', 1]]);
  assert.equal(totalMmk(rows), 57000);
  assert.equal(planName(rows[0].plan, 'en'), musicPlan.name);
  assert.equal(planName(rows[0].plan, 'my'), 'Individual 1 လ (ကိုယ်ပိုင်အီးမေးလ်ဖြင့်)');
  assert.equal(priceText(rows[0].plan.price, 'my'), '16,000 ကျပ်');
  assert.equal(durationText(rows[1].plan.duration, 'my'), '3 လ + 1 လ အခမဲ့');
  assert.equal(priceText(rows[1].plan.price, 'en'), designPlan.price);
});
