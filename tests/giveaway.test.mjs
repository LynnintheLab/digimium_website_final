import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { GIVEAWAY_PRIZES, giveawayCountdown, giveawayDatesError, giveawayMyanmarInput, giveawayStatus, giveawayUtcInput } from '../lib/giveaway.ts';

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

test('selection countdown has honest unset and elapsed states at exact boundaries', () => {
  assert.deepEqual(giveawayCountdown(null, Date.parse(start)), { status: 'unset' });
  assert.deepEqual(giveawayCountdown('invalid', Date.parse(start)), { status: 'unset' });
  assert.deepEqual(giveawayCountdown(end, NaN), { status: 'unset' });
  assert.deepEqual(giveawayCountdown(end, Date.parse(end)), { status: 'elapsed' });
  assert.deepEqual(giveawayCountdown(end, Date.parse(end) + 1), { status: 'elapsed' });
  assert.deepEqual(giveawayCountdown(end, Date.parse(end) - 1), { status: 'counting', days: 0, hours: 0, minutes: 0, seconds: 1 });
});
test('selection countdown splits real elapsed time into days, hours, minutes and seconds', () => {
  const duration = ((3 * 24 + 5) * 3600 + 7 * 60 + 9) * 1000;
  assert.deepEqual(giveawayCountdown(end, Date.parse(end) - duration), { status: 'counting', days: 3, hours: 5, minutes: 7, seconds: 9 });
  assert.deepEqual(giveawayCountdown(end, Date.parse(end) - 86400000), { status: 'counting', days: 1, hours: 0, minutes: 0, seconds: 0 });
});

const require = createRequire(import.meta.url);
let giveawayDetails;
function renderDetails(viewer, lang = 'my', endsAt = null, checking = false, error = '') {
  if (!giveawayDetails) {
    // Render the real TSX with external framework packages, without writing a build artifact.
    const { buildSync } = createRequire(require.resolve('@esbuild-kit/core-utils'))('esbuild');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const compiled = buildSync({ entryPoints: [path.join(root, 'app/giveaway.tsx')], absWorkingDir: root,
      bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } });
    const cjsModule = { exports: {} };
    // Match Next's framework default-import bridge while retaining its real Image component.
    const frameworkRequire = id => id === 'next/image' ? require(id).default : require(id);
    // Some browsers lack my-MM date data. Render with all date locale support
    // unavailable so giveaway text cannot accidentally depend on that runtime.
    const limitedIntl = new Proxy(Intl, { get(target, key) {
      if (key === 'DateTimeFormat') return class { constructor() { throw new Error('Date locale data is unavailable in this fixture'); } };
      return Reflect.get(target, key);
    } });
    vm.runInNewContext(compiled.outputFiles[0].text, { require: frameworkRequire, module: cjsModule, exports: cjsModule.exports, Intl: limitedIntl }, { filename: 'giveaway-render-fixture.cjs' });
    giveawayDetails = cjsModule.exports.GiveawayDetails;
  }
  const { createElement } = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const campaign = { id: 'fixture', revision: 1, status: 'open', startsAt: null, endsAt, launchedAt: start, prizes: GIVEAWAY_PRIZES };
  const controller = { data: { campaign, viewer }, checking, busy: false, error, refresh: async () => {}, join: async () => {} };
  return renderToStaticMarkup(createElement(giveawayDetails, { controller, lang }));
}
test('joined giveaway renders one clear confirmation without duplicate entry copy or join controls', () => {
  const viewer = { signedIn: true, telegramLinked: true, joined: true, canJoin: false, reason: null };
  const myanmar = renderDetails(viewer, 'my', null, true, 'connection');
  assert.equal(myanmar.split('Giveaway တွင် ပါဝင်ပြီးပါပြီ').length - 1, 1);
  assert.ok(!myanmar.includes('ပါဝင်မှု သိမ်းပြီး') && !myanmar.includes('ဆုရမည်ဟု မဆိုလိုပါ'));
  assert.ok(!myanmar.includes('အကောင့်ကို စစ်ဆေးနေသည်'));
  assert.ok(!myanmar.includes('အတည်ပြုမရသေးပါ'));
  assert.ok(!myanmar.includes('<button') && !myanmar.includes('href="/account'));
  const english = renderDetails(viewer, 'en');
  assert.equal(english.split('You have joined the giveaway.').length - 1, 1);
  assert.ok(!english.includes('Entry saved') && !english.includes('guarantee a prize'));
});
test('entry rendering preserves sign-in, Telegram linking and join eligibility without a fake countdown', () => {
  const signedOut = renderDetails({ signedIn: false, telegramLinked: false, joined: false, canJoin: false, reason: 'sign_in' }, 'en');
  assert.ok(signedOut.includes('href="/account"'));
  assert.ok(signedOut.includes('The selection time will be announced here.'));
  assert.ok(!signedOut.includes('role="timer"'));
  const unlinked = renderDetails({ signedIn: true, telegramLinked: false, joined: false, canJoin: false, reason: 'link_telegram' }, 'en');
  assert.ok(unlinked.includes('href="/account#telegram-link-guide"'));
  assert.ok(!unlinked.includes('Join giveaway'));
  const eligible = renderDetails({ signedIn: true, telegramLinked: true, joined: false, canJoin: true, reason: null }, 'en', end);
  assert.ok(eligible.includes('Join giveaway'));
  assert.ok(!eligible.includes(' disabled=""'));
  assert.ok(eligible.includes('Winner selection') && eligible.includes('Myanmar time'));
});
test('giveaway date text is deterministic without Intl date locales and crosses Myanmar midnight correctly', () => {
  const viewer = { signedIn: false, telegramLinked: false, joined: false, canJoin: false, reason: 'sign_in' };
  const rollover = '2026-12-31T20:00:00.000Z';
  const myanmar = renderDetails(viewer, 'my', rollover);
  assert.ok(myanmar.includes('၁ ဇန်နဝါရီ ၂၀၂၇၊ ၀၂:၃၀'));
  assert.ok(myanmar.includes(`dateTime="${rollover}"`), 'The semantic timestamp remains the original UTC instant');
  const english = renderDetails(viewer, 'en', rollover);
  assert.ok(english.includes('1 Jan 2027, 02:30'));
  const november = renderDetails(viewer, 'my', '2026-11-17T11:57:00.000Z');
  assert.ok(november.includes('၁၇ နိုဝင်ဘာ ၂၀၂၆၊ ၁၈:၂၇'));
});
