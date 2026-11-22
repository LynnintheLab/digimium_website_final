import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowUpRight, Check, Eye, EyeOff, LoaderCircle, Save, Trash2, X } from 'lucide-react';
import type { CommerceCustomer, CommerceOrder, CommerceOrderLine } from '@/lib/commerce-types';
import { PAYMENT_METHODS, type CustomerOrderInput } from '@/lib/payment';
import { parseMmk } from '@/lib/pricing';
import { customerContact } from '@/lib/customer-identity';
import { suggestedEndDate, todayInMyanmar } from './order-dates';

export function orderReference(id: string) {
  return '#' + id.slice(0, 8).toUpperCase();
}

export function orderTotal(order: CommerceOrder) {
  return order.totalMmk === null ? 'Price on request' : order.totalMmk.toLocaleString('en-US') + ' MMK';
}

export function orderStageLabel(order: CommerceOrder) {
  if (order.status === 'rejected') return 'Rejected';
  if (!order.checkout) return order.status === 'approved' ? 'Approved' : 'Pending';
  const labels = {
    quote_required: 'Quote required', awaiting_payment: 'Awaiting payment', payment_review: 'Review payment',
    payment_rejected: 'Payment rejected', processing: 'Processing', completed: 'Completed',
  };
  return labels[order.checkout.stage];
}

function initialDetails(line: CommerceOrderLine) {
  const startDate = line.startDate ?? todayInMyanmar();
  return {
    id: line.id, startDate, endDate: line.endDate ?? suggestedEndDate(startDate, line.duration),
    accountDetails: { account: '', password: '', manager: '', username: '', ...line.accountDetails },
  };
}
type LineDetails = ReturnType<typeof initialDetails>;

