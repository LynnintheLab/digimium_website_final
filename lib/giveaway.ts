export type GiveawayStatus = 'draft' | 'scheduled' | 'open' | 'ended';
export type GiveawayPrize = { id: string; service: string; plan: string; duration: string; winners: number; mark: string };
export const GIVEAWAY_PRIZES: GiveawayPrize[] = [
  { id: 'gemini', service: 'Gemini', plan: 'Gemini Pro', duration: '3 months', winners: 2, mark: 'gemini' },
  { id: 'canva', service: 'Canva', plan: 'Canva EDU Pro', duration: '12 months', winners: 3, mark: 'canva' },
  { id: 'chatgpt', service: 'ChatGPT', plan: 'ChatGPT Go · Own Mail', duration: '1 month', winners: 1, mark: 'chatgpt' },
];
export type GiveawayCampaign = {
  id: string; revision: number; status: GiveawayStatus; startsAt: string | null; endsAt: string | null;
  launchedAt: string | null; prizes: GiveawayPrize[];
};
export type GiveawayViewer = {
  signedIn: boolean; telegramLinked: boolean; joined: boolean; canJoin: boolean;
  reason: 'sign_in' | 'link_telegram' | 'not_open' | null;
};
export type GiveawayData = { campaign: GiveawayCampaign; viewer: GiveawayViewer };
export type GiveawayEntry = { id: string; customerId: string; name: string; email: string | null; telegramId: string; telegramUsername: string | null; joinedAt: string };
export type AdminGiveawayData = { campaign: GiveawayCampaign; entryCount: number; entries: GiveawayEntry[]; pagination: { page: number; pageSize: number; totalPages: number } };

export function giveawayStatus(campaign: Pick<GiveawayCampaign, 'startsAt' | 'endsAt' | 'launchedAt'>, now = Date.now()): GiveawayStatus {
  if (!campaign.launchedAt || !campaign.startsAt || !campaign.endsAt) return 'draft';
  if (now < Date.parse(campaign.startsAt)) return 'scheduled';
  return now < Date.parse(campaign.endsAt) ? 'open' : 'ended';
}

export type GiveawayCountdown =
  | { status: 'unset' | 'elapsed' }
  | { status: 'counting'; days: number; hours: number; minutes: number; seconds: number };

/** Entry closing and winner selection share the admin's saved end time. */
export function giveawayCountdown(endsAt: string | null, now: number): GiveawayCountdown {
  const deadline = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return { status: 'unset' };
  if (deadline <= now) return { status: 'elapsed' };
  const remaining = Math.ceil((deadline - now) / 1000);
  return { status: 'counting', days: Math.floor(remaining / 86400), hours: Math.floor(remaining / 3600) % 24,
    minutes: Math.floor(remaining / 60) % 60, seconds: remaining % 60 };
}

export function giveawayDatesError(startsAt: string | null, endsAt: string | null, requireDates: boolean, now = Date.now()): string | null {
  const valid = (value: string) => /^20\d\d-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  if ((startsAt !== null && !valid(startsAt)) || (endsAt !== null && !valid(endsAt))) return 'Choose valid dates between 2000 and 2099.';
  if (requireDates && (!startsAt || !endsAt)) return 'Choose a start and end time before launching.';
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return 'The end time must be after the start time.';
  if (requireDates && endsAt && Date.parse(endsAt) <= now) return 'The end time must be in the future when launching.';
  return null;
}

/** datetime-local controls use the shop timezone, not the admin device timezone. */
export function giveawayMyanmarInput(iso: string | null): string {
  if (!iso) return '';
  return new Date(Date.parse(iso) + 390 * 60_000).toISOString().slice(0, 16);
}
export function giveawayUtcInput(local: string): string | null {
  if (!local) return null;
  if (!/^20\d\d-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const time = Date.parse(local + ':00+06:30');
  if (!Number.isFinite(time)) return null;
  const iso = new Date(time).toISOString();
  return giveawayMyanmarInput(iso) === local ? iso : null;
}
