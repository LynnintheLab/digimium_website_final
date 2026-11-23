import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultDeliveryDates, suggestedEndDate } from '../lib/order-dates.ts';

test('automatic delivery starts on the Myanmar calendar date at send time', () => {
  assert.deepEqual(defaultDeliveryDates('1 month', new Date('2026-11-23T17:30:00Z')),
    { startDate: '2026-11-24', endDate: '2026-12-24' });
  assert.deepEqual(defaultDeliveryDates('1 day', new Date('2026-11-23T17:29:59Z')),
    { startDate: '2026-11-23', endDate: '2026-11-24' });
});

test('automatic delivery clamps month ends and includes advertised free terms', () => {
  assert.equal(suggestedEndDate('2028-01-31', '1 month'), '2028-02-29');
  assert.equal(suggestedEndDate('2028-02-29', '1 year'), '2029-02-28');
  assert.equal(suggestedEndDate('2026-01-31', '1 month + 1 month free'), '2026-03-31');
  assert.equal(suggestedEndDate('2026-01-31', '1 month + 2 days free'), '2026-03-02');
});

test('unrecognized or overflowing automatic terms use same-day fulfillment without invented duration', () => {
  for (const duration of ['', 'Lifetime', 'On request', '999999999999999999999999999999999999999 years']) {
    assert.deepEqual(defaultDeliveryDates(duration, new Date('2026-11-23T00:00:00Z')),
      { startDate: '2026-11-23', endDate: '2026-11-23' });
  }
  assert.equal(suggestedEndDate('2026-02-31', '1 month'), '');
});
