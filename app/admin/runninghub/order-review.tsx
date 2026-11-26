'use client';

/* Receipts remain behind authenticated, non-cached endpoints. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { mmk, orderDate, orderLabels, paymentLabels, reference, type AdminOrder, type RunningHubData } from './types';

type Decision = 'approve' | 'reject';
type PendingDecision = { action: Decision; revision: number; requestId: string; proofRequestId?: string; note?: string };

export default function OrderReview({ order, onChanged, onDirtyChange, onAuthExpired, onClose }: {
  order: AdminOrder; onChanged: () => Promise<RunningHubData | undefined>; onDirtyChange: (dirty: boolean) => void;
  onAuthExpired: () => void; onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');
  const [receiptError, setReceiptError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const revealRequest = useRef<AbortController | null>(null);
  const pending = useRef<PendingDecision | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const dirty = !!note || busy || uncertain;
  const reviewable = order.status === 'payment_review' && !!order.proofRequestId;
  const locked = busy || uncertain || conflict || done;
  const receipt = order.proofUrl?.startsWith('/api/') && !order.proofUrl.startsWith('//') ? order.proofUrl : null;

  useEffect(() => { heading.current?.focus(); return () => { request.current?.abort(); revealRequest.current?.abort(); }; }, []);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== 'visible') { revealRequest.current?.abort(); revealRequest.current = null; setRevealing(false); setApiKey(''); } };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    if (!apiKey) return;
    const timer = window.setTimeout(() => setApiKey(''), 60000);
    return () => window.clearTimeout(timer);
  }, [apiKey]);

  function close() {
    if (dirty && !window.confirm('Close this order and discard unsaved review inputs?')) return;
    onClose();
  }
  function prepareRejection() {
    if (locked || !reviewable) return;
    setError(''); setRejecting(true);
    requestAnimationFrame(() => confirmationHeading.current?.focus());
  }
  async function decide(action: Decision) {
    if (busy || request.current || conflict || done || !reviewable) return;
    if (uncertain && pending.current?.action !== action) return;
    const payload = pending.current ?? {
      action, revision: order.revision, requestId: crypto.randomUUID(),
      ...(action === 'approve' ? { proofRequestId: order.proofRequestId! } : {}),
      ...(action === 'reject' && note.trim() ? { note: note.trim() } : {}),
    };
    pending.current = payload;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/runninghub/orders/${order.id}`, { method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      const result = await response.json().catch(() => null) as { error?: string; order?: AdminOrder } | null;
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { onAuthExpired(); return; }
      if (!response.ok) {
        setError(result?.error || 'This order could not be updated. Your review inputs are still here.');
        if (response.status === 409) { setConflict(true); setRejecting(false); setUncertain(false); pending.current = null; }
        else if (response.status < 500 && response.status !== 408) { setUncertain(false); setRejecting(false); pending.current = null; }
        else setUncertain(true);
        return;
      }
      if (result?.order?.id !== order.id || result.order.revision <= payload.revision ||
        (payload.action === 'approve' ? result.order.status !== 'approved' || !result.order.keyId || !result.order.approvedAt : result.order.status !== 'rejected')) {
        throw new Error('Unconfirmed order decision');
      }
      setDone(true); setNote(''); setRejecting(false); setUncertain(false); pending.current = null;
      setNotice(payload.action === 'approve' ? 'Payment approved. The key was delivered to the customer’s website account.' : 'Payment rejected. The order has been updated.');
      await onChanged();
    } catch {
      if (!controller.signal.aborted) { setUncertain(true); setError('Could not confirm the result. Retry this same decision to check it safely.'); }
    } finally { if (request.current === controller) { request.current = null; if (!controller.signal.aborted) setBusy(false); } }
  }
  async function reload() {
    if (dirty && !window.confirm('Load the current order and discard these review inputs?')) return;
    const latest = await onChanged();
    if (latest) { setNote(''); setConflict(false); setRejecting(false); setError(''); }
  }
  async function reveal() {
    if (revealing || revealRequest.current || order.status !== 'approved' || !order.keyId) return;
    setRevealError(''); setRevealing(true);
    const controller = new AbortController(); revealRequest.current = controller;
    try {
      const response = await fetch(`/api/admin/runninghub/orders/${order.id}/reveal`, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: order.id }), signal: controller.signal });
      const result = await response.json().catch(() => null) as { apiKey?: string; error?: string } | null;
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { onAuthExpired(); return; }
      if (!response.ok || typeof result?.apiKey !== 'string' || !result.apiKey) { setRevealError(result?.error || 'Could not reveal the delivered key. Try again.'); return; }
      if (document.visibilityState === 'visible') setApiKey(result.apiKey);
    } catch { if (!controller.signal.aborted) setRevealError('Could not connect to reveal this key. Try again.'); }
    finally { if (revealRequest.current === controller) { revealRequest.current = null; if (!controller.signal.aborted) setRevealing(false); } }
  }

  return <section className="rh-panel rh-review" aria-labelledby="rh-review-heading">
    <button type="button" className="admin-text-button rh-back" onClick={close}><ArrowLeft size={16} aria-hidden="true"/>All Running HUB orders</button>
    <div className="rh-review-title"><div><h2 id="rh-review-heading" tabIndex={-1} ref={heading}>Order #{reference(order.id)}</h2><p>{order.customerName || `Customer ${reference(order.customerId)}`}{order.customerEmail && <span> · {order.customerEmail}</span>}</p></div><span className={`rh-status rh-status-${order.status}`}>{orderLabels[order.status]}</span></div>
    <dl className="rh-order-facts">
      <div><dt>Bundle</dt><dd>{order.packLabel}</dd></div><div><dt>Payment amount</dt><dd>{mmk(order.priceMmk)}</dd></div>
      <div><dt>Created</dt><dd>{orderDate(order.createdAt)}</dd></div><div><dt>{order.approvedAt ? 'Delivered' : 'Reservation expires'}</dt><dd>{orderDate(order.approvedAt || order.expiresAt)}</dd></div>
      <div><dt>Customer ID</dt><dd className="rh-id">{order.customerId}</dd></div>{order.keyId && <div><dt>Delivered key ID</dt><dd className="rh-id">{order.keyId}</dd></div>}
    </dl>
    {notice && <div className="admin-feedback admin-feedback-success" role="status"><Check size={18} aria-hidden="true"/><p>{notice}</p></div>}
    {error && <div className="admin-feedback admin-feedback-error" role="alert"><CircleAlert size={18} aria-hidden="true"/><p>{error}</p></div>}
    {conflict && <div className="rh-confirmation"><p>Review the latest order before making another decision. Your inputs remain here until you reload.</p><button type="button" className="admin-text-button" disabled={busy} onClick={() => void reload()}>Reload order</button></div>}
    <div className="rh-review-grid">
      <section className="rh-receipt" aria-labelledby="rh-receipt-heading"><h3 id="rh-receipt-heading">Payment receipt</h3>
        {receipt ? <a href={receipt} target="_blank" rel="noopener noreferrer">{receiptError ? <p className="rh-help">The receipt preview could not load. Open the full receipt to try again.</p> : <img src={receipt} width={440} height={620} alt="Customer payment receipt" onError={() => setReceiptError(true)}/>}<span>Open full receipt <ArrowUpRight size={15} aria-hidden="true"/></span></a>
          : <p className="rh-help">{order.status === 'awaiting_payment' ? 'The customer has not submitted a receipt yet.' : 'No receipt is available for this order.'}</p>}
      </section>
      <section className="rh-review-action" aria-labelledby="rh-check-heading"><h3 id="rh-check-heading">Receiving account</h3>
        <dl className="rh-recipient"><div><dt>Method</dt><dd>{paymentLabels[order.payment.id]}</dd></div><div><dt>Account name</dt><dd>{order.payment.accountLabel}</dd></div><div><dt>Receiving number</dt><dd>{order.payment.accountNumber}</dd></div></dl>
        {reviewable && !done && <>
          <p className="rh-help">Confirm that {mmk(order.priceMmk)} reached this account before approving. Approval immediately issues the reserved key.</p>
          {rejecting ? <div className="rh-confirmation" role="group" aria-label="Reject payment">
            <h4 ref={confirmationHeading} tabIndex={-1}>Reject this payment?</h4>
            <label className="admin-field" htmlFor="rh-review-note">Customer note <span className="admin-optional">Optional</span><textarea id="rh-review-note" rows={3} maxLength={1000} disabled={locked} value={note} onChange={event => setNote(event.target.value)} /><small>Tell the customer what to check.</small></label>
            <div className="rh-action-buttons"><button type="button" className="admin-button admin-button-primary" disabled={busy || conflict || done} onClick={() => void decide('reject')}>{busy && <LoaderCircle size={16} className="admin-spinner" aria-hidden="true"/>}{busy ? 'Updating…' : uncertain ? 'Retry rejection' : 'Confirm rejection'}</button>
              {!uncertain && <button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={() => { setRejecting(false); setNote(''); requestAnimationFrame(() => document.getElementById('rh-reject-payment')?.focus()); }}>Keep reviewing</button>}</div>
          </div> : <div className="rh-action-buttons">
            <button id="rh-approve-payment" type="button" className="admin-button admin-button-primary" disabled={busy || conflict || done} onClick={() => void decide('approve')}>{busy && <LoaderCircle size={16} className="admin-spinner" aria-hidden="true"/>}{busy ? 'Approving…' : uncertain ? 'Retry approval' : 'Approve payment & issue key'}</button>
            <button id="rh-reject-payment" type="button" className="admin-button admin-button-secondary" disabled={locked} onClick={prepareRejection}>Reject payment</button>
          </div>}
        </>}
        {order.note && <div className="rh-saved-note"><h4>Customer note</h4><p>{order.note}</p></div>}
        {order.status === 'approved' && order.keyId && <div className="rh-delivery"><h3>Delivered key</h3><p className="rh-help">The customer can view this key in their account. Reveal it only when needed for support; it hides after one minute or when you leave this tab.</p>
          {apiKey ? <><label className="admin-field" htmlFor="rh-revealed-key">API key<textarea id="rh-revealed-key" readOnly value={apiKey} rows={3} autoComplete="off" spellCheck={false} onFocus={event => event.currentTarget.select()}/></label><button type="button" className="admin-button admin-button-secondary" onClick={() => setApiKey('')}><EyeOff size={16} aria-hidden="true"/>Hide key</button></>
            : <button type="button" className="admin-button admin-button-secondary" disabled={revealing} onClick={() => void reveal()}>{revealing ? <LoaderCircle size={16} className="admin-spinner" aria-hidden="true"/> : <Eye size={16} aria-hidden="true"/>}{revealing ? 'Revealing…' : 'Reveal delivered key'}</button>}
          {revealError && <p role="alert" className="rh-inline-error">{revealError}</p>}
        </div>}
      </section>
    </div>
  </section>;
}
