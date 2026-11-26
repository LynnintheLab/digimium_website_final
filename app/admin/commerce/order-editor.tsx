import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, AtSign, Check, Eye, EyeOff, LoaderCircle, Phone, Save, Smartphone, Trash2, X } from 'lucide-react';
import type { AdminCommerceOrder, CommerceCustomer, CommerceOrder, CommerceOrderLine } from '@/lib/commerce-types';
import { customerContact } from '@/lib/customer-identity';
import { suggestedEndDate, todayInMyanmar } from './order-dates';

export function orderReference(id: string) {
  return '#' + id.slice(0, 8).toUpperCase();
}

export function orderTotal(order: CommerceOrder) {
  return order.totalMmk === null ? 'Price on request' : order.totalMmk.toLocaleString('en-US') + ' MMK';
}

function initialDetails(line: CommerceOrderLine) {
  const startDate = line.startDate ?? todayInMyanmar();
  return {
    id: line.id, startDate, endDate: line.endDate ?? suggestedEndDate(startDate, line.duration),
    accountDetails: { account: '', password: '', manager: '', username: '', ...line.accountDetails },
  };
}
type LineDetails = ReturnType<typeof initialDetails>;

const checkoutContactMethods = {
  'telegram-username': { label: 'Telegram username', Icon: AtSign },
  'telegram-phone': { label: 'Telegram phone number', Icon: Smartphone },
  'viber-phone': { label: 'Viber phone number', Icon: Phone },
};

