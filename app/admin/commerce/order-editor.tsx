import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle, Save } from 'lucide-react';
import type { CommerceCustomer, CommerceOrder, CommerceOrderLine } from '@/lib/commerce-types';
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
    accountInfo: line.accountInfo,
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
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failureStatus, setFailureStatus] = useState(0);
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
      <p>{customer?.name} {customer && '·'} {customer?.email}</p>
    </div>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="commerce-fieldset">
        {order.lines.map((line, index) => {
          const item = details[index];
          const hasSavedInfo = Boolean(original[index].accountInfo);
          const showInfo = !hasSavedInfo || visible[line.id];
          const infoId = 'account-info-' + line.id;
          return <fieldset className="commerce-item" key={line.id}>
            <legend>{line.productName}{line.planName && ' · ' + line.planName}</legend>
            <p className="commerce-item-meta">{[line.duration, 'Qty ' + line.quantity, line.price ? line.price + ' each' : 'Price on request'].filter(Boolean).join(' · ')}</p>
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
            <div className="admin-field commerce-access">
              <div className="commerce-heading-line">
                <label htmlFor={showInfo ? infoId : undefined}>Purchased account details <span className="admin-optional">Optional</span></label>
                {hasSavedInfo && <button type="button" className="admin-text-button" aria-expanded={Boolean(visible[line.id])}
                  onClick={() => setVisible(current => ({ ...current, [line.id]: !current[line.id] }))}>
                  {showInfo ? <EyeOff size={15} /> : <Eye size={15} />}{showInfo ? 'Hide details' : 'Show details'}
                </button>}
              </div>
              {showInfo && <textarea id={infoId} rows={3} maxLength={4000} autoComplete="off" autoCapitalize="none" spellCheck={false}
                aria-describedby={infoId + '-hint'} value={item.accountInfo}
                onChange={event => updateLine(item.id, { accountInfo: event.target.value })} />}
              <small id={infoId + '-hint'}>The customer can view these sign-in details or instructions in their order history.</small>
            </div>
          </fieldset>;
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
