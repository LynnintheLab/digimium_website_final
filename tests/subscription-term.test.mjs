import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSubscriptionTerm, todayInMyanmar } from '../lib/subscription-term.ts';

test('shop calendar date changes at Myanmar midnight regardless of UTC date', () => {
  assert.equal(todayInMyanmar(new Date('2026-11-13T17:29:59.999Z')), '2026-11-13');
  assert.equal(todayInMyanmar(new Date('2026-11-13T17:30:00.000Z')), '2026-11-14');
  assert.equal(todayInMyanmar(new Date('2026-12-31T17:30:00.000Z')), '2027-01-01');
});

test('future terms are upcoming with full time remaining', () => {
  const term = getSubscriptionTerm('2026-11-14', '2026-12-14', '2026-11-12');
  assert.equal(term.status, 'upcoming');
  assert.equal(term.daysUntilStart, 2);
  assert.equal(term.daysRemaining, 30);
  assert.equal(term.remainingPercent, 100);
});

test('active terms count calendar days and fill the remaining fraction', () => {
  const firstDay = getSubscriptionTerm('2026-11-14', '2026-12-14', '2026-11-14');
  assert.equal(firstDay.status, 'active');
  assert.equal(firstDay.daysRemaining, 30);
  assert.equal(firstDay.remainingPercent, 100);
  const halfway = getSubscriptionTerm('2026-11-14', '2026-12-14', '2026-11-29');
  assert.equal(halfway.daysRemaining, 15);
  assert.equal(halfway.remainingPercent, 50);
  const finalDay = getSubscriptionTerm('2026-11-14', '2026-12-14', '2026-12-13');
  assert.equal(finalDay.status, 'active');
  assert.equal(finalDay.daysRemaining, 1);
});

test('end date says ends today and expiry begins the next calendar date', () => {
  const endDay = getSubscriptionTerm('2026-11-14', '2026-12-14', '2026-12-14');
  assert.equal(endDay.status, 'ends-today');
  assert.equal(endDay.daysRemaining, 0);
  assert.equal(endDay.remainingPercent, 0);
  const expired = getSubscriptionTerm('2026-11-14', '2026-12-14', '2026-12-15');
  assert.equal(expired.status, 'expired');
  assert.equal(expired.daysRemaining, 0);
  assert.equal(expired.remainingPercent, 0);
});

test('same-day terms do not divide by zero or expire early', () => {
  assert.equal(getSubscriptionTerm('2026-11-14', '2026-11-14', '2026-11-13').status, 'upcoming');
  const term = getSubscriptionTerm('2026-11-14', '2026-11-14', '2026-11-14');
  assert.equal(term.status, 'ends-today');
  assert.equal(term.remainingPercent, 0);
  assert.equal(getSubscriptionTerm('2026-11-14', '2026-11-14', '2026-11-15').status, 'expired');
});

test('leap days and month boundaries use date-only arithmetic', () => {
  assert.equal(getSubscriptionTerm('2028-02-28', '2028-03-01', '2028-02-28').daysRemaining, 2);
  assert.equal(getSubscriptionTerm('2028-02-28', '2028-03-01', '2028-02-29').daysRemaining, 1);
  assert.equal(getSubscriptionTerm('2026-12-31', '2027-01-01', '2026-12-31').daysRemaining, 1);
});

test('missing, invalid, and reversed dates never show fabricated progress', () => {
  for (const [start, end, today] of [
    [null, null, '2026-11-14'],
    ['2026-11-14', null, '2026-11-14'],
    [null, '2026-12-14', '2026-11-14'],
    ['2026-02-29', '2026-03-01', '2026-02-28'],
    ['2026-11-31', '2026-12-14', '2026-11-14'],
    ['2026-12-14', '2026-11-14', '2026-11-14'],
    ['0000-11-14', '2026-11-14', '2026-11-14'],
    ['2026-11-14T00:00:00Z', '2026-12-14', '2026-11-14'],
    ['2026-11-14', '2026-12-14', ''],
  ]) {
    const term = getSubscriptionTerm(start, end, today);
    assert.equal(term.status, 'unknown');
    assert.equal(term.daysRemaining, null);
    assert.equal(term.remainingPercent, null);
  }
  assert.equal(getSubscriptionTerm('invalid', '2026-12-14', '2026-11-14').startDate, null);
});
