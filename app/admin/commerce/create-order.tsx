'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { Catalog, Product } from '@/lib/catalog';
import type { CommerceCustomer, CommerceOrder } from '@/lib/commerce-types';
import { customerContact } from '@/lib/customer-identity';
import { effectivePrice, parseMmk } from '@/lib/pricing';

type DraftLine = { key: string; productId: string; planId: string | null; quantity: string; unitPrice: string };
type CreatePayload = {
  customerId: string;
  expectedCatalogRevision: number;
  items: { productId: string; planId: string | null; quantity: number; unitPriceMmk: number }[];
};

const blankLine = (key: string): DraftLine => ({ key, productId: '', planId: null, quantity: '1', unitPrice: '' });
const publishedPlans = (product: Product) => product.plans?.filter(plan => plan.published) ?? [];
const amountText = (amount: number) => amount.toLocaleString('en-US') + ' MMK';
const quantityValue = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;

export default function CreateOrder({ customers, initialCustomerId, onBack, onCreated, onDirtyChange }: {
  customers: CommerceCustomer[];
  initialCustomerId: string | null;
  onBack: () => void;
  onCreated: (order: CommerceOrder) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [customerId, setCustomerId] = useState(initialCustomerId ?? '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine('first')]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failureStatus, setFailureStatus] = useState(0);
  const [stale, setStale] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const attempt = useRef<{ canonical: string; requestId: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const dirty = customerId !== (initialCustomerId ?? '') || lines.length > 1 || lines.some(line => !!line.productId || line.quantity !== '1' || !!line.unitPrice);
  const customer = customers.find(row => row.id === customerId);
  const products = catalog?.products.filter(product => product.published && product.availability !== 'unavailable') ?? [];
  const productsById = new Map(products.map(product => [product.id, product]));
  const search = customerSearch.trim().toLowerCase();
  const shownCustomers = customers.filter(row => row.id === customerId || !search || [row.name, customerContact(row), row.id].some(value => value.toLowerCase().includes(search)));
  const lineAmounts = lines.map(line => {
    const quantity = quantityValue(line.quantity);
    const unitPrice = parseMmk(line.unitPrice, true);
    if (quantity === undefined || unitPrice === undefined || !Number.isSafeInteger(quantity * unitPrice)) return undefined;
    return quantity * unitPrice;
  });
  const total = lineAmounts.every(amount => amount !== undefined) && Number.isSafeInteger(lineAmounts.reduce((sum, amount) => sum + (amount ?? 0), 0))
    ? lineAmounts.reduce((sum, amount) => sum + (amount ?? 0), 0) : undefined;

  useEffect(() => { onDirtyChange(dirty || busy || uncertain); }, [dirty, busy, uncertain, onDirtyChange]);

  function fail(message: string, status = 0) {
    setError(message); setFailureStatus(status);
    requestAnimationFrame(() => errorBox.current?.focus());
  }

  const loadCatalog = useCallback(async (reloading = false) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const isCurrent = () => mounted.current && activeRequest.current === controller && !controller.signal.aborted;
    setLoading(true); setError(''); setFailureStatus(0); setCatalogNotice('');
    try {
      const response = await fetch('/api/admin/catalog', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const result = await response.json() as Catalog & { error?: string };
      if (!isCurrent()) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setCatalog(null);
        setError(result.error || 'Could not load saved products and plans.'); setFailureStatus(response.status);
        requestAnimationFrame(() => errorBox.current?.focus()); return;
      }
      if (!Array.isArray(result.products) || !Number.isSafeInteger(result.revision)) throw new Error('Invalid catalog');
      setCatalog(result); setStale(false);
      if (reloading) setCatalogNotice('Saved catalog refreshed. Your selections and entered prices were kept. Review them before creating the order.');
    } catch {
      if (isCurrent()) { setError('Could not load saved products and plans. Check your connection and try again.'); requestAnimationFrame(() => errorBox.current?.focus()); }
    } finally { if (isCurrent()) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { void loadCatalog(); heading.current?.focus(); } });
    return () => { cancelled = true; mounted.current = false; activeRequest.current?.abort(); };
  }, [loadCatalog]);

  function changeLine(key: string, changes: Partial<DraftLine>) {
    setLines(current => current.map(line => line.key === key ? { ...line, ...changes } : line));
    setError(''); setFailureStatus(0); setCatalogNotice('');
  }

  function selectProduct(key: string, productId: string) {
    const product = productsById.get(productId);
    const plans = product ? publishedPlans(product) : [];
    const planId = plans.length === 1 ? plans[0].id : null;
    const offer = product && (plans.length ? plans.find(plan => plan.id === planId) : product);
    const amount = offer ? parseMmk(effectivePrice(offer)) : undefined;
    changeLine(key, { productId, planId, unitPrice: amount === undefined ? '' : String(amount) });
  }

  function selectPlan(key: string, product: Product, planId: string) {
    const plan = publishedPlans(product).find(row => row.id === planId);
    const amount = plan ? parseMmk(effectivePrice(plan)) : undefined;
    changeLine(key, { planId: planId || null, unitPrice: amount === undefined ? '' : String(amount) });
  }

  function goBack() {
    if (busy) return;
    if (uncertain && !window.confirm('An order may already have been created. Retry this request to check it first. Leave this form anyway?')) return;
    if (!uncertain && dirty && !window.confirm('Discard this new order and return?')) return;
    onDirtyChange(false); onBack();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || stale || !catalog) return;
    if (!customer) { fail('Choose an existing customer before creating the order.'); return; }
    const items: CreatePayload['items'] = [];
    const selected = new Set<string>();
    for (const [index, line] of lines.entries()) {
      const product = productsById.get(line.productId);
      if (!product) { fail('Choose an available product for item ' + (index + 1) + '.'); return; }
      const plans = publishedPlans(product);
      if (plans.length ? !plans.some(plan => plan.id === line.planId) : line.planId !== null) {
        fail('Choose an available plan for ' + product.name + '.'); return;
      }
      const key = JSON.stringify([line.productId, line.planId]);
      if (selected.has(key)) { fail('This plan appears more than once. Remove the duplicate and use its quantity field instead.'); return; }
      selected.add(key);
      const quantity = quantityValue(line.quantity);
      const unitPriceMmk = parseMmk(line.unitPrice, true);
      if (quantity === undefined) { fail('Enter a positive whole quantity for ' + product.name + '.'); return; }
      if (unitPriceMmk === undefined) { fail('Enter a whole unit price in MMK for ' + product.name + '.'); return; }
      items.push({ productId: line.productId, planId: line.planId, quantity, unitPriceMmk });
    }
    if (!items.length || total === undefined) { fail('Check the selected items, quantities and prices. The order total must be a supported whole MMK amount.'); return; }
    const payload: CreatePayload = { customerId: customer.id, expectedCatalogRevision: catalog.revision, items };
    const canonical = JSON.stringify(payload);
    if (attempt.current?.canonical !== canonical) attempt.current = { canonical, requestId: crypto.randomUUID() };
    setBusy(true); setError(''); setFailureStatus(0);
    try {
      const response = await fetch('/api/admin/commerce', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId: attempt.current.requestId }) });
      const result = await response.json() as { order?: CommerceOrder; created?: boolean; error?: string };
      if (!mounted.current) return;
      if (!response.ok) {
        if (response.status >= 500) {
          setUncertain(true);
          fail('Could not confirm whether the order was created. Retry the same request below; it will not create a duplicate.', response.status);
          return;
        }
        setUncertain(false); setStale(response.status === 409);
        fail(result.error || 'Could not create this order.', response.status); return;
      }
      if (!result.order?.id || result.order.customerId !== customer.id || !['pending', 'approved', 'rejected'].includes(result.order.status) || !result.order.lines?.length || typeof result.created !== 'boolean') throw new Error('Unconfirmed order');
      setUncertain(false); onDirtyChange(false); onCreated(result.order);
    } catch {
      if (mounted.current) { setUncertain(true); fail('Could not confirm whether the order was created. Retry the same request below; it will not create a duplicate.'); }
    } finally { if (mounted.current) setBusy(false); }
  }

  const fieldsLocked = busy || uncertain || failureStatus === 401 || failureStatus === 403;

  return <section className="commerce-panel commerce-create" aria-labelledby="commerce-create-title">
    <div className="commerce-panel-heading">
      <button type="button" className="admin-text-button" disabled={busy} onClick={goBack}><ArrowLeft size={16}/>Back</button>
      <h2 ref={heading} id="commerce-create-title" tabIndex={-1}>Create customer order</h2>
      <p>Record an earlier purchase for a registered customer. This creates a new pending order. Existing guest orders are not changed.</p>
    </div>
    <form onSubmit={submit}>
      <fieldset className="commerce-create-fields" disabled={fieldsLocked}>
        <section className="commerce-create-section" aria-labelledby="create-customer-title">
          <h3 id="create-customer-title">Customer</h3>
          {!initialCustomerId && <div className="commerce-create-customer-picker">
            <label className="admin-field">Find customer<input type="search" value={customerSearch} placeholder="Search name, email or Telegram…" onChange={event => setCustomerSearch(event.target.value)}/></label>
            <label className="admin-field">Select customer<select required value={customerId} onChange={event => { setCustomerId(event.target.value); setError(''); setFailureStatus(0); }}>
              <option value="">Choose an existing customer</option>
              {shownCustomers.map(row => <option key={row.id} value={row.id}>{row.name} · {customerContact(row)} · {row.id.slice(0, 8)}</option>)}
            </select></label>
            {!shownCustomers.length && <p className="commerce-create-help">No matching customers.</p>}
          </div>}
          {customer ? <div className="commerce-create-identity"><strong>{customer.name}</strong><span>{customerContact(customer)}</span><small>Customer ID: {customer.id}</small></div>
            : initialCustomerId && <p className="commerce-create-help">This customer is no longer available. Return to Customers and refresh the directory.</p>}
        </section>
        <section className="commerce-create-section" aria-labelledby="create-items-title">
          <div className="commerce-heading-line"><h3 id="create-items-title">Products and plans</h3><button type="button" className="admin-text-button" disabled={loading || uncertain} onClick={() => void loadCatalog(true)}><RefreshCw size={15} className={loading ? 'admin-spinner' : undefined}/>Reload saved catalog</button></div>
          <p className="commerce-create-help">Prices start from the saved catalog. Edit Unit price only when recording a different amount paid for each item.</p>
          {loading ? <p className="commerce-create-help" role="status">Loading saved products and plans…</p> : catalog && <>
            {!products.length && <p className="commerce-create-help">No published products are currently available. Update the catalog before creating an order.</p>}
            <div className="commerce-create-lines">{lines.map((line, index) => {
              const product = productsById.get(line.productId);
              const plans = product ? publishedPlans(product) : [];
              const offer = product && (plans.length ? plans.find(plan => plan.id === line.planId) : product);
              return <section className="commerce-create-line" key={line.key} aria-labelledby={'create-item-' + line.key}>
                <div className="commerce-heading-line"><h4 id={'create-item-' + line.key}>Item {index + 1}</h4><button type="button" className="admin-text-button commerce-danger-link" disabled={lines.length === 1} aria-label={'Remove item ' + (index + 1)} onClick={() => { setLines(current => current.filter(row => row.key !== line.key)); setError(''); requestAnimationFrame(() => addButton.current?.focus()); }}><Trash2 size={16}/>Remove</button></div>
                <div className="commerce-create-product-grid">
                  <label className="admin-field">Product<select id={'create-product-' + line.key} required value={line.productId} onChange={event => selectProduct(line.key, event.target.value)}>
                    <option value="">Choose a product</option>
                    {!!line.productId && !product && <option value={line.productId}>Previously selected product is unavailable</option>}
                    {products.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select></label>
                  <label className="admin-field">Plan<select value={line.planId ?? ''} required={plans.length > 0} disabled={!product || !plans.length} onChange={event => { if (product) selectPlan(line.key, product, event.target.value); }}>
                    <option value="">{product && !plans.length ? 'Product offer · no separate plan' : 'Choose a plan'}</option>
                    {!!line.planId && !plans.some(plan => plan.id === line.planId) && <option value={line.planId}>Previously selected plan is unavailable</option>}
                    {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}{plan.duration ? ' · ' + plan.duration : ''}</option>)}
                  </select></label>
                </div>
                <div className="commerce-create-price-grid">
                  <label className="admin-field">Quantity<input type="number" inputMode="numeric" min="1" max={Number.MAX_SAFE_INTEGER} step="1" required value={line.quantity} onChange={event => changeLine(line.key, { quantity: event.target.value })}/></label>
                  <label className="admin-field">Unit price (MMK)<input type="text" inputMode="numeric" required autoComplete="off" value={line.unitPrice} disabled={!offer} placeholder={offer ? 'Enter amount paid' : 'Choose a plan first'} onChange={event => changeLine(line.key, { unitPrice: event.target.value })}/>
                    {offer && <small>Catalog: {effectivePrice(offer) || 'Price on request'}{offer.duration ? ' · ' + offer.duration : ''}</small>}
                  </label>
                  <div className="commerce-create-line-total"><span>Item total</span><strong>{lineAmounts[index] === undefined ? '—' : amountText(lineAmounts[index])}</strong></div>
                </div>
              </section>;
            })}</div>
            <button ref={addButton} type="button" className="admin-button admin-button-secondary" disabled={lines.length >= 3000 || !products.length} onClick={() => {
              const key = crypto.randomUUID();
              setLines(current => [...current, blankLine(key)]); setError('');
              requestAnimationFrame(() => document.getElementById('create-product-' + key)?.focus());
            }}><Plus size={16}/>Add another item</button>
          </>}
        </section>
      </fieldset>
      {catalogNotice && <p className="commerce-create-notice" role="status">{catalogNotice}</p>}
      {stale && <p className="commerce-create-notice">Reload the saved catalog, then review your selections and entered prices before creating the order.</p>}
      {error && <div ref={errorBox} className="commerce-form-error commerce-create-error" role="alert" tabIndex={-1}><p>{error}</p>
        {failureStatus === 401 && <a href="/admin/login">Sign in again</a>}
        {(stale || (!catalog && failureStatus !== 401 && failureStatus !== 403)) && <button type="button" className="admin-text-button" disabled={loading || busy} onClick={() => void loadCatalog(true)}>Load latest saved catalog</button>}
      </div>}
      <div className="commerce-save">
        <div><span>Order total</span><strong>{total === undefined ? '—' : amountText(total)}</strong><p className="commerce-create-help">Subscriptions remain inactive until you approve the order.</p></div>
        <div className="commerce-save-actions"><button type="button" className="admin-button admin-button-secondary" disabled={busy} onClick={goBack}>Cancel</button>
          <button type="submit" className="admin-button admin-button-primary" disabled={busy || loading || stale || !catalog || !customer || !products.length || failureStatus === 401 || failureStatus === 403}>{busy ? <LoaderCircle size={16} className="admin-spinner"/> : <Check size={16}/>} {busy ? 'Creating…' : uncertain ? 'Retry same request' : 'Create pending order'}</button>
        </div>
      </div>
    </form>
  </section>;
}
