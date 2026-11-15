'use client';

// Account links load separate documents without storefront analytics.

import { ArrowDown, ArrowRight, CheckCircle2, Gift, Link2, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GiveawayCampaign, GiveawayView } from '../lib/giveaway-types';
import { durationText, type ShopLanguage } from '../lib/shop-language';
import './giveaway.css';

export function useGiveaway(enabled: boolean, initialData: GiveawayView | null = null) {
  const [data, setData] = useState<GiveawayView | null>(initialData);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const run = ++request.current;
    try {
      const response = await fetch('/api/giveaway', { cache: 'no-store' });
      const value = await response.json();
      if (!mounted.current || run !== request.current) return;
      if (!response.ok) throw new Error('unavailable');
      setData(value as GiveawayView); setError('');
    } catch { if (mounted.current && run === request.current) setError('unavailable'); }
    finally { if (mounted.current && run === request.current) setChecking(false); }
  }, [enabled]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void refresh(); });
    function visible() { if (!document.hidden) void refresh(); }
    window.addEventListener('digimium-account-changed', refresh);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(visible, 60_000);
    return () => {
      cancelled = true; mounted.current = false;
      // Request generations intentionally invalidate late network responses on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++;
      window.clearInterval(timer); window.removeEventListener('digimium-account-changed', refresh); document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  async function join() {
    if (!data || busy) return;
    setBusy(true); setError('');
    const run = ++request.current;
    try {
      const response = await fetch('/api/giveaway', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ campaignId: data.campaign.id }) });
      const value = await response.json() as GiveawayView & { error?: string };
      if (!mounted.current || run !== request.current) return;
      if (response.ok) setData(value as GiveawayView);
      else { await refresh(); setError(value.error || 'unavailable'); }
    } catch { if (mounted.current) setError('connection'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return { data, error, busy, checking, refresh, join };
}
export type GiveawayController = ReturnType<typeof useGiveaway>;

function statusText(campaign: GiveawayCampaign, lang: ShopLanguage) {
  const labels = { draft: ['Coming soon', 'မကြာမီ'], scheduled: ['Starts soon', 'မကြာမီ စတင်မည်'], open: ['Open now', 'ပါဝင်နိုင်ပါပြီ'], ended: ['Entries closed', 'ပါဝင်ချိန် ကုန်ဆုံးပါပြီ'] };
  return labels[campaign.status][lang === 'my' ? 1 : 0];
}
function campaignDate(value: string, lang: ShopLanguage) {
  return new Intl.DateTimeFormat(lang === 'my' ? 'my-MM' : 'en-GB', { timeZone: 'Asia/Yangon', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function prizeNumber(value: number, lang: ShopLanguage) {
  // Keep the server and browsers with limited Myanmar Intl data identical.
  return lang === 'my' ? String(value).replace(/\d/g, digit => '၀၁၂၃၄၅၆၇၈၉'[Number(digit)]) : String(value);
}

export function GiveawayBanner({ campaign, lang }: { campaign: GiveawayCampaign; lang: ShopLanguage }) {
  return <a className="giveaway-banner" href="#giveaway">
    <span className="giveaway-banner-icon" aria-hidden><Gift size={21}/></span>
    <strong>digimium. Giveaway</strong>
    <span className="giveaway-banner-total">{lang === 'my' ? 'လက်ဆောင် ၆ ဦးစာ' : '6 prize slots'}</span>
    <span className="giveaway-banner-status">{campaign.status === 'draft' && <span>{lang === 'my' ? 'နမူနာ' : 'Demo'} · </span>}{statusText(campaign, lang)}<ArrowRight size={17} aria-hidden/></span>
  </a>;
}

export function GiveawayPromo({ campaign, lang }: { campaign: GiveawayCampaign; lang: ShopLanguage }) {
  const total = prizeNumber(campaign.prizes.reduce((sum, prize) => sum + prize.winners, 0), lang);
  return <div className="giveaway-promo-content">
    <span className="giveaway-promo-status">{campaign.status === 'draft' && <>{lang === 'my' ? 'နမူနာ' : 'Demo'} · </>}{statusText(campaign, lang)}</span>
    <h2>Giveaway</h2>
    <p className="giveaway-promo-total"><strong>{total}</strong><span>{lang === 'my' ? 'ဦးစာ လက်ဆောင်' : 'prize slots'}</span></p>
    <ul className="giveaway-promo-prizes">{campaign.prizes.map(prize => <li key={prize.id}>
      <span className="giveaway-promo-mark" aria-hidden><img src={'/assets/marks/' + prize.mark + '.svg'} alt=""/></span>
      <span className="giveaway-promo-plan"><strong>{prize.plan}</strong><span>{durationText(prize.duration, lang)}</span></span>
      <span className="giveaway-promo-winners">{lang === 'my' ? `${prizeNumber(prize.winners, lang)} ဦး` : `× ${prize.winners}`}</span>
    </li>)}</ul>
    <small>{lang === 'my' ? 'Website အကောင့် + Telegram ချိတ်ထားရန် လိုအပ်သည်။' : 'Website account + connected Telegram required.'}</small>
  </div>;
}

export function GiveawayDetails({ controller, lang }: { controller: GiveawayController; lang: ShopLanguage }) {
  const { data, busy, error } = controller;
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  if (!data) return error ? <section className="giveaway-section wrap"><p>{t('Giveaway information is temporarily unavailable.', 'Giveaway အချက်အလက်ကို ခေတ္တဖော်ပြမရပါ။')}</p><button type="button" className="text-link" onClick={() => { void controller.refresh(); }}>{t('Try again', 'ပြန်ကြည့်မယ်')}</button></section> : null;
  const { campaign, viewer } = data;
  return <section className="giveaway-section wrap" id="giveaway" aria-labelledby="giveaway-title">
    <div className="giveaway-heading"><div><span className="giveaway-section-status">{statusText(campaign, lang)}</span><h2 id="giveaway-title">digimium. Giveaway</h2></div><span className="giveaway-winner-total"><Users size={19} aria-hidden/>{t('6 prize slots', 'လက်ဆောင် ၆ ဦးစာ')}</span></div>
    <div className="giveaway-prizes">{campaign.prizes.map(prize => <div className="giveaway-prize" key={prize.id}>
      <img src={'/assets/marks/' + prize.mark + '.svg'} alt=""/><div><h3>{prize.plan}</h3><p>{durationText(prize.duration, lang)} <span>·</span> {lang === 'my' ? `${prizeNumber(prize.winners, lang)} ဦး` : `${prize.winners} ${prize.winners === 1 ? 'winner' : 'winners'}`}</p></div>
    </div>)}</div>
    {campaign.startsAt && campaign.endsAt && <dl className="giveaway-dates"><div><dt>{t('Starts', 'စတင်ချိန်')}</dt><dd><time dateTime={campaign.startsAt}>{campaignDate(campaign.startsAt, lang)}</time></dd></div><div><dt>{t('Ends', 'ပြီးဆုံးချိန်')}</dt><dd><time dateTime={campaign.endsAt}>{campaignDate(campaign.endsAt, lang)}</time></dd></div><div><dt>{t('Timezone', 'စံတော်ချိန်')}</dt><dd>{t('Myanmar Time (MMT)', 'မြန်မာစံတော်ချိန်')}</dd></div></dl>}
    <div className="giveaway-entry" aria-busy={controller.checking}>
      {controller.checking ? <p role="status">{t('Checking your account…', 'သင့်အကောင့်ကို စစ်ဆေးနေသည်…')}</p> : <>
      <div><strong>{viewer.joined ? t('You have joined', 'ပါဝင်ပြီးပါပြီ') : t('Your account, your entry', 'သင့်အကောင့်နဲ့ ပါဝင်ပါ')}</strong><p>{viewer.joined ? t('Your entry is saved. Joining does not guarantee a prize.', 'ပါဝင်မှုကို သိမ်းထားပါပြီ။ ပါဝင်သူတိုင်း ဆုရမည်ဟု မဆိုလိုပါ။') : !viewer.signedIn ? t('Sign in or create a website account, then connect Telegram to join.', 'Website အကောင့်ဝင် သို့မဟုတ် အကောင့်ဖွင့်ပြီး Telegram ချိတ်ထားမှ ပါဝင်နိုင်ပါတယ်။') : !viewer.telegramLinked ? t('You cannot join until Telegram is connected to this account.', 'ဒီအကောင့်ကို Telegram နဲ့ မချိတ်ရသေးလို့ ပါဝင်လို့မရသေးပါ။') : campaign.status !== 'open' ? t('Entries open only during the published giveaway period.', 'သတ်မှတ်ထားတဲ့ Giveaway ကာလအတွင်းမှ ပါဝင်နိုင်ပါမယ်။') : t('One entry per website account and Telegram account.', 'Website အကောင့်နဲ့ Telegram အကောင့်တစ်ခုလျှင် တစ်ကြိမ်သာ ပါဝင်နိုင်ပါတယ်။')}</p></div>
      {viewer.joined ? <span className="giveaway-joined" role="status"><CheckCircle2 size={21} aria-hidden/>{t('Entry saved', 'ပါဝင်မှု သိမ်းပြီး')}</span> : !viewer.signedIn ? <a href="/account" className="button primary">{t('Log in / Create account', 'အကောင့်ဝင် / ဖွင့်မည်')}<ArrowRight size={16} aria-hidden/></a> : !viewer.telegramLinked ? <a href="/account#telegram-link-guide" className="button primary"><Link2 size={17} aria-hidden/>{t('How to connect', 'ချိတ်နည်းကြည့်မည်')}</a> : <button type="button" className="button primary" disabled={!viewer.canJoin || busy} onClick={() => { void controller.join(); }}>{busy ? t('Saving your entry…', 'ပါဝင်မှု သိမ်းနေသည်…') : campaign.status === 'open' ? t('Join giveaway', 'Giveaway ပါဝင်မည်') : statusText(campaign, lang)}<ArrowDown size={16} aria-hidden/></button>}
      </>}
    </div>
    {error && <p className="giveaway-error" role="alert">{t('We could not confirm your entry. Refresh and check before trying again.', 'ပါဝင်မှုကို အတည်ပြုမရသေးပါ။ ပြန်မနှိပ်ခင် ပြန်ကြည့်ပြီး စစ်ပါ။')} <button type="button" onClick={() => { void controller.refresh(); }}>{t('Refresh', 'ပြန်ကြည့်မယ်')}</button></p>}
  </section>;
}
