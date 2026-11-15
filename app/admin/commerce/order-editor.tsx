import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle, Save } from 'lucide-react';
import type { CommerceCustomer, CommerceOrder, CommerceOrderLine } from '@/lib/commerce-types';
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

export default function OrderEditor({ order, customer, onSaved, onBack, onReload, onDirtyChange }: {
  order: CommerceOrder;
  customer?: CommerceCustomer;
  onSaved: (order: CommerceOrder) => void;
  onBack: () => void;
  onReload: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [original] = useState(() => order.lines.map(initialDetails));
  const [details, setDetails] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failureStatus, setFailureStatus] = useState(0);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const dirty = JSON.stringify(original) !== JSON.stringify(details);
  const pending = order.status === 'pending';

  function updateLine(id: string, change: Partial<LineDetails>) {
    const next = details.map(item => item.id === id ? { ...item, ...change } : item);
    setDetails(next);
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(original));
    if (failureStatus !== 409) setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setFailureStatus(0);
    try {
      const response = await fetch('/api/admin/commerce/' + encodeURIComponent(order.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ revision: order.revision, lines: details }),
      });
      const result = await response.json() as { order: CommerceOrder; error?: string };
      if (!response.ok) {
        setFailureStatus(response.status);
        setError(result.error || 'The order could not be saved. Try again.');
        return;
      }
      onDirtyChange(false);
      onSaved(result.order);
    } catch {
      setError('Could not confirm the save. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  return <section className="commerce-panel" aria-labelledby="commerce-order-title">
    <div className="commerce-panel-heading">
      <button type="button" className="admin-text-button" disabled={busy} onClick={() => {
        if (dirty && !window.confirm('Discard your edits and return to orders?')) return;
        onDirtyChange(false);
        onBack();
      }}><ArrowLeft size={16} />Back to orders</button>
      <div className="commerce-heading-line">
        <h2 id="commerce-order-title" tabIndex={-1}>Order {orderReference(order.id)}</h2>
        <span className="commerce-status" data-status={order.status}>{pending ? 'Pending' : 'Approved'}</span>
      </div>
      {customer && <div className="commerce-customer"><strong>{customer.name}</strong><span>{customerContact(customer)}</span></div>}
      {order.customerId === null && <div className="commerce-customer"><strong>{order.guestName ?? 'Telegram guest'}</strong><span>Guest order</span></div>}
      {pending && <p>{order.customerId === null ? 'Match the order reference with the Telegram message. Confirm payment and deliver access in that chat, then approve the dates here.' : customer?.telegram ? 'Match the reference, name and Telegram ID with the customer’s message. Confirm payment and deliver access in that chat, then approve the dates here.' : 'Match the reference, name and email with the customer’s Telegram message. Confirm payment and deliver access in that chat, then approve the dates here.'}</p>}
    </div>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="commerce-fieldset">
        {order.lines.map((line, index) => {
          const item = details[index];
          return <section className="commerce-item" key={line.id} aria-labelledby={'order-item-' + line.id}>
            <div className="commerce-item-summary">
              <h3 id={'order-item-' + line.id}>{line.productName}</h3>
              {line.planName && <p className="commerce-plan-name">{line.planName}</p>}
              <p className="commerce-item-meta">{[line.duration, 'Qty ' + line.quantity, line.price ? line.price + ' each' : 'Price on request'].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="commerce-dates">
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
            </details>}
          </section>;
        })}
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
          <button type="submit" className="admin-button admin-button-primary" disabled={busy || failureStatus === 409 || (!pending && !dirty)}>
            {busy ? <LoaderCircle className="admin-spinner" size={16} /> : pending ? <Check size={16} /> : <Save size={16} />}
            {busy ? 'Saving…' : pending ? 'Approve order' : 'Save changes'}
          </button>
        </div>
      </fieldset>
    </form>
  </section>;
}
