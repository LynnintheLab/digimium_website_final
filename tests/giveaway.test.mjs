import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GIVEAWAY_PRIZES, giveawayDatesError, giveawayMyanmarInput, giveawayStatus, giveawayUtcInput } from '../lib/giveaway.ts';

const start = '2026-11-15T00:00:00.000Z', end = '2026-11-16T00:00:00.000Z';
test('giveaway is draft until an explicit launch and uses exact window boundaries', () => {
  assert.equal(giveawayStatus({ startsAt: start, endsAt: end, launchedAt: null }, Date.parse(start)), 'draft');
  const campaign = { startsAt: start, endsAt: end, launchedAt: start };
  assert.equal(giveawayStatus(campaign, Date.parse(start) - 1), 'scheduled');
  assert.equal(giveawayStatus(campaign, Date.parse(start)), 'open');
  assert.equal(giveawayStatus(campaign, Date.parse(end) - 1), 'open');
  assert.equal(giveawayStatus(campaign, Date.parse(end)), 'ended');
});
test('giveaway times round-trip through Myanmar rather than device-local time', () => {
  assert.equal(giveawayMyanmarInput(start), '2026-11-15T06:30');
  assert.equal(giveawayUtcInput('2026-11-15T06:30'), start);
  assert.equal(giveawayUtcInput('2026-11-15T00:15'), '2026-11-14T17:45:00.000Z');
  assert.equal(giveawayUtcInput('2026-02-30T00:00'), null);
  assert.equal(giveawayUtcInput('2026-11-15T24:00'), null);
  assert.equal(giveawayUtcInput(''), null);
});
test('launch requires ordered valid future-end dates while draft permits empty settings', () => {
  assert.equal(giveawayDatesError(null, null, false), null);
  assert.ok(giveawayDatesError(null, end, true));
  assert.ok(giveawayDatesError(end, start, true));
  assert.ok(giveawayDatesError('2026-02-30T00:00:00.000Z', end, false));
  assert.ok(giveawayDatesError(start, end, true, Date.parse(end)));
  assert.equal(giveawayDatesError(start, end, true, Date.parse(start)), null);
});
test('approved prize allocation is six people across three exact plans', () => {
  assert.deepEqual(GIVEAWAY_PRIZES.map(({service, duration, winners}) => [service, duration, winners]), [
    ['Gemini', '3 months', 2], ['Canva', '12 months', 3], ['ChatGPT', '1 month', 1],
  ]);
  assert.equal(GIVEAWAY_PRIZES[1].plan, 'Canva EDU Pro');
  assert.equal(GIVEAWAY_PRIZES[2].plan, 'ChatGPT Go · Own Mail');
});
