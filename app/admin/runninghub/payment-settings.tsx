'use client';

/* Merchant QR images are served locally without image optimization. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, LoaderCircle, Save, Upload } from 'lucide-react';
import type { RunningHubPaymentMethod } from '@/lib/runninghub';
import { LOGO_PATH_PATTERN, MAX_LOGO_BYTES } from '@/lib/logo-path';
import { paymentLabels, type RunningHubData } from './types';

function methodsFrom(data: RunningHubData): RunningHubPaymentMethod[] {
  return (['kpay', 'aya'] as const).map(id => data.methods.find(method => method.id === id) ?? {
    id, enabled: false, accountLabel: '', accountNumber: '',
  });
}

function sameMethods(expected: RunningHubPaymentMethod[], actual?: RunningHubPaymentMethod[]) {
  return actual?.length === expected.length && expected.every(method => actual.some(saved =>
    saved.id === method.id && saved.enabled === method.enabled && saved.accountLabel === method.accountLabel &&
    saved.accountNumber === method.accountNumber && saved.qrPath === method.qrPath));
}

export default function PaymentSettings({ data, onChanged, onDirtyChange, onAuthExpired }: {
  data: RunningHubData;
  onChanged: () => Promise<RunningHubData | undefined>;
  onDirtyChange: (dirty: boolean) => void;
  onAuthExpired: () => void;
}) {
  const [draft, setDraft] = useState(() => methodsFrom(data));
  const [revision, setRevision] = useState(data.settingsRevision);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const request = useRef<AbortController | null>(null);
  const dirty = !sameMethods(draft, methodsFrom(data));
  const stale = conflict || revision !== data.settingsRevision;

  useEffect(() => { onDirtyChange(dirty || !!busy); return () => onDirtyChange(false); }, [dirty, busy, onDirtyChange]);
  useEffect(() => () => request.current?.abort(), []);

  function update(id: RunningHubPaymentMethod['id'], patch: Partial<RunningHubPaymentMethod>) {
    setDraft(current => current.map(method => method.id === id ? { ...method, ...patch } : method));
    setNotice(''); setError('');
  }
  async function reload() {
    if (dirty && !window.confirm('Discard these recipient edits and load the latest saved settings?')) return;
    const result = await onChanged();
    if (result) { setDraft(methodsFrom(result)); setRevision(result.settingsRevision); setConflict(false); setError(''); setNotice('Latest payment settings loaded.'); }
  }
  async function upload(id: RunningHubPaymentMethod['id'], file: File) {
    if (busy || request.current) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > MAX_LOGO_BYTES) {
      setError('Choose a PNG, JPEG or WebP receiving QR smaller than 2 MB.'); return;
    }
    const controller = new AbortController(); request.current = controller;
    setBusy(id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/logos', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': file.type }, body: file, signal: controller.signal });
      const result = await response.json().catch(() => null) as { path?: string; error?: string } | null;
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { onAuthExpired(); return; }
      if (!response.ok || !result?.path || !LOGO_PATH_PATTERN.test(result.path)) { setError(result?.error || 'The QR upload failed. Choose the image again to retry.'); return; }
      update(id, { qrPath: result.path }); setNotice('Receiving QR uploaded. Save payment settings to use it.');
    } catch { if (!controller.signal.aborted) setError('The QR upload was interrupted. Choose the image again to retry.'); }
    finally { if (request.current === controller) { request.current = null; if (!controller.signal.aborted) setBusy(null); } }
  }
  async function save() {
    if (busy || request.current || !dirty || stale) return;
    for (const method of draft) {
      if (!method.enabled) continue;
      const missing = !method.accountLabel.trim() ? 'name' : !method.accountNumber.trim() ? 'number' : null;
      if (missing) {
        setError(`Add the ${missing === 'name' ? 'account name' : 'receiving number'} for ${paymentLabels[method.id]}.`);
        document.getElementById(`rh-${method.id}-${missing}`)?.focus(); return;
      }
    }
    const controller = new AbortController(); request.current = controller;
    setBusy('save'); setError(''); setNotice('');
    const submitted = draft.map(method => ({ ...method, accountLabel: method.accountLabel.trim(), accountNumber: method.accountNumber.trim() }));
    try {
      const response = await fetch('/api/admin/runninghub', { method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, methods: submitted }), signal: controller.signal });
      const result = await response.json().catch(() => null) as { error?: string; methods?: RunningHubPaymentMethod[]; settingsRevision?: number } | null;
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { onAuthExpired(); return; }
      if (!response.ok) { setConflict(response.status === 409); setError(result?.error || 'Payment settings could not be saved. Your edits are still here.'); return; }
      if (result?.settingsRevision !== revision + 1 || !sameMethods(submitted, result.methods)) throw new Error('Unconfirmed payment settings save');
      const latest = await onChanged();
      if (controller.signal.aborted) return;
      if (latest && latest.settingsRevision === result.settingsRevision && sameMethods(submitted, methodsFrom(latest))) { setDraft(methodsFrom(latest)); setRevision(latest.settingsRevision); setNotice('Payment settings saved. Existing orders keep their original receiving details.'); }
      else { setConflict(true); setError('Settings were saved, but the latest version could not be loaded. Reload settings before editing again.'); }
    } catch { if (!controller.signal.aborted) setError('Could not confirm the save. Your edits are still here; retry or reload the latest settings.'); }
    finally { if (request.current === controller) { request.current = null; if (!controller.signal.aborted) setBusy(null); } }
  }

  return <section className="rh-panel" aria-labelledby="rh-payment-heading">
    <div className="rh-panel-heading"><h2 id="rh-payment-heading">Receiving accounts</h2><p>Customers choose KPay or AYA Pay. Changes apply to new orders.</p></div>
    {error && <div className="admin-feedback admin-feedback-error" role="alert"><CircleAlert size={18} aria-hidden="true"/><p>{error}</p></div>}
    {stale && <div className="rh-confirmation" role="status"><p>The saved settings changed. Your edits remain here.</p><button className="admin-text-button" type="button" disabled={!!busy} onClick={() => void reload()}>Load latest settings</button></div>}
    {notice && <div className="admin-feedback admin-feedback-success" role="status"><Check size={18} aria-hidden="true"/><p>{notice}</p></div>}
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={!!busy} className="rh-payment-methods">
        {draft.map(method => <section className="rh-payment-method" key={method.id} aria-labelledby={`rh-${method.id}-heading`}>
          <div className="rh-method-title"><h3 id={`rh-${method.id}-heading`}>{paymentLabels[method.id]}</h3><label className="rh-enable"><input type="checkbox" checked={method.enabled} onChange={event => update(method.id, { enabled: event.target.checked })}/>Available at checkout</label></div>
          <div className="admin-form-grid">
            <label className="admin-field" htmlFor={`rh-${method.id}-name`}>Account name<input id={`rh-${method.id}-name`} value={method.accountLabel} required={method.enabled} maxLength={150} autoComplete="off" onChange={event => update(method.id, { accountLabel: event.target.value })}/></label>
            <label className="admin-field" htmlFor={`rh-${method.id}-number`}>Receiving number<input id={`rh-${method.id}-number`} value={method.accountNumber} required={method.enabled} maxLength={150} autoComplete="off" spellCheck={false} onChange={event => update(method.id, { accountNumber: event.target.value })}/></label>
          </div>
          <div className="rh-qr-editor">
            {method.qrPath && LOGO_PATH_PATTERN.test(method.qrPath) && <img src={method.qrPath} width={140} height={140} alt={`${paymentLabels[method.id]} receiving QR`}/>}
            <div><label className="admin-field" htmlFor={`rh-${method.id}-qr`}><span><Upload size={15} aria-hidden="true"/> Receiving QR <span className="admin-optional">Optional</span></span>
              <input id={`rh-${method.id}-qr`} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`rh-${method.id}-qr-help`} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(method.id, file); }}/>
              <small id={`rh-${method.id}-qr-help`}>Use the shop’s receiving QR, never a customer receipt. PNG, JPEG or WebP, up to 2 MB.</small>
            </label>{method.qrPath && <button type="button" className="admin-text-button" onClick={() => update(method.id, { qrPath: undefined })}>Remove QR</button>}
            {busy === method.id && <p role="status" className="rh-help">Uploading QR…</p>}</div>
          </div>
        </section>)}
      </fieldset>
      <div className="rh-form-actions"><p className="rh-help">{dirty ? 'You have unsaved recipient changes.' : 'Receiving accounts are up to date.'}</p><button type="submit" className="admin-button admin-button-primary" disabled={!dirty || !!busy || stale}>{busy === 'save' ? <LoaderCircle className="admin-spinner" size={16} aria-hidden="true"/> : <Save size={16} aria-hidden="true"/>}{busy === 'save' ? 'Saving…' : 'Save payment settings'}</button></div>
    </form>
  </section>;
}
