'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, LoaderCircle, Save, Trash2 } from 'lucide-react';
import type { AdminCustomerRecord, CommerceCustomer } from '@/lib/commerce-types';
import { customerContact } from '@/lib/customer-identity';

type Props = {
  id: string;
  startDeleting: boolean;
  onBack: () => void;
  onSaved: (customer: CommerceCustomer) => void;
  onRemoved: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
};

export default function CustomerEditor({ id, startDeleting, onBack, onSaved, onRemoved, onDirtyChange }: Props) {
  const [record, setRecord] = useState<AdminCustomerRecord | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [deleting, setDeleting] = useState(startDeleting);
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failureStatus, setFailureStatus] = useState(0);
  const [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const dirty = !!record && (name !== record.customer.name || email !== (record.customer.email ?? ''));
  const endpoint = '/api/admin/customers/' + encodeURIComponent(id);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(''); setFailureStatus(0);
    try {
      const response = await fetch('/api/admin/customers/' + encodeURIComponent(id), {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      const result = await response.json() as AdminCustomerRecord & { error?: string };
      if (!mounted.current) return;
      if (controller.signal.aborted) return;
      if (!response.ok) { if ([401, 403, 404].includes(response.status)) { setRecord(null); onDirtyChange(false); } setFailureStatus(response.status); setError(result.error || 'Could not load this customer.'); return; }
      setRecord(result); setName(result.customer.name); setEmail(result.customer.email ?? ''); setConfirmation('');
      onDirtyChange(false);
      requestAnimationFrame(() => { if (startDeleting && confirmationInput.current) confirmationInput.current.focus(); else heading.current?.focus(); });
    } catch { if (!controller.signal.aborted) setError('Could not load this customer. Try again.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [id, onDirtyChange, startDeleting]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; mounted.current = false; request.current?.abort(); };
  }, [load]);

  function change(nextName: string, nextEmail: string) {
    setName(nextName); setEmail(nextEmail); setNotice('');
    if (record) onDirtyChange(nextName !== record.customer.name || nextEmail !== (record.customer.email ?? ''));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || busy || !dirty) return;
    setBusy(true); setError(''); setFailureStatus(0); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: record.version, name, email: email.trim() || null }) });
      const result = await response.json() as AdminCustomerRecord & { error?: string };
      if (!mounted.current) return;
      if (!response.ok) { setFailureStatus(response.status); setError(result.error || 'Could not save this customer.'); return; }
      setRecord(result); setName(result.customer.name); setEmail(result.customer.email ?? ''); setConfirmation('');
      onDirtyChange(false); onSaved(result.customer); setNotice('Customer updated.');
    } catch { if (mounted.current) { setError('Could not confirm the save. Reload the customer before trying again.'); setFailureStatus(409); } }
    finally { if (mounted.current) setBusy(false); }
  }

  async function remove() {
    if (!record || busy || dirty || confirmation !== record.customer.name) return;
    setBusy(true); setError(''); setFailureStatus(0); onDirtyChange(true);
    try {
      const response = await fetch(endpoint, { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: record.version, confirmation: id }) });
      const result = await response.json() as { removed?: boolean; id?: string; error?: string };
      if (!mounted.current) return;
      if (!response.ok) { setFailureStatus(response.status); setError(result.error || 'Could not delete this customer.'); return; }
      if (!result.removed || result.id !== id) throw new Error('Unconfirmed deletion');
      onDirtyChange(false); onRemoved(id);
    } catch { if (mounted.current) { setError('Could not confirm deletion. Reload the customer before trying again.'); setFailureStatus(409); } }
    finally { if (mounted.current) { setBusy(false); onDirtyChange(dirty); } }
  }

  return <section className="commerce-panel" aria-labelledby="commerce-customer-title">
    <div className="commerce-panel-heading">
      <button type="button" className="admin-text-button" disabled={busy} onClick={() => {
        if (dirty) { setError('Save or cancel your edits before returning to customers.'); return; }
        onDirtyChange(false); onBack();
      }}><ArrowLeft size={16}/>Back to customers</button>
      <h2 ref={heading} id="commerce-customer-title" tabIndex={-1}>Customer details</h2>
      {record && <div className="commerce-customer"><strong>{record.customer.name}</strong><span>{customerContact(record.customer)}</span></div>}
    </div>
    {loading ? <p className="commerce-empty" role="status">Loading customer…</p> : record && <>
      <form className="commerce-customer-form" onSubmit={save}>
        <fieldset disabled={busy} className="commerce-customer-fields">
          <label className="admin-field">Name<input value={name} maxLength={100} required onChange={event => change(event.target.value, email)}/></label>
          <label className="admin-field">Email<input type="email" value={email} maxLength={254} autoComplete="off" onChange={event => change(name, event.target.value)}/>
            <small>Changing this address does not change the connected Google or Telegram identity.</small></label>
          <dl className="commerce-customer-facts">
            <div><dt>Customer ID</dt><dd>{record.customer.id}</dd></div>
            <div><dt>Joined</dt><dd>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Yangon' }).format(new Date(record.customer.createdAt))}</dd></div>
            <div><dt>Connected sign-in methods</dt><dd>{[
              record.customer.signInMethods?.emailPassword ? 'Email and password' : '',
              record.customer.signInMethods?.google ? 'Google' : '',
              record.customer.telegram ? 'Telegram' : '',
            ].filter(Boolean).join(', ') || 'Email account'}</dd></div>
            {record.customer.telegram && <div><dt>Telegram</dt><dd>{record.customer.telegram.username ? '@' + record.customer.telegram.username + ' · ' : ''}ID {record.customer.telegram.id}</dd></div>}
          </dl>
          <div className="commerce-customer-summary"><span>Pending orders: <strong>{record.summary.pending}</strong></span><span>Approved orders: <strong>{record.summary.approved}</strong></span><span>Giveaway entries: <strong>{record.summary.giveawayEntries}</strong></span></div>
          <div className="commerce-customer-actions">
            <button type="submit" className="admin-button admin-button-primary" disabled={!dirty || failureStatus === 409}>{busy ? <LoaderCircle size={16} className="admin-spinner"/> : <Save size={16}/>}Save customer</button>
            {dirty && <button type="button" className="admin-button admin-button-secondary" onClick={() => { if (failureStatus === 409) { void load(); return; } change(record.customer.name, record.customer.email ?? ''); setError(''); }}>{failureStatus === 409 ? 'Discard edits and reload' : 'Cancel edits'}</button>}
          </div>
        </fieldset>
      </form>
      <div className="commerce-customer-delete">
        <h3>Delete customer</h3>
        <p>Permanently delete this customer, their {record.summary.orders} orders and {record.summary.giveawayEntries} giveaway entries. Their current sessions and connected sign-in records will be removed. This cannot be undone.</p>
        {deleting ? <>
          <label className="admin-field">Type <strong>{record.customer.name}</strong> to confirm<input ref={confirmationInput} value={confirmation} autoComplete="off" disabled={busy || dirty} onChange={event => setConfirmation(event.target.value)}/></label>
          {dirty && <p>Save or cancel your edits before deleting this customer.</p>}
          <div className="commerce-customer-actions"><button type="button" className="admin-button commerce-danger-button" disabled={busy || dirty || confirmation !== record.customer.name || failureStatus === 409} onClick={() => void remove()}>{busy ? <LoaderCircle size={16} className="admin-spinner"/> : <Trash2 size={16}/>}Delete customer permanently</button><button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={() => { setDeleting(false); setConfirmation(''); requestAnimationFrame(() => heading.current?.focus()); }}>Cancel</button></div>
        </> : <button type="button" className="admin-button commerce-danger-outline" disabled={busy} onClick={() => { setDeleting(true); requestAnimationFrame(() => confirmationInput.current?.focus()); }}><Trash2 size={16}/>Delete customer…</button>}
      </div>
    </>}
    {notice && <p className="admin-feedback admin-feedback-success" role="status">{notice}</p>}
    {error && <div className="commerce-form-error" role="alert"><p>{error}</p>{failureStatus === 401 ? <a href="/admin/login">Sign in again</a> : <button type="button" className="admin-text-button" disabled={busy || loading} onClick={() => void load()}>Reload customer</button>}</div>}
  </section>;
}
