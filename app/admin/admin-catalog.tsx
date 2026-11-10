'use client';

/* Brand assets are served locally, without image optimization. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, Check, ChevronRight, CircleAlert, Eye, EyeOff,
  LayoutGrid, LoaderCircle, LogOut, Mail, Plus, RotateCcw, Save, Search,
  Settings, Sparkles, X,
} from 'lucide-react';
import { categories, type Catalog, type CatalogSettings, type Product } from '@/lib/catalog';

import { DEFAULT_TELEGRAM_CONTACT, validTelegramUsername } from '@/lib/telegram-contact';
import { PlanEditor, planFieldId } from './plan-editor';
import { LogoEditor, ServiceMark } from './logo-editor';

type Feedback = { message: string; kind: 'load' | 'save' | 'conflict' | 'auth' | 'validation'; status?: number };
type ValidationIssue = { message: string; productId?: string; field: string };
type Identity = { name: string; email: string };
const markLabels: Record<string, string> = {
  chatgpt: 'ChatGPT', canva: 'Canva', spotify: 'Spotify', gemini: 'Gemini', adobe: 'Adobe',
  netflix: 'Netflix', claude: 'Claude', cursor: 'Cursor', perplexity: 'Perplexity', grok: 'Grok',
  capcut: 'CapCut', freepik: 'Freepik', meitu: 'Meitu', suno: 'Suno', applemusic: 'Apple Music',
  youtube: 'YouTube', steam: 'Steam', zoom: 'Zoom', notion: 'Notion', duolingo: 'Duolingo',
  vpn: 'VPN', expressvpn: 'ExpressVPN', microsoft365: 'Microsoft 365',
};

function sameContent(a: Catalog | null, b: Catalog | null) {
  return JSON.stringify(a && { products: a.products, settings: a.settings }) === JSON.stringify(b && { products: b.products, settings: b.settings });
}

function validateCatalog(catalog: Catalog): ValidationIssue | null {
  const unsafeText = /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|(?:[a-z][a-z\d+.-]*:\/\/|\b(?:javascript|data|vbscript|mailto):|\bwww\.)/i;
  for (const product of catalog.products) {
    if (!product.name.trim()) return { message: 'Give this service a name before saving.', productId: product.id, field: 'service-name' };
    if (!product.description.trim()) return { message: `Add a description for ${product.name} before saving.`, productId: product.id, field: 'service-description' };
    for (const [field, value] of Object.entries({ name: product.name, description: product.description, mm: product.mm, price: product.price, duration: product.duration })) {
      if (value && unsafeText.test(value)) {
        return { message: `Use plain text without links or HTML in ${product.name || 'this service'}’s ${field === 'mm' ? 'Myanmar description' : field}.`, productId: product.id, field: `service-${field}` };
      }
    }
    for (const [index, plan] of (product.plans ?? []).entries()) {
      if (!plan.name.trim()) return { message: `Give plan ${index + 1} in ${product.name} a name before saving.`, productId: product.id, field: planFieldId(plan.id, 'name') };
      for (const field of ['name', 'price', 'duration'] as const) {
        if (unsafeText.test(plan[field])) return { message: `Use plain text without links or HTML in plan ${index + 1}’s ${field}.`, productId: product.id, field: planFieldId(plan.id, field) };
      }
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(catalog.settings.email.trim())) return { message: 'Enter a valid contact email address.', field: 'contact-email' };
  if (!/^\+?\d{7,15}$/.test(catalog.settings.viber.trim())) return { message: 'Enter a Viber number with 7–15 digits and an optional leading +.', field: 'contact-viber' };
  if (catalog.settings.telegram !== undefined && !validTelegramUsername(catalog.settings.telegram)) {
    return { message: 'Enter the Telegram username for order messages, such as @LynnIsHeree.', field: 'contact-telegram' };
  }
  if (!catalog.settings.viberLabel.trim()) return { message: 'Add the Viber number as you want customers to see it.', field: 'contact-viber-label' };
  return null;
}

export default function AdminCatalog({ identity, signOutHref, postSignOut }: { identity: Identity; signOutHref: string; postSignOut: boolean }) {
  const [saved, setSaved] = useState<Catalog | null>(null);
  const [draft, setDraft] = useState<Catalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showServiceEditor, setShowServiceEditor] = useState(false);
  const [view, setView] = useState<'services' | 'settings'>('services');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorReset, setEditorReset] = useState(0);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const uploadPending = useRef(false);
  const trackLogoUpload = useCallback((busy: boolean) => {
    uploadPending.current = busy;
    setUploadingLogo(busy);
  }, []);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [notice, setNotice] = useState('');
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);
  const listTrigger = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const dirty = !sameContent(draft, saved);
  const selected = draft?.products.find(product => product.id === selectedId) ?? null;
  const publishedCount = draft?.products.filter(product => product.published).length ?? 0;

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/catalog', { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json() as Catalog & { error?: string; issues?: {path:string;message:string}[] };
      if (!response.ok) {
        setFeedback({ message: result.error || 'The catalog could not be loaded. Please try again.', kind: response.status === 401 || response.status === 403 ? 'auth' : 'load', status: response.status });
        return;
      }
      const catalog = { ...result, settings: { ...result.settings, hideShortDescriptions: result.settings.hideShortDescriptions ?? false } };
      setSaved(catalog);
      setDraft(catalog);
      setSelectedId(current => result.products.some((product: Product) => product.id === current) ? current : result.products[0]?.id ?? null);
      setNotice('');
    } catch {
      setFeedback({ message: 'We couldn’t connect to your catalog. Check your connection and try again.', kind: 'load' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    if (!dirty && !uploadingLogo) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty, uploadingLogo]);

  const filteredProducts = useMemo(() => draft?.products.filter(product => {
    const matchesSearch = `${product.name} ${product.description} ${product.mm || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    const matchesCategory = category === 'all' || product.category === Number(category);
    const matchesStatus = status === 'all' || (status === 'published' ? product.published : status === 'hidden' ? !product.published : status === 'featured' ? product.featured : product.availability === status);
    return matchesSearch && matchesCategory && matchesStatus;
  }) ?? [], [draft, search, category, status]);

  function updateProduct(patch: Partial<Product>) {
    if (!selectedId || saving) return;
    setDraft(current => current ? { ...current, products: current.products.map(product => product.id === selectedId ? { ...product, ...patch } : product) } : current);
    setNotice('');
  }

  function updateSettings(patch: Partial<CatalogSettings>) {
    setDraft(current => current ? { ...current, settings: { ...current.settings, ...patch } } : current);
    setNotice('');
  }

  function selectService(id: string) {
    setSelectedId(id);
    setShowServiceEditor(true);
    if (window.matchMedia('(max-width: 950px)').matches) {
      requestAnimationFrame(() => {
        editorHeadingRef.current?.focus({ preventScroll: true });
        document.getElementById('admin-main')?.scrollIntoView({ block: 'start' });
      });
    }
  }

  function returnToServices() {
    setShowServiceEditor(false);
    requestAnimationFrame(() => {
      const target = listTrigger.current?.isConnected ? listTrigger.current : listRef.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    });
  }

  function addService() {
    if (!draft || saving || draft.products.length >= 100) return;
    const product: Product = { id: crypto.randomUUID(), name: '', description: '', mm: '', category: 1, mark: '', price: '', duration: '', availability: 'on-request', featured: false, published: false };
    setDraft({ ...draft, products: [...draft.products, product] });
    setView('services');
    setSearch(''); setCategory('all'); setStatus('all');
    setSelectedId(product.id);
    setShowServiceEditor(true);
    setNotice('');
    requestAnimationFrame(() => document.getElementById('service-name')?.focus());
  }

  function discardChanges() {
    if (uploadPending.current || !dirty || !window.confirm('Discard all unsaved changes and return to the last saved catalog?')) return;
    setDraft(saved);
    setEditorReset(value => value + 1);
    if (!saved?.products.some(product => product.id === selectedId)) setSelectedId(saved?.products[0]?.id ?? null);
    setFeedback(null);
    setNotice('Unsaved changes discarded.');
  }

  function reloadLatest() {
    if (dirty && !window.confirm('Load the latest saved catalog? Your unsaved changes will be discarded.')) return;
    void loadCatalog();
  }

  async function saveCatalog() {
    if (!draft || !dirty || saving || uploadPending.current || feedback?.kind === 'conflict') return;
    const issue = validateCatalog(draft);
    if (issue) {
      setFeedback({ message: issue.message, kind: 'validation' });
      if (issue.productId) { setView('services'); setSelectedId(issue.productId); setShowServiceEditor(true); }
      else setView('settings');
      requestAnimationFrame(() => document.getElementById(issue.field)?.focus());
      return;
    }
    setSaving(true);
    setFeedback(null);
    setNotice('');
    try {
      const response = await fetch('/api/admin/catalog', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: draft.revision, products: draft.products, settings: draft.settings }),
      });
      const result = await response.json() as Catalog & { error?: string; issues?: {path:string;message:string}[] };
      if (!response.ok) {
        setFeedback({
          message: response.status === 409 ? 'The catalog was updated in another session. Your changes are still here. Load the latest version before editing again.' : result.issues?.[0]?.message || result.error || 'Your changes could not be saved. Please try again.',
          kind: response.status === 409 ? 'conflict' : response.status === 401 || response.status === 403 ? 'auth' : 'save', status: response.status,
        });
        return;
      }
      setSaved(result);
      setDraft(result);
      setNotice('Changes saved. Your website is up to date.');
    } catch {
      setFeedback({ message: 'We couldn’t confirm that your changes were saved. Check your connection, then try saving again.', kind: 'save' });
    } finally { setSaving(false); }
  }

  const lastSaved = saved?.updatedAt ? new Date(saved.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;

  return <div className="admin-shell">
    <a className="admin-skip" href="#admin-main">Skip to catalog</a>
    <aside className="admin-sidebar" aria-label="Admin navigation">
      <div className="admin-brand"><img src="/assets/logo.png" alt="digimium." /><span>Admin</span></div>
      <nav className="admin-navigation">
        <button type="button" onClick={() => { setView('services'); setShowServiceEditor(false); }} aria-current={view === 'services' ? 'page' : undefined}><LayoutGrid size={18} />Services<span>{draft?.products.length ?? '—'}</span></button>
        <button type="button" onClick={() => setView('settings')} aria-current={view === 'settings' ? 'page' : undefined}><Settings size={18} />Contact settings</button>
      </nav>
      <div className="admin-sidebar-bottom">
        <a className="admin-site-link" href="/" target="_blank" rel="noopener noreferrer">View website<ArrowUpRight size={17} /></a>
        <div className="admin-identity"><span className="admin-avatar">{(identity.name || identity.email).slice(0, 1).toUpperCase()}</span><div><strong>{identity.name}</strong><span title={identity.email}>{identity.email}</span></div></div>
        {postSignOut ? <form action={signOutHref} method="post" onSubmit={event => { if ((dirty || uploadingLogo) && !window.confirm('Sign out and discard your unsaved changes?')) event.preventDefault(); }}>
          <button type="submit" className="admin-signout"><LogOut size={15} />Sign out</button>
        </form> : <a className="admin-signout" href={signOutHref} target="_top" onClick={event => { if ((dirty || uploadingLogo) && !window.confirm('Sign out and discard your unsaved changes?')) event.preventDefault(); }}><LogOut size={15} />Sign out</a>}
      </div>
    </aside>

    <main id="admin-main" className="admin-main" data-service-editor={view === 'services' && showServiceEditor && !!selected}>
      <header className="admin-page-header">
        <div><h1>{view === 'services' ? 'Service catalog' : 'Contact settings'}</h1><p>{view === 'services' ? 'A little care for your digital collection.' : 'Keep it easy for customers to reach you.'}</p></div>
        <div className="admin-header-actions">
          <span className={`admin-save-state ${dirty ? 'is-dirty' : ''}`} aria-live="polite">{uploadingLogo ? 'Uploading logo…' : saving ? 'Saving changes…' : dirty ? 'Unsaved changes' : draft ? 'All changes saved' : ''}</span>
          <button className="admin-button admin-button-secondary admin-revert" type="button" disabled={!dirty || saving || loading || uploadingLogo} onClick={discardChanges}><RotateCcw size={16} />Revert</button>
          <button className="admin-button admin-button-primary" type="submit" form="admin-catalog-form" disabled={!dirty || saving || loading || uploadingLogo || feedback?.kind === 'conflict'}>{saving ? <LoaderCircle size={16} className="admin-spinner" /> : <Save size={16} />}<span>{saving ? 'Saving…' : 'Save changes'}</span></button>
        </div>
      </header>

      {feedback && <div className="admin-feedback admin-feedback-error" role="alert"><CircleAlert size={19} /><div><p>{feedback.message}</p>{feedback.kind === 'conflict' && <button type="button" onClick={reloadLatest}>Load latest catalog<RotateCcw size={14} /></button>}{feedback.kind === 'load' && <button type="button" disabled={loading} onClick={() => void loadCatalog()}>Try again<RotateCcw size={14} /></button>}{feedback.kind === 'auth' && <a href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top" onClick={event => { if (dirty && !window.confirm('Sign in again? Your unsaved changes will be lost when you leave this page.')) event.preventDefault(); }}>Sign in again<ArrowUpRight size={14} /></a>}{feedback.kind === 'save' && <button type="button" disabled={saving} onClick={() => void saveCatalog()}>Try saving again<RotateCcw size={14} /></button>}</div></div>}
      {notice && <div className="admin-feedback admin-feedback-success" role="status"><Check size={18} /><p>{notice}</p><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}

      {loading ? <div className="admin-loading" role="status"><LoaderCircle className="admin-spinner" size={24} /><h2>Loading your catalog</h2><p>Getting everything ready.</p></div> : draft ? <>
        {view === 'services' && <label className="admin-toggle-row admin-description-toggle">
          <span>
            <strong id="short-descriptions-label">Hide all short descriptions</strong>
            <span id="short-descriptions-hint">Applies to product cards and plan pickers in both languages. Your descriptions stay editable here.</span>
          </span>
          <input className="admin-switch" type="checkbox" role="switch" disabled={saving}
            aria-labelledby="short-descriptions-label" aria-describedby="short-descriptions-hint"
            checked={draft.settings.hideShortDescriptions ?? false}
            onChange={event => updateSettings({ hideShortDescriptions: event.target.checked })} />
        </label>}
        {view === 'services' ? <div className="admin-workspace">
          <section className="admin-service-list" aria-label="Services" ref={listRef} tabIndex={-1}>
            <div className="admin-list-heading"><div><h2>Your services</h2><p>{draft.products.length} total <span aria-hidden="true">·</span> {publishedCount} published</p></div><button type="button" className="admin-add" aria-label="Add a new service" title={draft.products.length >= 100 ? 'The catalog supports up to 100 services' : 'Add a service'} disabled={saving || draft.products.length >= 100} onClick={addService}><Plus size={20} /></button></div>
            <div className="admin-list-tools"><label className="admin-search"><Search size={17} /><span className="admin-sr-only">Search services</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search services…" enterKeyHint="search" autoComplete="off" autoCapitalize="none" spellCheck={false} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}</label><div className="admin-filter-row"><label><span className="admin-sr-only">Filter by category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.slice(1).map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label><span className="admin-sr-only">Filter by status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="featured">Featured</option><option value="available">Available</option><option value="on-request">On request</option><option value="unavailable">Unavailable</option></select></label></div></div>
            <div className="admin-list-items">
              {filteredProducts.length ? filteredProducts.map(product => <button key={product.id} type="button" className={`admin-service-row ${selectedId === product.id ? 'is-selected' : ''}`} onClick={event => { listTrigger.current = event.currentTarget; selectService(product.id); }} aria-pressed={selectedId === product.id}>
                <ServiceMark product={product} /><span className="admin-service-copy"><strong>{product.name || 'Untitled service'}</strong><span>{categories[product.category]}</span></span><span className="admin-row-trailing">{!product.published ? <EyeOff size={14} aria-label="Hidden" /> : product.featured ? <Sparkles size={14} aria-label="Featured" /> : null}<ChevronRight size={16} /></span>
              </button>) : <div className="admin-list-empty"><Search size={23} /><h3>{draft.products.length ? 'No services found' : 'Your collection starts here'}</h3><p>{draft.products.length ? 'Try a different search or filter.' : 'Add your first service to get started.'}</p><button type="button" onClick={draft.products.length ? () => { setSearch(''); setCategory('all'); setStatus('all'); } : addService}>{draft.products.length ? 'Clear filters' : 'Add a service'}</button></div>}
            </div>
            {draft.products.length > 0 && <div className="admin-list-footer">Showing {filteredProducts.length} of {draft.products.length} services</div>}
          </section>

          <section className="admin-editor" aria-label="Service editor">
            {selected ? <>
              <div className="admin-editor-heading">
                <button type="button" className="admin-list-back" onClick={returnToServices} aria-label="Back to services"><ArrowLeft size={17} />Services</button>
                <div className="admin-editor-title"><ServiceMark product={selected} /><div><h2 ref={editorHeadingRef} tabIndex={-1}>{selected.name || 'New service'}</h2><span className={`admin-published-label ${selected.published ? 'is-published' : ''}`}>{selected.published ? <Eye size={13} /> : <EyeOff size={13} />}{selected.published ? 'Published on your website' : 'Hidden from your website'}</span></div></div>
                <button type="button" className="admin-icon-button" aria-label="Close service editor" onClick={() => setSelectedId(null)}><X size={18} /></button>
              </div>
              <form id="admin-catalog-form" noValidate onSubmit={event => { event.preventDefault(); void saveCatalog(); }}><fieldset disabled={saving}>
                <div className="admin-form-section"><h3>Service details</h3><div className="admin-form-grid"><label className="admin-field admin-field-wide" htmlFor="service-name">Service name<input id="service-name" value={selected.name} maxLength={100} placeholder="e.g. ChatGPT Plus" required onChange={event => updateProduct({ name: event.target.value })} /></label><label className="admin-field admin-field-wide" htmlFor="service-category">Category<select id="service-category" value={selected.category} onChange={event => updateProduct({ category: Number(event.target.value) })}>{categories.slice(1).map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label className="admin-field admin-field-wide" htmlFor="service-description">English description<textarea id="service-description" value={selected.description} maxLength={500} rows={3} required placeholder="What makes this service useful?" onChange={event => updateProduct({ description: event.target.value })} /></label><label className="admin-field admin-field-wide" htmlFor="service-mm"><span>Myanmar description <span className="admin-optional">Optional</span></span><textarea id="service-mm" lang="my" value={selected.mm || ''} maxLength={500} rows={3} placeholder="မြန်မာဘာသာဖြင့် ဖော်ပြချက်" onChange={event => updateProduct({ mm: event.target.value })} /></label></div></div>
                <LogoEditor key={`logo-${selected.id}-${saved?.revision}-${editorReset}`} product={selected} disabled={saving} markLabels={markLabels} onChange={updateProduct} onBusyChange={trackLogoUpload} />
                <div className="admin-form-section"><h3>Price & availability</h3><div className="admin-form-grid"><label className="admin-field" htmlFor="service-price"><span>Price <span className="admin-optional">Optional</span></span><input id="service-price" value={selected.price} maxLength={80} placeholder="e.g. 25,000 MMK" onChange={event => updateProduct({ price: event.target.value })} /><small>Leave blank for customers to ask.</small></label><label className="admin-field" htmlFor="service-duration"><span>Duration <span className="admin-optional">Optional</span></span><input id="service-duration" value={selected.duration} maxLength={80} placeholder="e.g. 1 month" onChange={event => updateProduct({ duration: event.target.value })} /></label><label className="admin-field admin-field-wide" htmlFor="service-availability">Availability<select id="service-availability" value={selected.availability} onChange={event => updateProduct({ availability: event.target.value as Product['availability'] })}><option value="available">Available</option><option value="on-request">Check availability on request</option><option value="unavailable">Temporarily unavailable</option></select></label></div></div>
                <PlanEditor key={`plans-${selected.id}-${saved?.revision}-${editorReset}`} plans={selected.plans ?? []} disabled={saving} onChange={plans => updateProduct({ plans })} />
                <div className="admin-form-section admin-publishing"><h3>On your website</h3><label className="admin-toggle-row"><span><strong>Publish this service</strong><span>Show it in your public service catalog.</span></span><input type="checkbox" className="admin-switch" checked={selected.published} onChange={event => updateProduct({ published: event.target.checked })} /></label><label className="admin-toggle-row"><span><strong>Feature this service</strong><span>Include it in the featured collection when published.</span></span><input type="checkbox" className="admin-switch" checked={selected.featured} onChange={event => updateProduct({ featured: event.target.checked })} /></label></div>
                <div className="admin-editor-footer"><p>Changes go live when you save.</p><button type="button" className="admin-text-button" onClick={() => updateProduct({ published: !selected.published })}>{selected.published ? <EyeOff size={16} /> : <Eye size={16} />}{selected.published ? 'Hide service' : 'Publish service'}</button></div>
              </fieldset></form>
            </> : <div className="admin-editor-empty"><LayoutGrid size={32} /><h2>Make your collection yours.</h2><p>Select a service to update its details, or add something new.</p><button type="button" className="admin-button admin-button-primary" onClick={addService} disabled={saving || draft.products.length >= 100}><Plus size={17} />Add a service</button><form id="admin-catalog-form" onSubmit={event => { event.preventDefault(); void saveCatalog(); }} /></div>}
          </section>
        </div> : <section className="admin-settings-panel"><div className="admin-settings-intro"><div className="admin-settings-icon"><Mail size={24} /></div><h2>A direct line to Digimium.</h2><p>These contact details appear on your website and in service enquiries.</p></div><form id="admin-catalog-form" noValidate onSubmit={event => { event.preventDefault(); void saveCatalog(); }}><fieldset disabled={saving}><div className="admin-form-section"><label className="admin-field" htmlFor="contact-telegram">Telegram order username
              <input id="contact-telegram" required value={draft.settings.telegram ?? DEFAULT_TELEGRAM_CONTACT} maxLength={33} autoCapitalize="none" spellCheck={false} autoComplete="off" placeholder="@LynnIsHeree" onChange={event => updateSettings({ telegram: event.target.value })} />
              <small>Checkout opens a direct conversation with this Telegram account.</small>
            </label><label className="admin-field" htmlFor="contact-email">Contact email<input id="contact-email" type="email" maxLength={254} required value={draft.settings.email} placeholder="hello@example.com" autoComplete="email" onChange={event => updateSettings({ email: event.target.value })} /></label><label className="admin-field" htmlFor="contact-viber">Viber phone number<input id="contact-viber" type="tel" maxLength={16} required value={draft.settings.viber} placeholder="+959123456789" autoComplete="tel" onChange={event => updateSettings({ viber: event.target.value })} /><small>Use your country code and digits, with no spaces. This opens your Viber chat.</small></label><label className="admin-field" htmlFor="contact-viber-label">Viber display number<input id="contact-viber-label" maxLength={80} required value={draft.settings.viberLabel} placeholder="+95 9 123 456 789" onChange={event => updateSettings({ viberLabel: event.target.value })} /><small>The readable number customers see on your website.</small></label></div><div className="admin-editor-footer"><p>Changes go live when you save.</p><a className="admin-text-button" href="/#contact" target="_blank" rel="noopener noreferrer">View contact section<ArrowUpRight size={16} /></a></div></fieldset></form></section>}
        <footer className="admin-workspace-footer"><span>{lastSaved ? `Last saved ${lastSaved}` : 'Your catalog is ready to edit.'}</span><a href="/" target="_blank" rel="noopener noreferrer">Open website<ArrowUpRight size={14} /></a></footer>
      </> : !feedback && <div className="admin-loading"><CircleAlert size={24} /><h2>Your catalog isn’t available yet</h2><button className="admin-button admin-button-secondary" onClick={() => void loadCatalog()}>Try again</button></div>}
      <a className="admin-mobile-back" href="/" target="_blank" rel="noopener noreferrer"><ArrowLeft size={15} />Back to website</a>
    </main>
  </div>;
}
