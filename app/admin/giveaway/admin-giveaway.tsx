'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Gift, LoaderCircle, RefreshCw, Rocket, Save } from 'lucide-react';
import { giveawayDatesError, giveawayMyanmarInput, giveawayUtcInput, type AdminGiveawayData } from '@/lib/giveaway';
import './giveaway.css';

const path = '/api/admin/giveaway';
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Yangon' });

export default function AdminGiveaway({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [data, setData] = useState<AdminGiveawayData | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [failureStatus, setFailureStatus] = useState(0);
  const request = useRef<AbortController | null>(null);
  const original = data ? [giveawayMyanmarInput(data.campaign.startsAt), giveawayMyanmarInput(data.campaign.endsAt)] : ['', ''];
  const dirty = startsAt !== original[0] || endsAt !== original[1];

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const apply = useCallback((next: AdminGiveawayData) => {
    setData(next);
    setStartsAt(giveawayMyanmarInput(next.campaign.startsAt));
    setEndsAt(giveawayMyanmarInput(next.campaign.endsAt));
  }, []);
  const load = useCallback(async (page = 1) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setFailureStatus(0);
    try {
      const response = await fetch(path + '?page=' + page, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      const result = await response.json() as AdminGiveawayData & { error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) { setFailureStatus(response.status); setError(result.error || 'Could not load the giveaway.'); return; }
      apply(result);
      onDirtyChange(false);
    } catch { if (!controller.signal.aborted) setError('Could not connect. Check your connection and try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [apply, onDirtyChange]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [load]);

  async function save(action: 'save' | 'launch') {
    if (busy || !data) return;
    const start = giveawayUtcInput(startsAt), end = giveawayUtcInput(endsAt);
    if ((startsAt && !start) || (endsAt && !end)) { setError('Choose valid start and end times.'); return; }
    const problem = giveawayDatesError(start, end, action === 'launch');
    if (problem) { setError(problem); return; }
    setBusy(true); setError(''); setNotice(''); setFailureStatus(0);
    try {
      const response = await fetch(path, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: data.campaign.revision, startsAt: start, endsAt: end }) });
      const result = await response.json() as AdminGiveawayData & { error?: string };
      if (!response.ok) { setFailureStatus(response.status); setError(result.error || 'Could not save the giveaway.'); return; }
      apply(result); onDirtyChange(false);
      setNotice(action === 'launch' ? 'Giveaway launched. The saved start and end times control when customers can enter.' : 'Giveaway settings saved.');
    } catch { setError('Could not confirm the save. Refresh the latest settings before retrying.'); }
    finally { setBusy(false); }
  }

  async function setVisibility(visible: boolean) {
    if (busy || !data) return;
    setBusy(true); setError(''); setNotice(''); setFailureStatus(0);
    try {
      const response = await fetch(path, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: visible ? 'show' : 'hide', revision: data.campaign.revision }) });
      const result = await response.json() as AdminGiveawayData & { error?: string };
      if (!response.ok) { setFailureStatus(response.status); setError(result.error || 'Could not change giveaway visibility.'); return; }
      // Visibility changes do not discard unfinished schedule edits.
      setData(result);
      setNotice(visible ? 'Giveaway is visible. The saved schedule controls when entries open.' : 'Giveaway hidden everywhere on the website. New entries are stopped; existing entries and dates are kept.');
    } catch { setError('Could not confirm the change. Load the latest settings before retrying.'); }
    finally { setBusy(false); }
  }

  function reload(page = data?.pagination.page || 1) {
    if (dirty && !window.confirm('Load the latest giveaway and discard your unsaved edits?')) return;
    void load(page);
  }

  return <div className="admin-giveaway">
    {error && <div className="admin-feedback admin-feedback-error" role="alert"><div><p>{error}</p>
      {failureStatus === 401 ? <a href="/admin/login">Sign in again</a> : <button type="button" disabled={busy} onClick={() => reload()}>Load latest giveaway</button>}
    </div></div>}
    {notice && <p className="admin-feedback admin-feedback-success" role="status">{notice}</p>}
    {!data && busy && <p role="status"><LoaderCircle size={18} className="admin-spinner" /> Loading giveaway…</p>}
    {data && <>
      <section className="giveaway-admin-settings" aria-labelledby="giveaway-settings-title">
        <div className="giveaway-admin-heading"><h2 id="giveaway-settings-title"><Gift size={20} aria-hidden /> Giveaways</h2>
          <span className="giveaway-admin-status" data-status={data.campaign.status}>{data.campaign.status}</span>
        </div>
        <div className="giveaway-admin-visibility" data-visible={data.campaign.visible !== false}>
          <div><h3>Website visibility</h3><p className="giveaway-admin-help">{data.campaign.visible === false ? 'Hidden: banner, promotion, prizes and countdown are not shown. Customers cannot join.' : 'Visible: customers can see the giveaway. Entries follow the saved schedule.'} Existing entries and dates are preserved.</p></div>
          <button type="button" className={'admin-button ' + (data.campaign.visible === false ? 'admin-button-primary' : 'admin-button-secondary')} disabled={busy || failureStatus === 409} onClick={() => void setVisibility(data.campaign.visible === false)}>{data.campaign.visible === false ? <Eye size={16} aria-hidden/> : <EyeOff size={16} aria-hidden/>}{data.campaign.visible === false ? 'Show giveaway' : 'Hide giveaway'}</button>
        </div>
        <ul className="giveaway-admin-prizes">{data.campaign.prizes.map(prize => <li key={prize.id}>
          <strong>{prize.plan}</strong><span>{prize.duration} · {prize.winners} {prize.winners === 1 ? 'winner' : 'winners'}</span>
        </li>)}</ul>
        <form onSubmit={event => { event.preventDefault(); void save('save'); }}>
          <fieldset disabled={busy}>
            <p id="giveaway-timezone" className="giveaway-admin-help">All times use Myanmar time (Asia/Yangon, UTC+06:30).</p>
            <div className="giveaway-admin-dates">
              <label className="admin-field">Start time<input type="datetime-local" min="2000-01-01T00:00" max="2099-12-31T23:59" aria-describedby="giveaway-timezone" value={startsAt} onChange={event => { setStartsAt(event.target.value); setNotice(''); }} /></label>
              <label className="admin-field">Entry closing / winner selection time<input type="datetime-local" min={startsAt || '2000-01-01T00:00'} max="2099-12-31T23:59" aria-describedby="giveaway-timezone giveaway-selection-help" value={endsAt} onChange={event => { setEndsAt(event.target.value); setNotice(''); }} /></label>
            </div>
            <p id="giveaway-selection-help" className="giveaway-admin-help">The website counts down to this end time. Winners are selected manually.</p>
            <p className="giveaway-admin-help">{data.campaign.launchedAt ? 'Saving new times keeps all existing entries and their original owners.' : 'Prizes appear as a preview. Entries stay closed until you explicitly launch the giveaway.'}</p>
            <div className="giveaway-admin-actions">
              <button className="admin-button admin-button-secondary" type="submit" disabled={busy || !dirty || failureStatus === 409}><Save size={16} aria-hidden />Save settings</button>
              {!data.campaign.launchedAt && <button className="admin-button admin-button-primary" type="button" disabled={busy || !startsAt || !endsAt || failureStatus === 409} onClick={() => void save('launch')}><Rocket size={16} aria-hidden />{dirty ? 'Save and launch giveaway' : 'Launch giveaway'}</button>}
              {busy && <span role="status">Saving…</span>}
            </div>
          </fieldset>
        </form>
      </section>
      <section className="giveaway-admin-entries" aria-labelledby="giveaway-entries-title">
        <div className="giveaway-admin-heading"><div><h2 id="giveaway-entries-title">Entries <span>{data.entryCount}</span></h2><p className="giveaway-admin-help">Private participant details. One entry per account and verified Telegram identity.</p></div>
          <button className="admin-text-button" type="button" disabled={busy} onClick={() => reload()}><RefreshCw size={16} aria-hidden />Refresh</button>
        </div>
        {data.entries.length ? <div className="giveaway-admin-table-wrap"><table className="giveaway-admin-table"><thead><tr><th>Customer</th><th>Telegram</th><th>Joined (Myanmar time)</th></tr></thead><tbody>{data.entries.map(entry => <tr key={entry.id}>
          <td><strong>{entry.name}</strong>{entry.email && <span>{entry.email}</span>}<small>Account {entry.customerId}</small></td>
          <td>{entry.telegramUsername && <span>@{entry.telegramUsername}</span>}<small>ID {entry.telegramId}</small></td>
          <td><time dateTime={entry.joinedAt}>{date.format(new Date(entry.joinedAt))}</time></td>
        </tr>)}</tbody></table></div> : <p className="giveaway-admin-empty">No entries yet. Eligible customers can join after the giveaway opens.</p>}
        {data.pagination.totalPages > 1 && <div className="giveaway-admin-pagination">
          <button type="button" className="admin-text-button" disabled={busy || data.pagination.page <= 1} onClick={() => reload(data.pagination.page - 1)}><ChevronLeft size={16} aria-hidden />Previous</button>
          <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
          <button type="button" className="admin-text-button" disabled={busy || data.pagination.page >= data.pagination.totalPages} onClick={() => reload(data.pagination.page + 1)}>Next<ChevronRight size={16} aria-hidden /></button>
        </div>}
      </section>
    </>}
  </div>;
}
