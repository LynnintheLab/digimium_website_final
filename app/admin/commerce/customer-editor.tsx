'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle, Save, Send, Trash2 } from 'lucide-react';
import type { AdminCustomerRecord, CommerceCustomer } from '@/lib/commerce-types';
import { customerContact } from '@/lib/customer-identity';
import { normalizeNotificationActionLabel, normalizeNotificationActionUrl, type NotificationAction } from '@/lib/notification-action';
import { validTelegramUsername } from '@/lib/telegram-contact';

type Props = {
  id: string;
  startDeleting: boolean;
  telegramContact: string | null;
  onBack: () => void;
  onSaved: (customer: CommerceCustomer) => void;
  onRemoved: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
};

type ButtonDestination = 'none' | 'telegram' | 'store' | 'history' | 'account' | 'contact' | 'custom';

export default function CustomerEditor({ id, startDeleting, telegramContact, onBack, onSaved, onRemoved, onDirtyChange }: Props) {
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
  const [message, setMessage] = useState('');
  const [buttonDestination, setButtonDestination] = useState<ButtonDestination>('none');
  const [buttonLabel, setButtonLabel] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [messageNotice, setMessageNotice] = useState('');
  const [messageFailureStatus, setMessageFailureStatus] = useState(0);
  const messageDraft = useRef(false);
  const messageRequest = useRef<string | null>(null);
  const messageConflict = useRef(false);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const buttonLabelInput = useRef<HTMLInputElement>(null);
  const buttonUrlInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const dirty = !!record && (name !== record.customer.name || email !== (record.customer.email ?? ''));
  const messageDirty = message.length > 0 || buttonDestination !== 'none';
  const unavailable = failureStatus === 404 || messageFailureStatus === 404;
  const messageStale = failureStatus === 409 || messageFailureStatus === 409;
  const endpoint = '/api/admin/customers/' + encodeURIComponent(id);
  const hasTelegramContact = !!telegramContact && validTelegramUsername(telegramContact);
  const destinations: { value: ButtonDestination; name: string; label: string; url: string }[] = [
    ...(hasTelegramContact ? [{ value: 'telegram' as const, name: 'Telegram contact', label: 'Contact us on Telegram', url: 'https://t.me/' + telegramContact }] : []),
    { value: 'store', name: 'Store homepage', label: 'Visit the store', url: '/' },
    { value: 'history', name: 'Order history', label: 'View order history', url: '/order-history' },
    { value: 'account', name: 'Account settings', label: 'Open account settings', url: '/account' },
    { value: 'contact', name: 'Contact section', label: 'Contact Digimium', url: '/#contact' },
  ];
  const selectedDestination = destinations.find(item => item.value === buttonDestination);
  const actionUrl = buttonDestination === 'custom' ? buttonUrl : selectedDestination?.url ?? '';

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
      setMessageError(''); setMessageFailureStatus(0);
      if (messageConflict.current) { messageRequest.current = null; messageConflict.current = false; }
      onDirtyChange(messageDraft.current);
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
    if (record) onDirtyChange(nextName !== record.customer.name || nextEmail !== (record.customer.email ?? '') || messageDraft.current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || busy || !dirty || unavailable) return;
    setBusy(true); setError(''); setFailureStatus(0); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: record.version, name, email: email.trim() || null }) });
      const result = await response.json() as AdminCustomerRecord & { error?: string };
      if (!mounted.current) return;
      if (!response.ok) { setFailureStatus(response.status); setError(result.error || 'Could not save this customer.'); return; }
      setRecord(result); setName(result.customer.name); setEmail(result.customer.email ?? ''); setConfirmation('');
      onDirtyChange(messageDraft.current); onSaved(result.customer); setNotice('Customer updated.');
    } catch { if (mounted.current) { setError('Could not confirm the save. Reload the customer before trying again.'); setFailureStatus(409); } }
    finally { if (mounted.current) setBusy(false); }
  }

  async function remove() {
    if (!record || busy || dirty || messageDirty || unavailable || confirmation !== record.customer.name) return;
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
    finally { if (mounted.current) { setBusy(false); onDirtyChange(dirty || messageDraft.current); } }
  }

  function changeMessage(value: string) {
    setMessage(value); setMessageNotice('');
    messageDraft.current = value.length > 0 || buttonDestination !== 'none';
    messageRequest.current = null;
    if (!messageStale && !unavailable) setMessageError('');
    onDirtyChange(dirty || messageDraft.current);
  }

  function changeButton(destination: ButtonDestination, label: string, url: string) {
    setButtonDestination(destination); setButtonLabel(label); setButtonUrl(url); setMessageNotice('');
    messageDraft.current = message.length > 0 || destination !== 'none';
    messageRequest.current = null;
    if (!messageStale && !unavailable) setMessageError('');
    onDirtyChange(dirty || messageDraft.current);
  }

  function clearMessage() {
    setMessage(''); setButtonDestination('none'); setButtonLabel(''); setButtonUrl(''); setMessageNotice('');
    messageDraft.current = false; messageRequest.current = null;
    if (!messageStale && !unavailable) setMessageError('');
    onDirtyChange(dirty);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || busy || dirty || unavailable || messageStale) return;
    const body = message.replace(/\r\n?/g, '\n').trim();
    if (!body || body.length > 1000 || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(body.replace(/\n/g, ''))) {
      setMessageError(!body ? 'Enter a message before sending.' : 'Use at most 1,000 characters of plain text. Line breaks are allowed; tabs and special control characters are not.');
      messageInput.current?.focus(); return;
    }
    let action: NotificationAction | undefined;
    if (buttonDestination !== 'none') {
      const label = normalizeNotificationActionLabel(buttonLabel);
      const url = normalizeNotificationActionUrl(actionUrl);
      if (!label) {
        setMessageError('Enter a button label using 1–60 characters of plain text.');
        buttonLabelInput.current?.focus(); return;
      }
      if (!url) {
        setMessageError(buttonDestination === 'custom' ? 'Enter a complete HTTPS link, such as https://example.com/help.' : 'This saved destination is unavailable. Choose another destination or no button.');
        if (buttonDestination === 'custom') buttonUrlInput.current?.focus();
        return;
      }
      action = { label, url };
    }
    messageRequest.current ??= crypto.randomUUID();
    setBusy(true); setSendingMessage(true); setMessageError(''); setMessageNotice(''); onDirtyChange(true);
    try {
      const response = await fetch(endpoint + '/notifications', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: messageRequest.current, message: body, ...(action ? { action } : {}) }) });
      const result = await response.json() as { notification?: { id: string; type: string; body: string; action?: NotificationAction }; created?: boolean; error?: string };
      if (!mounted.current) return;
      if (!response.ok) { messageConflict.current = response.status === 409; setMessageFailureStatus(response.status); setMessageError(result.error || 'Could not send this website message.'); return; }
      if (!result.notification?.id || result.notification.type !== 'message' || result.notification.body !== body || typeof result.created !== 'boolean' ||
        (result.notification.action?.label ?? null) !== (action?.label ?? null) || (result.notification.action?.url ?? null) !== (action?.url ?? null)) throw new Error('Unconfirmed message');
      clearMessage();
      setMessageFailureStatus(0); setMessageNotice('Website message sent to ' + record.customer.name + '.');
    } catch {
      if (mounted.current) setMessageError('Could not confirm delivery. Retry to check the same message without sending a duplicate.');
    } finally {
      if (mounted.current) { setBusy(false); setSendingMessage(false); onDirtyChange(dirty || messageDraft.current); }
    }
  }

  return <section className="commerce-panel" aria-labelledby="commerce-customer-title">
    <div className="commerce-panel-heading">
      <button type="button" className="admin-text-button" disabled={busy} onClick={() => {
        if (dirty || messageDirty) { setError('Save or cancel profile edits, and send or clear your message draft before returning to customers.'); return; }
        onDirtyChange(false); onBack();
      }}><ArrowLeft size={16}/>Back to customers</button>
      <h2 ref={heading} id="commerce-customer-title" tabIndex={-1}>Customer details</h2>
      {record && <div className="commerce-customer"><strong>{record.customer.name}</strong><span>{customerContact(record.customer)}</span></div>}
    </div>
    {loading ? <p className="commerce-empty" role="status">Loading customer…</p> : record && <>
      <form className="commerce-customer-form" onSubmit={save}>
        <fieldset disabled={busy || unavailable} className="commerce-customer-fields">
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
          <div className="commerce-customer-summary"><span>Pending orders: <strong>{record.summary.pending}</strong></span><span>Approved orders: <strong>{record.summary.approved}</strong></span><span>Rejected orders: <strong>{record.summary.rejected}</strong></span><span>Giveaway entries: <strong>{record.summary.giveawayEntries}</strong></span></div>
          <div className="commerce-customer-actions">
            <button type="submit" className="admin-button admin-button-primary" disabled={!dirty || failureStatus === 409}>{busy ? <LoaderCircle size={16} className="admin-spinner"/> : <Save size={16}/>}Save customer</button>
            {dirty && <button type="button" className="admin-button admin-button-secondary" onClick={() => { if (failureStatus === 409) { void load(); return; } change(record.customer.name, record.customer.email ?? ''); setError(''); }}>{failureStatus === 409 ? 'Discard edits and reload' : 'Cancel edits'}</button>}
          </div>
        </fieldset>
      </form>
      <section className="commerce-customer-message" aria-labelledby="customer-message-title">
        <h3 id="customer-message-title">Website message</h3>
        <p>Send a notification only to <strong>{record.customer.name}</strong> in their website account. It is not sent to Telegram.</p>
        <form onSubmit={sendMessage}>
          <fieldset disabled={busy || dirty || messageStale || unavailable} className="commerce-customer-message-fields">
            <label className="admin-field" htmlFor="customer-message"><span>Message</span>
              <textarea ref={messageInput} id="customer-message" value={message} rows={4} required maxLength={1000} dir="auto"
                aria-describedby="customer-message-help customer-message-length" onChange={event => changeMessage(event.target.value)}/>
            </label>
            <div className="commerce-message-hints"><p id="customer-message-help">Visible to this customer. Use plain text; do not include passwords or private staff notes.</p><span id="customer-message-length">{message.length} / 1000</span></div>
            <div className="commerce-message-button-fields">
              <label className="admin-field" htmlFor="customer-message-destination">Button <small>Optional</small>
                <select id="customer-message-destination" value={buttonDestination} onChange={event => {
                  const destination = event.target.value as ButtonDestination;
                  changeButton(destination, destinations.find(item => item.value === destination)?.label ?? '', '');
                }}>
                  <option value="none">No button</option>
                  {destinations.map(item => <option key={item.value} value={item.value}>{item.name}</option>)}
                  <option value="custom">Custom link</option>
                </select>
              </label>
              {buttonDestination !== 'none' && <>
                <label className="admin-field" htmlFor="customer-message-button-label">Button text
                  <input ref={buttonLabelInput} id="customer-message-button-label" value={buttonLabel} maxLength={60} required dir="auto" autoComplete="off"
                    onChange={event => changeButton(buttonDestination, event.target.value, buttonUrl)}/>
                </label>
                {buttonDestination === 'custom' ? <label className="admin-field commerce-message-button-url" htmlFor="customer-message-button-url">Destination link
                  <input ref={buttonUrlInput} id="customer-message-button-url" type="url" inputMode="url" value={buttonUrl} maxLength={2048} required placeholder="https://example.com/help" autoComplete="off" autoCapitalize="none" spellCheck={false}
                    aria-describedby="customer-message-button-help" onChange={event => changeButton(buttonDestination, buttonLabel, event.target.value)}/>
                  <small id="customer-message-button-help">Use a complete HTTPS link. External links open in a new tab.</small>
                </label> : <p className="commerce-message-button-url commerce-message-help">Destination: <span dir="ltr">{actionUrl}</span></p>}
                <div className="commerce-message-button-preview"><span>Button preview</span><span className="commerce-message-preview-button" dir="auto">{buttonLabel.trim() || 'Button text'}<ArrowRight size={16} aria-hidden="true"/></span></div>
              </>}
            </div>
            <button type="submit" className="admin-button admin-button-primary" disabled={!message.trim()}>
              {sendingMessage ? <LoaderCircle size={16} className="admin-spinner"/> : <Send size={16}/>} {sendingMessage ? 'Sending…' : 'Send website message'}
            </button>
          </fieldset>
        </form>
        {dirty && <p className="commerce-message-help">Save or cancel profile edits before sending a message.</p>}
        {messageError && <div className="commerce-message-error" role="alert"><p>{messageError}</p>
          {messageFailureStatus === 401 ? <a href="/admin/login">Sign in again</a> : (messageStale || unavailable) && <button type="button" className="admin-text-button" disabled={busy || loading} onClick={() => void load()}>Reload customer</button>}
        </div>}
        {messageNotice && <p className="admin-feedback admin-feedback-success" role="status">{messageNotice}</p>}
        {messageDirty && <button type="button" className="admin-text-button" disabled={busy} onClick={() => { clearMessage(); requestAnimationFrame(() => { if (!messageStale && !unavailable && !dirty) messageInput.current?.focus(); else heading.current?.focus(); }); }}>Clear message draft</button>}
      </section>
      <div className="commerce-customer-delete">
        <h3>Delete customer</h3>
        <p>Permanently delete this customer, their {record.summary.orders} orders and {record.summary.giveawayEntries} giveaway entries. Their current sessions and connected sign-in records will be removed. This cannot be undone.</p>
        {deleting ? <>
          <label className="admin-field">Type <strong>{record.customer.name}</strong> to confirm<input ref={confirmationInput} value={confirmation} autoComplete="off" disabled={busy || dirty || messageDirty || unavailable} onChange={event => setConfirmation(event.target.value)}/></label>
          {(dirty || messageDirty) && <p>Save or cancel profile edits, and send or clear your message draft before deleting this customer.</p>}
          <div className="commerce-customer-actions"><button type="button" className="admin-button commerce-danger-button" disabled={busy || dirty || messageDirty || unavailable || confirmation !== record.customer.name || failureStatus === 409} onClick={() => void remove()}>{busy ? <LoaderCircle size={16} className="admin-spinner"/> : <Trash2 size={16}/>}Delete customer permanently</button><button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={() => { setDeleting(false); setConfirmation(''); requestAnimationFrame(() => heading.current?.focus()); }}>Cancel</button></div>
        </> : <button type="button" className="admin-button commerce-danger-outline" disabled={busy || unavailable} onClick={() => { setDeleting(true); requestAnimationFrame(() => confirmationInput.current?.focus()); }}><Trash2 size={16}/>Delete customer…</button>}
      </div>
    </>}
    {notice && <p className="admin-feedback admin-feedback-success" role="status">{notice}</p>}
    {error && <div className="commerce-form-error" role="alert"><p>{error}</p>{failureStatus === 401 ? <a href="/admin/login">Sign in again</a> : <button type="button" className="admin-text-button" disabled={busy || loading} onClick={() => void load()}>Reload customer</button>}</div>}
  </section>;
}
