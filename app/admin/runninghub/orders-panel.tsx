'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, LoaderCircle, Search, X } from 'lucide-react';
import OrderReview from './order-review';
import { mmk, orderDate, orderLabels, reference, type AdminOrder, type RunningHubData } from './types';

export default function OrdersPanel({ data, initialOrder, onChanged, onDirtyChange, onAuthExpired }: {
  data: RunningHubData; initialOrder: string | null; onChanged: () => Promise<RunningHubData | undefined>;
  onDirtyChange: (dirty: boolean) => void; onAuthExpired: () => void;
}) {
  const [selectedId, setSelectedId] = useState(initialOrder);
  const [filter, setFilter] = useState<'all' | AdminOrder['status']>('payment_review');
  const [search, setSearch] = useState('');
  const [olderOrder, setOlderOrder] = useState<AdminOrder | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [retryOrder, setRetryOrder] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listedOrder = data.orders.find(order => order.id === selectedId);
  const selected = listedOrder ?? (olderOrder?.id === selectedId && !loadingOrder ? olderOrder : undefined);
  useEffect(() => {
    if (!selectedId || data.orders.some(order => order.id === selectedId)) return;
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setLoadingOrder(true); setOlderOrder(null); setOrderError('');
      try {
        const response = await fetch(`/api/admin/runninghub/orders/${selectedId}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        const result = await response.json().catch(() => null) as { order?: AdminOrder; error?: string } | null;
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { onAuthExpired(); return; }
        if (!response.ok || result?.order?.id !== selectedId) { setOrderError(result?.error || 'Could not load this order. Try again.'); return; }
        setOlderOrder(result.order);
      } catch { if (!controller.signal.aborted) setOrderError('Could not connect to this order. Try again.'); }
      finally { if (!controller.signal.aborted) setLoadingOrder(false); }
    });
    return () => controller.abort();
  }, [selectedId, data.orders, onAuthExpired, retryOrder]);
  const term = search.trim().toLowerCase();
  const shown = data.orders.filter(order => (filter === 'all' || order.status === filter) &&
    [order.id, reference(order.id), order.customerId, order.customerName, order.customerEmail, order.packLabel, order.keyId]
      .some(value => value?.toLowerCase().includes(term)));
  function close() {
    setSelectedId(null); setOrderError(''); setOlderOrder(null); onDirtyChange(false);
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : searchInput.current)?.focus());
  }

  if (selected) return <OrderReview key={`${selected.id}:${selected.revision}`} order={selected} onChanged={onChanged}
    onDirtyChange={onDirtyChange} onAuthExpired={onAuthExpired} onClose={close}/>;
  if (selectedId && !listedOrder && (loadingOrder || orderError)) return <section className="rh-panel">
    {loadingOrder ? <p role="status"><LoaderCircle size={18} className="admin-spinner" aria-hidden="true"/> Loading order…</p>
      : <div className="admin-feedback admin-feedback-error" role="alert"><div><p>{orderError}</p><button type="button" onClick={() => setRetryOrder(value => value + 1)}>Try again</button></div></div>}
    <button className="admin-text-button" type="button" onClick={close}>Back to orders</button>
  </section>;

  return <section className="rh-panel" aria-labelledby="rh-orders-heading">
    <div className="rh-panel-heading"><h2 id="rh-orders-heading">Payments and deliveries</h2><p>Approving a verified payment automatically delivers its reserved key.</p></div>
    <div className="rh-order-tools">
      <label className="admin-search"><Search size={17} aria-hidden="true"/><span className="admin-sr-only">Search Running HUB orders</span>
        <input ref={searchInput} value={search} onChange={event => setSearch(event.target.value)} placeholder="Customer, order or key ID" autoComplete="off"/>
        {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={16} aria-hidden="true"/></button>}
      </label>
      <label className="admin-field" htmlFor="rh-order-filter"><span className="admin-sr-only">Order status</span><select id="rh-order-filter" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
        <option value="payment_review">Review payment</option><option value="approved">Key delivered</option><option value="awaiting_payment">Awaiting payment</option>
        <option value="rejected">Payment rejected</option><option value="expired">Reservation expired</option><option value="all">All orders</option>
      </select></label>
    </div>
    {shown.length ? <ul className="rh-order-list">{shown.map(order => <li key={order.id}>
      <button className="rh-order-row" type="button" onClick={event => { trigger.current = event.currentTarget; setSelectedId(order.id); }}>
        <span className="rh-order-customer"><strong>{order.customerName || `Customer ${reference(order.customerId)}`}</strong><span>{order.customerEmail || `Customer ID ${reference(order.customerId)}`}</span><span>Order #{reference(order.id)} · {orderDate(order.createdAt)}</span></span>
        <span className="rh-order-pack"><strong>{order.packLabel}</strong><span>{mmk(order.priceMmk)}</span>{order.keyId && <span>Key ID {reference(order.keyId)}</span>}</span>
        <span className={`rh-status rh-status-${order.status}`}>{orderLabels[order.status]}</span><ChevronRight size={17} aria-hidden="true"/>
      </button>
    </li>)}</ul> : <div className="rh-empty"><h3>{term ? 'No matching orders' : filter === 'payment_review' ? 'No payments awaiting review' : 'No orders in this view'}</h3>
      <p>{term ? 'Try a customer name, order reference or key ID.' : filter === 'payment_review' ? 'Submitted receipts will appear here.' : 'Choose another status to see more orders.'}</p>
      {(term || filter !== 'all') && <button type="button" className="admin-text-button" onClick={() => { setSearch(''); setFilter('all'); }}>Show all orders</button>}
    </div>}
    <p className="rh-list-footer">{shown.length} {shown.length === 1 ? 'order' : 'orders'} in the latest 200 records · Dates shown in Myanmar time</p>
  </section>;
}