export default function OrderEditor({ order, customer, onSaved, onBack, onReload, onDirtyChange, onRemove, backLabel = 'Back to orders' }: {
  order: AdminCommerceOrder;
  customer?: CommerceCustomer;
  onSaved: (order: AdminCommerceOrder) => void;
  onBack: () => void;
  onReload: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onRemove: (order: CommerceOrder, trigger: HTMLButtonElement) => void;
  backLabel?: string;
}) {
  const pending = order.status === 'pending';
  const rejected = order.status === 'rejected';
  const checkoutContact = order.checkoutContact;
  const contactMethod = checkoutContact ? checkoutContactMethods[checkoutContact.method] : null;
  const [original] = useState(() => rejected ? [] : order.lines.map(initialDetails));
  const [details, setDetails] = useState(original);
  const [customerNote, setCustomerNote] = useState(order.customerNote ?? '');
  const [rejecting, setRejecting] = useState(false);
  const rejectTrigger = useRef<HTMLButtonElement>(null);
  const rejectHeading = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failureStatus, setFailureStatus] = useState(0);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const dirty = JSON.stringify(original) !== JSON.stringify(details) || customerNote !== (order.customerNote ?? '');

  function updateLine(id: string, change: Partial<LineDetails>) {
    const next = details.map(item => item.id === id ? { ...item, ...change } : item);
    setDetails(next);
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(original) || customerNote !== (order.customerNote ?? ''));
    if (failureStatus !== 409) setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rejecting) return;
    await save(rejected ? 'note' : 'approve');
  }

  async function save(action: 'approve' | 'reject' | 'note') {
    if (busy || failureStatus === 409 || (action === 'reject' && (!pending || !rejecting))) return;
    setBusy(true);
    onDirtyChange(true);
    setError('');
    setFailureStatus(0);
    let saved = false;
    try {
      const response = await fetch('/api/admin/commerce/' + encodeURIComponent(order.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(action === 'approve'
          ? { revision: order.revision, lines: details, customerNote }
          : { action, revision: order.revision, customerNote }),
      });
      const result = await response.json() as { order: AdminCommerceOrder; error?: string };
      if (!response.ok) {
        setFailureStatus(response.status);
        setError(result.error || 'The order could not be saved. Try again.');
        return;
      }
      saved = true;
      onDirtyChange(false);
      onSaved(result.order);
    } catch {
      setError('Could not confirm the save. Check your connection and try again.');
    } finally { setBusy(false); if (!saved) onDirtyChange(dirty); }
  }

  return <section className="commerce-panel" aria-labelledby="commerce-order-title">
    <div className="commerce-panel-heading">
      <button type="button" className="admin-text-button" disabled={busy} onClick={() => {
        if (dirty && !window.confirm('Discard your edits and return to orders?')) return;
        onDirtyChange(false);
        onBack();
      }}><ArrowLeft size={16} />{backLabel}</button>
      <div className="commerce-heading-line">
        <h2 id="commerce-order-title" tabIndex={-1}>Order {orderReference(order.id)}</h2>
        <span className="commerce-status" data-status={order.status}>{rejected ? 'Rejected' : pending ? 'Pending' : 'Approved'}</span>
      </div>
      <button type="button" className="admin-text-button commerce-danger-link" disabled={busy} onClick={event => onRemove(order, event.currentTarget)}><Trash2 size={16}/>{rejected ? 'Remove rejected order' : pending ? 'Remove pending order' : 'Delete approved order'}</button>
      {customer && <div className="commerce-customer"><strong>{customer.name}</strong><span>{customerContact(customer)}</span></div>}
      {order.customerId === null && <div className="commerce-customer"><strong>{order.guestName ?? 'Telegram guest'}</strong><span>Guest order</span></div>}
      {checkoutContact && contactMethod && <dl className="commerce-order-contact">
        <dt><contactMethod.Icon size={16} aria-hidden />{contactMethod.label}</dt>
        <dd dir="ltr">{checkoutContact.value}</dd>
      </dl>}
      {pending && <p>Match the Order ID in the customer’s Telegram message. Confirm payment and deliver access in that chat, then approve the dates here.</p>}
      {rejected && <p>This order was rejected. You can update the customer note; no subscription dates or account details are assigned.</p>}
    </div>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="commerce-fieldset">
        {order.lines.map((line, index) => {
          const item = details[index];
          return <section className="commerce-item" data-readonly={rejected || undefined} key={line.id} aria-labelledby={'order-item-' + line.id}>
            <div className="commerce-item-summary">
              <h3 id={'order-item-' + line.id}>{line.productName}</h3>
              {line.planName && <p className="commerce-plan-name">{line.planName}</p>}
              <p className="commerce-item-meta">{[line.duration, 'Qty ' + line.quantity, line.price ? line.price + ' each' : 'Price on request'].filter(Boolean).join(' · ')}</p>
            </div>
            {!rejected && <><div className="commerce-dates">
              <label className="admin-field">Start date
                <input type="date" required max="9999-12-31" value={item.startDate} onChange={event => {
                  const startDate = event.target.value;
                  const autoEnd = !item.endDate || item.endDate === suggestedEndDate(item.startDate, line.duration);
                  updateLine(item.id, autoEnd ? { startDate, endDate: suggestedEndDate(startDate, line.duration) } : { startDate });
                }} />
              </label>
              <label className="admin-field">Expiry date
                <input type="date" required min={item.startDate || undefined} max="9999-12-31" value={item.endDate}
                  onChange={event => updateLine(item.id, { endDate: event.target.value })} />
              </label>
            </div>
            <fieldset className="commerce-account-fields">
              <legend>Purchased account details <span>Optional</span></legend>
              <p>Leave any field blank. You can approve the order without these details. Saved values appear in the customer’s purchased order history.</p>
              <div className="commerce-account-grid">
                <label className="admin-field">Account
                  <input type="text" autoComplete="off" maxLength={500} value={item.accountDetails.account}
                    onChange={event => updateLine(item.id, { accountDetails: { ...item.accountDetails, account: event.target.value } })} />
                </label>
                <label className="admin-field">Password
                  <span className="commerce-password-field">
                    <input type={visiblePasswords[item.id] ? 'text' : 'password'} autoComplete="new-password" maxLength={1000} value={item.accountDetails.password}
                      onChange={event => updateLine(item.id, { accountDetails: { ...item.accountDetails, password: event.target.value } })} />
                    <button type="button" aria-label={`${visiblePasswords[item.id] ? 'Hide' : 'Show'} purchased password for ${line.productName}`} aria-pressed={!!visiblePasswords[item.id]}
                      onClick={() => setVisiblePasswords(current => ({ ...current, [item.id]: !current[item.id] }))}>
                      {visiblePasswords[item.id] ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                    </button>
                  </span>
                </label>
                <label className="admin-field">Manager
                  <input type="text" autoComplete="off" maxLength={500} value={item.accountDetails.manager}
                    onChange={event => updateLine(item.id, { accountDetails: { ...item.accountDetails, manager: event.target.value } })} />
                </label>
                <label className="admin-field">Username
                  <input type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={500} value={item.accountDetails.username}
                    onChange={event => updateLine(item.id, { accountDetails: { ...item.accountDetails, username: event.target.value } })} />
                </label>
              </div>
            </fieldset>
            {line.accountInfo && <details className="commerce-legacy-details">
              <summary>Previously saved account details</summary>
              <p dir="auto">{line.accountInfo}</p>
            </details>}</>}
          </section>;
        })}
        <section className="commerce-customer-note">
          <label className="admin-field" htmlFor="order-customer-note"><span>Customer note <small>Optional</small></span>
            <textarea id="order-customer-note" value={customerNote} maxLength={1000} rows={4} aria-describedby="order-customer-note-help"
              onChange={event => {
                const next = event.target.value;
                setCustomerNote(next);
                onDirtyChange(JSON.stringify(details) !== JSON.stringify(original) || next !== (order.customerNote ?? ''));
                if (failureStatus !== 409) setError('');
              }}/>
          </label>
          <p id="order-customer-note-help">Visible to this customer in their website order history. Do not include passwords or private staff notes. For guest orders, it stays in this order record.</p>
          <span className="commerce-note-length">{customerNote.length} / 1000</span>
        </section>
        {rejecting && <section className="commerce-reject-confirm" role="group" aria-labelledby="reject-order-title" aria-describedby="reject-order-description">
          <h3 ref={rejectHeading} id="reject-order-title" tabIndex={-1}>Reject order {orderReference(order.id)}?</h3>
          <p id="reject-order-description">The order will be marked Rejected. The customer note above will be saved; entered subscription dates and account details will not be saved. This order cannot be approved afterward.</p>
          <div className="commerce-customer-actions">
            <button type="button" className="admin-button admin-button-secondary" onClick={() => { setRejecting(false); requestAnimationFrame(() => rejectTrigger.current?.focus()); }}>Cancel</button>
            <button type="button" className="admin-button commerce-danger-button" disabled={failureStatus === 409} onClick={() => void save('reject')}>
              {busy ? <LoaderCircle size={16} className="admin-spinner"/> : <X size={16}/>}Reject order
            </button>
          </div>
        </section>}
        {error && <div className="commerce-form-error" role="alert">
          <p>{error}</p>
          {failureStatus === 409 && <button type="button" className="admin-text-button" onClick={async () => {
            if (dirty && !window.confirm('Load the latest order and discard these edits?')) return;
            setBusy(true);
            try { await onReload(); } finally { setBusy(false); }
          }}>Load latest order</button>}
          {failureStatus === 401 && <a className="admin-text-button" href="/admin/login">Sign in again</a>}
        </div>}
        <div className="commerce-save">
          <div><span>Order total</span><strong>{orderTotal(order)}</strong></div>
          <div className="commerce-save-actions">
          {pending && <button ref={rejectTrigger} type="button" className="admin-button commerce-danger-outline" disabled={busy || rejecting || failureStatus === 409} onClick={() => { setRejecting(true); requestAnimationFrame(() => rejectHeading.current?.focus()); }}><X size={16}/>Reject…</button>}
          <button type="submit" className="admin-button admin-button-primary" disabled={busy || rejecting || failureStatus === 409 || (!pending && !dirty)}>
            {busy ? <LoaderCircle className="admin-spinner" size={16} /> : pending ? <Check size={16} /> : <Save size={16} />}
            {busy ? 'Saving…' : pending ? 'Approve order' : rejected ? 'Save customer note' : 'Save changes'}
          </button>
          </div>
        </div>
      </fieldset>
    </form>
  </section>;
}
