'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, RefreshCw, Search, X, Pencil, Trash2, Plus } from 'lucide-react';
import type { CommerceCustomer, CommerceOrder } from '@/lib/commerce-types';
import { customerContact } from '@/lib/customer-identity';
import OrderEditor, { orderReference, orderStageLabel, orderTotal } from './order-editor';
import CustomerEditor from './customer-editor';
import RemoveOrderDialog from './remove-order-dialog';
import CreateOrder from './create-order';
import './commerce.css';

type CommerceData = { customers: CommerceCustomer[]; orders: CommerceOrder[] };
const dateFormat = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Yangon' });

export default function AdminCommerce({ view, customerId, telegramContact, onDirtyChange, clearCustomer, showCustomerOrders }: {
  view: 'orders' | 'customers';
  customerId: string | null;
  telegramContact: string | null;
  onDirtyChange: (dirty: boolean) => void;
  clearCustomer: () => void;
  showCustomerOrders: (id: string) => void;
}) {
  const [data, setData] = useState<CommerceData | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | CommerceOrder['status']>(customerId ? 'all' : 'pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<{ id: string; deleting: boolean } | null>(null);
  const [creatingOrder, setCreatingOrder] = useState<{ customerId: string | null; fromCustomerEditor: boolean } | null>(null);
  const [removingOrder, setRemovingOrder] = useState<CommerceOrder | null>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [authExpired, setAuthExpired] = useState(false);
  const [notice, setNotice] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const orderTrigger = useRef<HTMLButtonElement | null>(null);
  const createTrigger = useRef<HTMLButtonElement | null>(null);
  const listHeading = useRef<HTMLLabelElement>(null);

  function invalidateRefresh() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setRefreshing(false);
    setError('');
    setAuthExpired(false);
  }

  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const isCurrent = () => activeRequest.current === controller && !controller.signal.aborted;
    setRefreshing(true);
    setError('');
    setAuthExpired(false);
    try {
      const response = await fetch('/api/admin/commerce', {
        cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      });
      const result = await response.json() as CommerceData & { error?: string };
      if (!isCurrent()) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setData(current => isCurrent() ? null : current);
        setAuthExpired(current => isCurrent() ? response.status === 401 : current);
        setError(current => isCurrent() ? result.error || 'Could not load the latest records.' : current);
        return;
      }
      // Recheck inside queued state updates as well: a successful local mutation
      // can invalidate this response before React applies an already queued update.
      setData(current => isCurrent() ? result : current);
      return true;
    } catch {
      if (isCurrent()) setError(current => isCurrent() ? 'Could not load the latest records. Check your connection and try again.' : current);
    } finally {
      if (isCurrent()) setRefreshing(current => isCurrent() ? false : current);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Start the request after mounting so a discarded render doesn't fetch any records.
    queueMicrotask(() => { if (!controller.signal.aborted) void refresh(); });
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (selectedId || creatingOrder) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [selectedId, creatingOrder, refresh]);

  const customers = data?.customers ?? [];
  const orders = data?.orders ?? [];
  const customersById = new Map(customers.map(customer => [customer.id, customer]));
  const counts = new Map<string, number>();
  for (const order of orders) if (order.customerId) counts.set(order.customerId, (counts.get(order.customerId) ?? 0) + 1);

  const scopedOrders = customerId ? orders.filter(order => order.customerId === customerId) : orders;
  const pendingCount = scopedOrders.filter(order => order.status === 'pending').length;
  const approvedCount = scopedOrders.filter(order => order.status === 'approved').length;
  const rejectedCount = scopedOrders.filter(order => order.status === 'rejected').length;
  const scopedCustomer = customerId ? customersById.get(customerId) : undefined;
  const selected = orders.find(order => order.id === selectedId);
  const term = search.trim().toLowerCase();
  const shownOrders = scopedOrders.filter(order => {
    if (filter !== 'all' && order.status !== filter) return false;
    const customer = order.customerId ? customersById.get(order.customerId) : undefined;
    return [order.id, orderReference(order.id), orderStageLabel(order), customer?.name, customer && customerContact(customer), order.guestName, order.customerId === null ? 'Telegram guest' : '',
      ...order.lines.flatMap(line => [line.productName, line.planName])]
      .some(value => value?.toLowerCase().includes(term));
  });
  const shownCustomers = customers.filter(customer => (customer.name + ' ' + customerContact(customer)).toLowerCase().includes(term));

  function backToList() {
    setSelectedId(null);
    requestAnimationFrame(() => {
      const trigger = orderTrigger.current?.isConnected ? orderTrigger.current : listHeading.current;
      trigger?.focus();
    });
  }

  function createOrder(id: string | null, trigger: HTMLButtonElement, fromCustomerEditor = false) {
    invalidateRefresh();
    createTrigger.current = trigger;
    setNotice(''); setSelectedId(null);
    setCreatingOrder({ customerId: id, fromCustomerEditor });
  }

  return <div className="admin-commerce">
    {error && <div className="admin-feedback admin-feedback-error" role="alert">
      <div><p>{error}</p>{authExpired ? <a href="/admin/login">Sign in again</a>
        : <button type="button" disabled={refreshing} onClick={() => void refresh()}>Try again</button>}</div>
    </div>}
    {notice && <p role="status" className="admin-feedback admin-feedback-success"><Check size={17} />{notice}</p>}
    {creatingOrder ? <CreateOrder customers={customers} initialCustomerId={creatingOrder.customerId} onDirtyChange={onDirtyChange}
      onBack={() => {
        const fromCustomerEditor = creatingOrder.fromCustomerEditor;
        setCreatingOrder(null);
        requestAnimationFrame(() => {
          if (createTrigger.current?.isConnected) createTrigger.current.focus();
          else if (fromCustomerEditor) document.getElementById('commerce-customer-title')?.focus();
          else listHeading.current?.focus();
        });
      }}
      onCreated={order => {
        invalidateRefresh();
        setData(current => current ? { ...current, orders: [order, ...current.orders.filter(row => row.id !== order.id)] } : current);
        setCreatingOrder(null); setEditingCustomer(null); setSelectedId(order.id); setFilter(order.status);
        setNotice(order.status === 'pending' ? 'Pending order saved. Review the original purchase dates and approve when ready.' : 'Existing order loaded. No duplicate was created.');
        requestAnimationFrame(() => document.getElementById('commerce-order-title')?.focus());
      }} /> : view === 'customers' && editingCustomer ? <CustomerEditor key={editingCustomer.id} id={editingCustomer.id} startDeleting={editingCustomer.deleting}
      telegramContact={telegramContact}
      onCreateOrder={(customer, trigger) => createOrder(customer.id, trigger, true)}
      onDirtyChange={onDirtyChange} onBack={() => { setEditingCustomer(null); requestAnimationFrame(() => listHeading.current?.focus()); }}
      onSaved={customer => {
        invalidateRefresh();
        setData(current => current ? { ...current, customers: current.customers.map(row => row.id === customer.id ? customer : row) } : current);
      }}
      onRemoved={id => {
        invalidateRefresh();
        setData(current => current ? { customers: current.customers.filter(row => row.id !== id), orders: current.orders.filter(order => order.customerId !== id) } : current);
        setEditingCustomer(null); if (customerId === id) clearCustomer(); setNotice('Customer and their associated records deleted.');
        requestAnimationFrame(() => listHeading.current?.focus());
    }} /> : selected ? <OrderEditor key={selected.id + '-' + selected.revision} order={selected} customer={selected.customerId ? customersById.get(selected.customerId) : undefined}
      backLabel={view === 'customers' ? 'Back to customers' : 'Back to orders'}
      onDirtyChange={onDirtyChange} onBack={backToList} onRemove={(order, trigger) => { removeTrigger.current = trigger; setRemovingOrder(order); }}
      onReload={async () => { if (await refresh()) onDirtyChange(false); }}
      onSaved={order => {
        invalidateRefresh();
        setData(current => current ? { ...current, orders: current.orders.map(row => row.id === order.id ? order : row) } : current);
        setFilter(order.status);
        if (order.checkout && order.status === 'pending') {
          setNotice(order.checkout.stage === 'processing' ? selected.checkout?.stage === 'quote_required'
            ? 'Quote saved. This complimentary order is ready for fulfillment.' : 'Payment approved. Fulfill the purchase, then mark this order completed.'
            : order.checkout.stage === 'payment_rejected' ? 'Payment rejected. The customer can review your note and submit new proof.'
              : 'Quote saved. The customer can continue to payment.');
          requestAnimationFrame(() => document.getElementById('commerce-order-title')?.focus());
          return;
        }
        setNotice(order.status === 'rejected'
          ? selected.status === 'rejected' ? 'Customer note updated.' : order.customerId ? 'Order rejected. Status updated in the customer’s order history.' : 'Guest order rejected. Decision saved in the order record.'
          : selected.status === 'pending' ? selected.customerId ? 'Order approved and added to the customer’s history.' : 'Guest order approved. Dates saved in the order record.' : 'Order details and customer note updated.');
        backToList();
      }} /> : data ? <section className="commerce-panel" aria-label={view === 'orders' ? 'Order list' : 'Customer directory'}>
      <div className="commerce-list-tools">
        <div className="commerce-heading-line">
          <label htmlFor="commerce-search" className="commerce-list-title" ref={listHeading} tabIndex={-1}>
            {view === 'orders' ? scopedCustomer ? 'Orders for ' + scopedCustomer.name : 'Order list' : 'Customer directory'}
          </label>
          <div className="commerce-list-actions">
          {view === 'orders' && <button type="button" className="admin-button admin-button-primary" disabled={refreshing || !customers.length || (!!customerId && !scopedCustomer)} onClick={event => createOrder(scopedCustomer?.id ?? null, event.currentTarget)}><Plus size={16}/>Create order</button>}
          <button type="button" disabled={refreshing} className="admin-text-button" onClick={() => void refresh()}>
            <RefreshCw size={15} className={refreshing ? 'admin-spinner' : undefined} />Refresh
          </button>
          </div>
        </div>
        {scopedCustomer && <div className="commerce-heading-line"><p>{customerContact(scopedCustomer)}</p>
          <button type="button" className="admin-text-button" onClick={clearCustomer}>View all customers’ orders</button>
        </div>}
        <div className="admin-search commerce-search">
          <Search size={17} aria-hidden="true" />
          <input id="commerce-search" type="search" aria-label={view === 'orders' ? 'Search orders' : 'Search customers'}
            placeholder={view === 'orders' ? 'Search orders, services or customers…' : 'Search name, email or Telegram…'}
            value={search} onChange={event => setSearch(event.target.value)} />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}
        </div>
        {view === 'orders' && <div className="commerce-filters" role="group" aria-label="Filter orders by status">
          {(['pending', 'approved', 'rejected', 'all'] as const).map(status => <button key={status} type="button"
            aria-pressed={filter === status} onClick={() => setFilter(status)}>
            {status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'All'}
            <span>{status === 'pending' ? pendingCount : status === 'approved' ? approvedCount : status === 'rejected' ? rejectedCount : scopedOrders.length}</span>
          </button>)}
        </div>}
      </div>
      {view === 'customers' ? shownCustomers.length ? <ul className="commerce-rows">{shownCustomers.map(customer =>
        <li key={customer.id} className="commerce-action-row"><button type="button" className="commerce-row" onClick={() => { setSelectedId(null); showCustomerOrders(customer.id); }}
          aria-label={'View orders for ' + customer.name + ', ' + customerContact(customer)}>
          <span className="commerce-row-main"><strong>{customer.name}</strong><span>{customerContact(customer)}</span></span>
          <span className="commerce-row-end"><strong>{counts.get(customer.id) ?? 0} {(counts.get(customer.id) ?? 0) === 1 ? 'order' : 'orders'}</strong>
            <span>Joined {dateFormat.format(new Date(customer.createdAt))}</span></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button><div className="commerce-row-actions">
          <button type="button" className="admin-text-button" aria-label={'Create order for ' + customer.name} onClick={event => createOrder(customer.id, event.currentTarget)}><Plus size={16}/>Create order</button>
          <button type="button" className="admin-text-button" aria-label={'Edit customer ' + customer.name} onClick={() => { setEditingCustomer({ id: customer.id, deleting: false }); setNotice(''); }}><Pencil size={16}/>Edit</button>
          <button type="button" className="admin-text-button commerce-danger-link" aria-label={'Delete customer ' + customer.name} onClick={() => { setEditingCustomer({ id: customer.id, deleting: true }); setNotice(''); }}><Trash2 size={16}/>Delete</button>
        </div></li>)}</ul> : <p className="commerce-empty">{term ? 'No matching customers.' : 'No customers have registered yet.'}</p>
      : shownOrders.length ? <ul className="commerce-rows">{shownOrders.map(order => {
        const customer = order.customerId ? customersById.get(order.customerId) : undefined;
        return <li key={order.id} className="commerce-action-row"><button className="commerce-row" type="button" onClick={event => {
          orderTrigger.current = event.currentTarget;
          setSelectedId(order.id);
          setNotice('');
          requestAnimationFrame(() => document.getElementById('commerce-order-title')?.focus());
        }}>
          <span className="commerce-row-main"><strong>{orderReference(order.id)} <span className="commerce-status" data-status={order.status} data-stage={order.checkout?.stage}>{orderStageLabel(order)}</span></strong>
            <span>{customer ? customer.name + ' · ' + customerContact(customer) : order.guestName ? order.guestName + ' · Guest' : order.customerId === null ? 'Telegram guest' : 'Customer'}</span>
            <span>{order.lines.map(line => line.productName + (line.planName ? ' · ' + line.planName : '')).join(', ')}</span>
          </span>
          <span className="commerce-row-end"><strong>{orderTotal(order)}</strong>
            <span>{dateFormat.format(new Date(order.createdAt))}</span></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button><div className="commerce-row-actions"><button type="button" className="admin-text-button commerce-danger-link" aria-label={(order.status === 'approved' ? 'Delete approved order ' : order.status === 'rejected' ? 'Remove rejected order ' : 'Remove pending order ') + orderReference(order.id)} onClick={event => { removeTrigger.current = event.currentTarget; setRemovingOrder(order); }}><Trash2 size={16}/>{order.status === 'approved' ? 'Delete' : 'Remove'}</button></div></li>;
      })}</ul> : <p className="commerce-empty">{term ? 'No matching orders.' : filter === 'pending' ? 'No orders are waiting for approval.' : filter === 'approved' ? 'No approved orders yet.' : filter === 'rejected' ? 'No rejected orders.' : 'No orders yet.'}</p>}
    </section> : refreshing && <p className="commerce-empty" role="status">Loading {view}…</p>}
    {removingOrder && <RemoveOrderDialog key={removingOrder.id} order={removingOrder}
      onClose={() => { setRemovingOrder(null); requestAnimationFrame(() => { if (removeTrigger.current?.isConnected) removeTrigger.current.focus(); else listHeading.current?.focus(); }); }}
      onReload={() => { setRemovingOrder(null); setSelectedId(null); onDirtyChange(false); void refresh(); }}
      onRemoved={id => {
        invalidateRefresh();
        setData(current => current ? { ...current, orders: current.orders.filter(order => order.id !== id) } : current);
        setRemovingOrder(null); if (selectedId === id) setSelectedId(null);
        onDirtyChange(false); setNotice(removingOrder.status === 'approved' ? 'Approved order and its saved plan details deleted.' : removingOrder.status === 'rejected' ? 'Rejected order removed.' : 'Pending order removed.');
        requestAnimationFrame(() => listHeading.current?.focus());
      }}/>}
  </div>;
}