export default function OrderEditor({ order, customer, onSaved, onBack, onReload, onDirtyChange, onRemove, backLabel = 'Back to orders' }: {
  order: CommerceOrder;
  customer?: CommerceCustomer;
  onSaved: (order: CommerceOrder) => void;
  onBack: () => void;
  onReload: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onRemove: (order: CommerceOrder, trigger: HTMLButtonElement) => void;
  backLabel?: string;
}) {
  const pending = order.status === 'pending';
  const rejected = order.status === 'rejected';
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
  const [customerInputs, setCustomerInputs] = useState<CustomerOrderInput[] | null>(null);
  const [inputError, setInputError] = useState('');
  const [inputReload, setInputReload] = useState(0);
  const [visibleInputs, setVisibleInputs] = useState<Record<string, boolean>>({});
  const [quotePrices, setQuotePrices] = useState(() => order.lines.map(line => ({ id: line.id, value: parseMmk(line.price)?.toString() ?? '' })));
  const [paymentNote, setPaymentNote] = useState(order.checkout?.payment?.note ?? '');
  const [paymentDirty, setPaymentDirty] = useState(false);
  const fulfillmentDirty = JSON.stringify(original) !== JSON.stringify(details) || customerNote !== (order.customerNote ?? '');
  const dirty = fulfillmentDirty || paymentDirty;
  const checkout = order.checkout;
  const payment = checkout?.payment;
  const canFulfill = !checkout || checkout.stage === 'processing' || checkout.stage === 'completed' || order.totalMmk === 0;
  const quotedTotal = quotePrices.reduce<number | null>((total, item, index) => {
    const price = parseMmk(item.value, true);
    if (total === null || price === undefined) return null;
    const next = total + price * order.lines[index].quantity;
    return Number.isSafeInteger(next) ? next : null;
  }, 0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDetails() {
      try {
        const response = await fetch('/api/admin/commerce/' + encodeURIComponent(order.id), {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json() as { order: CommerceOrder; customerInputs: CustomerOrderInput[]; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setInputError(result.error || 'Customer details could not be loaded.');
          if (response.status === 401) setFailureStatus(401);
          return;
        }
        if (result.order.revision !== order.revision) {
          setFailureStatus(409);
          setError('This order changed. Load the latest order before reviewing payment or saving.');
          return;
        }
        setCustomerInputs(result.customerInputs);
        setInputError('');
      } catch {
        if (!controller.signal.aborted) setInputError('Customer details could not be loaded. Check your connection and try again.');
      }
    }
    void loadDetails();
    return () => controller.abort();
  }, [order.id, order.revision, inputReload]);

  function updateLine(id: string, change: Partial<LineDetails>) {
    const next = details.map(item => item.id === id ? { ...item, ...change } : item);
    setDetails(next);
    onDirtyChange(paymentDirty || JSON.stringify(next) !== JSON.stringify(original) || customerNote !== (order.customerNote ?? ''));
    if (failureStatus !== 409) setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rejecting || (!rejected && !canFulfill)) return;
    await save(rejected ? 'note' : 'approve');
  }

  async function save(action: 'approve' | 'reject' | 'note' | 'quote' | 'payment-approve' | 'payment-reject') {
    if (busy || failureStatus === 409 || (action === 'reject' && (!pending || !rejecting))) return;
    const paymentAction = action === 'quote' || action === 'payment-approve' || action === 'payment-reject';
    if (paymentAction && fulfillmentDirty && !window.confirm('Continue with this payment action and discard your unsaved subscription or customer-note edits?')) return;
    if (action === 'quote' && quotedTotal === null) {
      setError('Enter a valid whole-MMK unit price for every item.');
      return;
    }
    setBusy(true);
    onDirtyChange(true);
    setError('');
    setFailureStatus(0);
    let saved = false;
    try {
      const body = action === 'quote' ? {
        action, revision: order.revision, lines: quotePrices.map(item => ({ id: item.id, unitPriceMmk: parseMmk(item.value, true) })),
      } : action === 'payment-approve' || action === 'payment-reject' ? {
        action, revision: order.revision, note: paymentNote,
      } : action === 'approve' ? { revision: order.revision, lines: details, customerNote }
        : { action, revision: order.revision, customerNote };
      const response = await fetch('/api/admin/commerce/' + encodeURIComponent(order.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const result = await response.json() as { order: CommerceOrder; error?: string };
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
        <span className="commerce-status" data-status={order.status} data-stage={checkout?.stage}>{orderStageLabel(order)}</span>
      </div>
      <button type="button" className="admin-text-button commerce-danger-link" disabled={busy} onClick={event => onRemove(order, event.currentTarget)}><Trash2 size={16}/>{rejected ? 'Remove rejected order' : pending ? 'Remove pending order' : 'Delete approved order'}</button>
      {customer && <div className="commerce-customer"><strong>{customer.name}</strong><span>{customerContact(customer)}</span></div>}
      {order.customerId === null && <div className="commerce-customer"><strong>{order.guestName ?? 'Telegram guest'}</strong><span>Guest order</span></div>}
      {pending && <p>{checkout
        ? canFulfill ? 'The order is ready for fulfillment. Enter the subscription dates and delivery details, then mark the order completed.' : 'Review the order and payment below. Approved payment moves the order to Processing.'
        : order.customerId === null ? 'Match the order reference with the Telegram message. Confirm payment and deliver access in that chat, then approve the dates here.' : customer?.telegram ? 'Match the reference, name and Telegram ID with the customer’s message. Confirm payment and deliver access in that chat, then approve the dates here.' : 'Match the reference, name and email with the customer’s Telegram message. Confirm payment and deliver access in that chat, then approve the dates here.'}</p>}
      {rejected && <p>This order was rejected. You can update the customer note; no subscription dates or account details are assigned.</p>}
    </div>
    {checkout && <section className="commerce-checkout-review" aria-labelledby="order-payment-heading">
      <h3 id="order-payment-heading">Payment</h3>
      {checkout.stage === 'quote_required' && !rejected && <fieldset className="commerce-quote-fields" disabled={busy || failureStatus === 409}>
        <legend>Quote this order</legend>
        <p>Set the actual whole-MMK unit price for each item. The saved quote lets the customer continue to payment.</p>
        {order.lines.map((line, index) => <label className="admin-field" key={line.id}>{line.productName}{line.planName ? ' · ' + line.planName : ''} · Qty {line.quantity}
          <input value={quotePrices[index].value} inputMode="numeric" autoComplete="off" maxLength={16} placeholder="Unit price in MMK"
            onChange={event => {
              setQuotePrices(current => current.map(item => item.id === line.id ? { ...item, value: event.target.value } : item));
              setPaymentDirty(true); onDirtyChange(true);
            }}/>
        </label>)}
        <p className="commerce-quote-total">Quote total <strong>{quotedTotal === null ? 'Enter all prices' : quotedTotal.toLocaleString('en-US') + ' MMK'}</strong></p>
        <button type="button" className="admin-button admin-button-primary" disabled={quotedTotal === null} onClick={() => void save('quote')}>{busy ? 'Saving…' : 'Save quote'}</button>
      </fieldset>}
      {payment ? <>
        <dl className="commerce-payment-facts">
          <div><dt>Method</dt><dd>{PAYMENT_METHODS.find(method => method.id === payment.method.id)?.name}</dd></div>
          <div><dt>Amount</dt><dd>{payment.amount} {payment.currency}</dd></div>
          <div><dt>Receiver</dt><dd>{payment.method.accountName}<br/>{payment.method.accountNumber}</dd></div>
          {payment.submittedAt && <div><dt>Submitted</dt><dd>{new Date(payment.submittedAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })} · Myanmar time</dd></div>}
          {payment.approvedAt && <div><dt>Approved</dt><dd>{new Date(payment.approvedAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })} · Myanmar time</dd></div>}
        </dl>
        {payment.proofUrl && <a className="commerce-payment-proof" href={payment.proofUrl} target="_blank" rel="noopener noreferrer">
          <Image src={payment.proofUrl} width={360} height={440} alt="Customer payment screenshot" unoptimized/>
          <span>Open payment screenshot<ArrowUpRight size={16}/></span>
        </a>}
        {checkout.stage === 'payment_review' && !rejected ? <fieldset className="commerce-payment-decision" disabled={busy || failureStatus === 409}>
          <legend>Review payment</legend>
          <p>Check the payment in the receiving account, then approve it or ask the customer to submit corrected proof.</p>
          <label className="admin-field">Payment review note <span className="admin-optional">Optional</span>
            <textarea rows={3} maxLength={1000} value={paymentNote} onChange={event => {
              setPaymentNote(event.target.value); setPaymentDirty(true); onDirtyChange(true);
            }}/>
          </label>
          <div className="commerce-customer-actions">
            <button type="button" className="admin-button admin-button-primary" onClick={() => void save('payment-approve')}><Check size={16}/>Approve payment</button>
            <button type="button" className="admin-button commerce-danger-outline" onClick={() => void save('payment-reject')}><X size={16}/>Reject payment</button>
          </div>
        </fieldset> : payment.note && <p className="commerce-payment-note">{payment.note}</p>}
      </> : checkout.stage !== 'quote_required' && <p>The customer can choose a payment method in their order.</p>}
    </section>}
    <section className="commerce-customer-inputs" aria-labelledby="order-customer-input-heading">
      <h3 id="order-customer-input-heading">Information supplied by customer</h3>
      {inputError ? <div role="alert"><p>{inputError}</p><button type="button" className="admin-text-button" onClick={() => { setInputError(''); setInputReload(value => value + 1); }}>Try again</button></div>
        : customerInputs === null ? <p role="status">Loading customer information…</p>
        : customerInputs.length ? customerInputs.map(input => <div className="commerce-customer-input-unit" key={`${input.lineId}-${input.unit}`}>
          <h4>{order.lines.find(line => line.id === input.lineId)?.productName} · Account {input.unit + 1}</h4>
          <dl>{input.fields.map(field => {
            const key = `${input.lineId}-${input.unit}-${field.id}`;
            return <div key={field.id}><dt>{field.label}</dt><dd>
              <span dir="auto">{field.type === 'password' && field.value && !visibleInputs[key] ? '••••••••' : field.value || '—'}</span>
              {field.type === 'password' && field.value && <button type="button" className="admin-text-button" aria-label={`${visibleInputs[key] ? 'Hide' : 'Show'} ${field.label} for account ${input.unit + 1}`} aria-pressed={!!visibleInputs[key]}
                onClick={() => setVisibleInputs(current => ({ ...current, [key]: !current[key] }))}>{visibleInputs[key] ? <EyeOff size={17}/> : <Eye size={17}/>}</button>}
            </dd></div>;
          })}</dl>
        </div>) : <p>No additional information was requested for this order.</p>}
    </section>
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
            {!rejected && canFulfill && <><div className="commerce-dates">
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
                onDirtyChange(paymentDirty || JSON.stringify(details) !== JSON.stringify(original) || next !== (order.customerNote ?? ''));
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
          {(canFulfill || rejected) && <button type="submit" className="admin-button admin-button-primary" disabled={busy || rejecting || failureStatus === 409 || (!pending && !dirty)}>
            {busy ? <LoaderCircle className="admin-spinner" size={16} /> : pending ? <Check size={16} /> : <Save size={16} />}
            {busy ? 'Saving…' : pending ? checkout ? 'Mark completed' : 'Approve order' : rejected ? 'Save customer note' : 'Save changes'}
          </button>}
          </div>
        </div>
      </fieldset>
    </form>
  </section>;
}
