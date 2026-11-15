'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import type { CommerceOrder } from '@/lib/commerce-types';
import { orderReference, orderTotal } from './order-editor';

export default function RemoveOrderDialog({ order, onClose, onRemoved, onReload }: {
  order: CommerceOrder;
  onClose: () => void;
  onRemoved: (id: string) => void;
  onReload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const reference = orderReference(order.id);
  const approved = order.status === 'approved';
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const preventLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLeaving);
    return () => window.removeEventListener('beforeunload', preventLeaving);
  }, [busy]);

  async function remove() {
    if (busy || stale || confirmation.trim().toUpperCase() !== reference) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/commerce/' + encodeURIComponent(order.id), {
        method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: order.revision, confirmation: order.id }),
      });
      const result = await response.json() as { removed?: boolean; id?: string; error?: string };
      if (!response.ok) {
        setError(result.error || 'Could not remove this order.');
        setStale([404, 409].includes(response.status)); return;
      }
      if (!result.removed || result.id !== order.id) throw new Error('Unconfirmed removal');
      onRemoved(order.id);
    } catch { setError('Could not confirm removal. Refresh orders before trying again.'); setStale(true); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="commerce-remove-dialog" aria-labelledby="remove-order-title" aria-describedby="remove-order-description"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="commerce-remove-content">
      <h2 id="remove-order-title">{approved ? 'Delete approved order ' : 'Remove pending order '}{reference}?</h2>
      <p id="remove-order-description">{approved
        ? order.customerId === null
          ? 'Permanently delete this approved guest order, including its saved plan dates and purchased account details. This cannot be undone.'
          : 'Permanently delete this approved order, including its saved plan dates and purchased account details. It will be removed from the customer’s order history and plan list. This cannot be undone.'
        : 'Permanently remove this pending order and its tracking record. This cannot be undone.'}</p>
      <p><strong>{orderTotal(order)}</strong> · {order.lines.map(line => line.productName).join(', ')}</p>
      <label className="admin-field"><span>Type <strong>{reference}</strong> to confirm</span><input value={confirmation} autoComplete="off" disabled={busy || stale} onChange={event => setConfirmation(event.target.value)} /></label>
      {error && <p className="commerce-form-error" role="alert">{error}</p>}
      <div className="commerce-customer-actions">
        <button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={onClose}>Cancel</button>
        {stale ? <button type="button" className="admin-button admin-button-primary" onClick={onReload}>Refresh orders</button>
          : <button type="button" className="admin-button commerce-danger-button" disabled={busy || confirmation.trim().toUpperCase() !== reference} onClick={() => void remove()}>
            {busy ? <LoaderCircle size={16} className="admin-spinner"/> : <Trash2 size={16}/>} {approved ? 'Delete order' : 'Remove order'}
          </button>}
      </div>
    </div>
  </dialog>;
}
