'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import InventoryPanel from './inventory-panel';
import OrdersPanel from './orders-panel';
import PaymentSettings from './payment-settings';
import type { RunningHubData } from './types';

type Section = 'orders' | 'inventory' | 'payments';

export default function AdminRunningHub() {
  const [data, setData] = useState<RunningHubData | null>(null);
  const [section, setSection] = useState<Section>('orders');
  const [initialOrder, setInitialOrder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authExpired, setAuthExpired] = useState(false);
  const [dirty, setDirty] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  const expireSession = useCallback(() => {
    activeRequest.current?.abort();
    setData(null); setAuthExpired(true); setLoading(false); setDirty(false);
    setError('Your Admin session has ended. Sign in again to continue.');
  }, []);

  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const current = () => activeRequest.current === controller && !controller.signal.aborted;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/runninghub', {
        cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      });
      const result = await response.json() as RunningHubData & { error?: string };
      if (!current()) return;
      if (response.status === 401 || response.status === 403) { expireSession(); return; }
      if (!response.ok) { setError(result.error || 'Could not load Running HUB records. Try again.'); return; }
      setData(value => current() ? result : value); setAuthExpired(false);
      return result;
    } catch {
      if (current()) setError('Could not connect. Check your connection and try again.');
    } finally { if (current()) setLoading(false); }
  }, [expireSession]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const order = new URL(window.location.href).searchParams.get('order');
      if (order && /^[0-9a-f-]{36}$/i.test(order)) setInitialOrder(order);
      void refresh();
    });
    return () => { active = false; activeRequest.current?.abort(); };
  }, [refresh]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function canLeave() {
    return !dirty || window.confirm('Leave this section and discard unsaved changes?');
  }
  function changeSection(next: Section) {
    if (next === section || !canLeave()) return;
    setDirty(false); setInitialOrder(null); setSection(next);
  }
  async function refreshExplicitly() {
    if (dirty && !window.confirm('Load the latest records and discard unsaved changes?')) return;
    const result = await refresh();
    if (result) { setDirty(false); setReset(value => value + 1); }
  }
  const [reset, setReset] = useState(0);
  const pending = data?.orders.filter(order => order.status === 'payment_review').length ?? 0;

  return <div className="admin-shell rh-shell">
    <a className="admin-skip" href="#runninghub-main">Skip to main content</a>
    <main id="runninghub-main" className="admin-main rh-main">
      <a className="rh-back" href="/admin" onClick={event => { if (!canLeave()) event.preventDefault(); }}><ArrowLeft size={17} aria-hidden="true"/>Store admin</a>
      <header className="admin-page-header rh-page-header">
        <div><h1>Running HUB</h1><p>Review payments, issue keys and keep bundles in stock.</p></div>
        <button type="button" className="admin-button admin-button-secondary" disabled={loading || authExpired} onClick={() => void refreshExplicitly()}>
          <RefreshCw size={16} aria-hidden="true" className={loading ? 'admin-spinner' : undefined}/>{loading && data ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      <nav className="rh-sections" aria-label="Running HUB sections">
        {([['orders', 'Orders'], ['inventory', 'Inventory'], ['payments', 'Payment settings']] as const).map(([id, label]) =>
          <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => changeSection(id)}>{label}{id === 'orders' && pending > 0 && <span>{pending}<span className="admin-sr-only"> awaiting review</span></span>}</button>)}
      </nav>
      {error && <div className="admin-feedback admin-feedback-error" role="alert"><CircleAlert size={19} aria-hidden="true"/><div><p>{error}</p>
        {authExpired ? <a href="/admin/login">Sign in again</a> : <button type="button" disabled={loading} onClick={() => void refresh()}>Try again</button>}
      </div></div>}
      {!data && loading && <div className="admin-loading" role="status"><LoaderCircle className="admin-spinner" size={24} aria-hidden="true"/><h2>Loading Running HUB</h2></div>}
      {data && <div key={`${section}:${reset}`} aria-busy={loading}>
        {section === 'orders' ? <OrdersPanel data={data} initialOrder={initialOrder} onChanged={refresh} onDirtyChange={setDirty} onAuthExpired={expireSession}/>
          : section === 'inventory' ? <InventoryPanel data={data} onChanged={refresh} onDirtyChange={setDirty} onAuthExpired={expireSession}/>
          : <PaymentSettings data={data} onChanged={refresh} onDirtyChange={setDirty} onAuthExpired={expireSession}/>}
      </div>}
    </main>
  </div>;
}
