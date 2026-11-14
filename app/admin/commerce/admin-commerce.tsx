'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import type { CommerceCustomer, CommerceOrder } from '@/lib/commerce-types';
import OrderEditor, { orderReference, orderTotal } from './order-editor';
import './commerce.css';

type CommerceData = { customers: CommerceCustomer[]; orders: CommerceOrder[] };
const dateFormat = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Yangon' });

export default function AdminCommerce({ view, customerId, onDirtyChange, clearCustomer, showCustomerOrders }: {
  view: 'orders' | 'customers';
  customerId: string | null;
  onDirtyChange: (dirty: boolean) => void;
  clearCustomer: () => void;
  showCustomerOrders: (id: string) => void;
}) {
  const [data, setData] = useState<CommerceData | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>(customerId ? 'all' : 'pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [authExpired, setAuthExpired] = useState(false);
  const [notice, setNotice] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const orderTrigger = useRef<HTMLButtonElement | null>(null);
  const listHeading = useRef<HTMLLabelElement>(null);

  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setRefreshing(true);
    setError('');
    setAuthExpired(false);
    try {
      const response = await fetch('/api/admin/commerce', {
        cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      });
      const result = await response.json() as CommerceData & { error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setData(null);
        setAuthExpired(response.status === 401);
        setError(result.error || 'Could not load the latest records.');
        return;
      }
      setData(result);
      return true;
    } catch {
      if (!controller.signal.aborted) setError('Could not load the latest records. Check your connection and try again.');
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
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
    if (selectedId) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [selectedId, refresh]);

  const customers = data?.customers ?? [];
  const orders = data?.orders ?? [];
  const customersById = new Map(customers.map(customer => [customer.id, customer]));
  const counts = new Map<string, number>();
  for (const order of orders) counts.set(order.customerId, (counts.get(order.customerId) ?? 0) + 1);

  const scopedOrders = customerId ? orders.filter(order => order.customerId === customerId) : orders;
  const pendingCount = scopedOrders.filter(order => order.status === 'pending').length;
  const scopedCustomer = customerId ? customersById.get(customerId) : undefined;
  const selected = orders.find(order => order.id === selectedId);
  const term = search.trim().toLowerCase();
  const shownOrders = scopedOrders.filter(order => {
    if (filter !== 'all' && order.status !== filter) return false;
    const customer = customersById.get(order.customerId);
    return [order.id, orderReference(order.id), customer?.name, customer?.email,
      ...order.lines.flatMap(line => [line.productName, line.planName])]
      .some(value => value?.toLowerCase().includes(term));
  });
  const shownCustomers = customers.filter(customer => (customer.name + ' ' + customer.email).toLowerCase().includes(term));

  function backToList() {
    setSelectedId(null);
    requestAnimationFrame(() => {
      const trigger = orderTrigger.current?.isConnected ? orderTrigger.current : listHeading.current;
      trigger?.focus();
    });
  }

  return <div className="admin-commerce">
    {error && <div className="admin-feedback admin-feedback-error" role="alert">
      <div><p>{error}</p>{authExpired ? <a href="/admin/login">Sign in again</a>
        : <button type="button" disabled={refreshing} onClick={() => void refresh()}>Try again</button>}</div>
    </div>}
    {notice && <p role="status" className="admin-feedback admin-feedback-success"><Check size={17} />{notice}</p>}
    {selected ? <OrderEditor key={selected.id + '-' + selected.revision} order={selected} customer={customersById.get(selected.customerId)}
      onDirtyChange={onDirtyChange} onBack={backToList}
      onReload={async () => { if (await refresh()) onDirtyChange(false); }}
      onSaved={order => {
        setData(current => current ? { ...current, orders: current.orders.map(row => row.id === order.id ? order : row) } : current);
        setFilter('approved');
        setNotice(selected.status === 'pending' ? 'Order approved and added to the customer’s history.' : 'Order details updated.');
        backToList();
      }} /> : data ? <section className="commerce-panel" aria-label={view === 'orders' ? 'Order list' : 'Customer directory'}>
      <div className="commerce-list-tools">
        <div className="commerce-heading-line">
          <label htmlFor="commerce-search" className="commerce-list-title" ref={listHeading} tabIndex={-1}>
            {view === 'orders' ? scopedCustomer ? 'Orders for ' + scopedCustomer.name : 'Order list' : 'Customer directory'}
          </label>
          <button type="button" disabled={refreshing} className="admin-text-button" onClick={() => void refresh()}>
            <RefreshCw size={15} className={refreshing ? 'admin-spinner' : undefined} />Refresh
          </button>
        </div>
        {scopedCustomer && <div className="commerce-heading-line"><p>{scopedCustomer.email}</p>
          <button type="button" className="admin-text-button" onClick={clearCustomer}>View all customers’ orders</button>
        </div>}
        <div className="admin-search commerce-search">
          <Search size={17} aria-hidden="true" />
          <input id="commerce-search" type="search" aria-label={view === 'orders' ? 'Search orders' : 'Search customers'}
            placeholder={view === 'orders' ? 'Search orders, services or customers…' : 'Search name or email…'}
            value={search} onChange={event => setSearch(event.target.value)} />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}
        </div>
        {view === 'orders' && <div className="commerce-filters" role="group" aria-label="Filter orders by status">
          {(['pending', 'approved', 'all'] as const).map(status => <button key={status} type="button"
            aria-pressed={filter === status} onClick={() => setFilter(status)}>
            {status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'All'}
            <span>{status === 'pending' ? pendingCount : status === 'approved' ? scopedOrders.length - pendingCount : scopedOrders.length}</span>
          </button>)}
        </div>}
      </div>
      {view === 'customers' ? shownCustomers.length ? <ul className="commerce-rows">{shownCustomers.map(customer =>
        <li key={customer.id}><button type="button" className="commerce-row" onClick={() => showCustomerOrders(customer.id)}
          aria-label={'View orders for ' + customer.name + ', ' + customer.email}>
          <span className="commerce-row-main"><strong>{customer.name}</strong><span>{customer.email}</span></span>
          <span className="commerce-row-end"><strong>{counts.get(customer.id) ?? 0} {(counts.get(customer.id) ?? 0) === 1 ? 'order' : 'orders'}</strong>
            <span>Joined {dateFormat.format(new Date(customer.createdAt))}</span></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button></li>)}</ul> : <p className="commerce-empty">{term ? 'No matching customers.' : 'No customers have registered yet.'}</p>
      : shownOrders.length ? <ul className="commerce-rows">{shownOrders.map(order => {
        const customer = customersById.get(order.customerId);
        return <li key={order.id}><button className="commerce-row" type="button" onClick={event => {
          orderTrigger.current = event.currentTarget;
          setSelectedId(order.id);
          setNotice('');
          requestAnimationFrame(() => document.getElementById('commerce-order-title')?.focus());
        }}>
          <span className="commerce-row-main"><strong>{orderReference(order.id)} <span className="commerce-status" data-status={order.status}>{order.status === 'pending' ? 'Pending' : 'Approved'}</span></strong>
            <span>{customer?.name ?? 'Customer'}{customer ? ' · ' + customer.email : ''}</span>
            <span>{order.lines.map(line => line.productName + (line.planName ? ' · ' + line.planName : '')).join(', ')}</span>
          </span>
          <span className="commerce-row-end"><strong>{orderTotal(order)}</strong>
            <span>{dateFormat.format(new Date(order.createdAt))}</span></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button></li>;
      })}</ul> : <p className="commerce-empty">{term ? 'No matching orders.' : filter === 'pending' ? 'No orders are waiting for approval.' : filter === 'approved' ? 'No approved orders yet.' : 'No orders yet.'}</p>}
    </section> : refreshing && <p className="commerce-empty" role="status">Loading {view}…</p>}
  </div>;
}
