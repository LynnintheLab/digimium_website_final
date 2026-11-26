'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { Pack, RunningHubData, StockItem } from './types';

type Props = {
  data: RunningHubData;
  onChanged: () => Promise<RunningHubData | undefined>;
  onDirtyChange: (dirty: boolean) => void;
  onAuthExpired: () => void;
};

type ImportAttempt = { requestId: string; packId: Pack['id']; keys: (string | { key: string; name: string })[] };
const MAX_KEYS = 100;
const MAX_KEY_NAME = 100;
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Yangon',
});
const statusLabels: Record<string, string> = {
  available: 'Available', reserved: 'Reserved', issued: 'Issued', retired: 'Retired',
};

function available(item: StockItem) {
  return item.status === 'available' && !item.reservedOrderId && !item.issuedOrderId;
}

function addedBatch(value: unknown, count: number): value is { created: boolean; added: number; ids: string[] } {
  if (!value || typeof value !== 'object') return false;
  const result = value as { created?: unknown; added?: unknown; ids?: unknown };
  return typeof result.created === 'boolean' && result.added === count && Array.isArray(result.ids) &&
    result.ids.length === count && result.ids.every(id => typeof id === 'string' && id.length > 0) &&
    new Set(result.ids).size === count;
}

export default function InventoryPanel({ data, onChanged, onDirtyChange, onAuthExpired }: Props) {
  const [packId, setPackId] = useState<Pack['id']>(data.packs[0]?.id ?? 'usd10');
  const [keyName, setKeyName] = useState('');
  const [keysText, setKeysText] = useState('');
  const [busy, setBusy] = useState<'add' | 'remove' | 'refresh' | null>(null);
  const [error, setError] = useState('');
  const [errorScope, setErrorScope] = useState<'add' | 'name' | 'remove' | 'refresh' | null>(null);
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const attempt = useRef<ImportAttempt | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  const keyNameInput = useRef<HTMLInputElement>(null);
  const keysInput = useRef<HTMLTextAreaElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const enteredCount = keysText.split(/\r\n?|\n/).filter(line => line.trim()).length;
  const removing = data.stock.find(item => item.id === removingId);
  const canRemove = !!removing && available(removing);
  const locked = busy !== null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { onDirtyChange(Boolean(keyName || keysText) || locked); }, [keyName, keysText, locked, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function editDraft() {
    setNotice('');
    attempt.current = null;
    if (!needsRefresh) { setError(''); setErrorScope(null); }
  }

  function showInputError(message: string, field: 'add' | 'name' = 'add') {
    setError(message); setErrorScope(field);
    const input = field === 'name' ? keyNameInput : keysInput;
    input.current?.focus();
  }

  async function refresh() {
    if (active.current) return;
    active.current = true; setBusy('refresh');
    try {
      const latest = await onChanged();
      if (!mounted.current) return;
      if (!latest) throw new Error('Unconfirmed refresh');
      setNeedsRefresh(false); setError(''); setErrorScope(null);
      if (!uncertain) attempt.current = null;
      setNotice(uncertain
        ? 'Stock refreshed. Retry the same batch to confirm whether it was added.'
        : 'Stock refreshed. Your key draft has been kept.');
    } catch {
      if (mounted.current) { setError('Could not refresh stock. Your draft is still here. Try again.'); setErrorScope('refresh'); }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function addKeys(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || needsRefresh) return;
    let submission = attempt.current;
    if (!submission) {
      const keys = keysText.split(/\r\n?|\n/).map(line => line.trim()).filter(Boolean);
      if (!keys.length) { showInputError('Paste at least one key, with one key on each line.'); return; }
      if (keys.length > MAX_KEYS) { showInputError('Add up to 100 keys at a time. Split this batch into smaller groups.'); return; }
      if (keys.some(key => key.length < 8 || key.length > 2048 || /[\s\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(key))) {
        showInputError('Each key must contain 8–2,048 characters, with no spaces or control characters.'); return;
      }
      if (new Set(keys).size !== keys.length) {
        showInputError('This batch contains duplicate keys. Remove repeated lines before adding it.'); return;
      }
      if (!data.packs.some(pack => pack.id === packId)) { showInputError('Choose an available bundle before adding keys.'); return; }
      const name = keyName.trim();
      if (name.length > MAX_KEY_NAME || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(name)) {
        showInputError('Use up to 100 characters on one line for the key name.', 'name'); return;
      }
      if (name && keys.length !== 1) {
        showInputError('Enter one API key to save a name, or clear the name to add this batch.', 'name'); return;
      }
      submission = { requestId: crypto.randomUUID(), packId, keys: name ? [{ key: keys[0], name }] : keys };
      attempt.current = submission;
    }
    active.current = true; setBusy('add'); setError(''); setErrorScope(null); setNotice('');
    try {
      const response = await fetch('/api/admin/runninghub/stock', {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submission),
      });
      if (!mounted.current) return;
      if (response.status === 401 || response.status === 403) { onAuthExpired(); return; }
      if (!response.ok) {
        if (response.status === 408 || response.status >= 500) throw new Error('Unconfirmed import');
        attempt.current = null; setUncertain(false); setErrorScope('add');
        if (response.status === 409) {
          setNeedsRefresh(true);
          setError('This batch conflicts with existing stock. No keys were added by this attempt. Refresh stock, then check your draft before trying again.');
        } else {
          setError(response.status === 413
            ? 'This batch is too large. Add up to 100 keys, each with at most 2,048 characters.'
            : 'Could not add this batch. Check the selected bundle and key format, then try again.');
        }
        return;
      }
      const result: unknown = await response.json();
      if (!mounted.current) return;
      if (!addedBatch(result, submission.keys.length)) throw new Error('Unconfirmed import');
      attempt.current = null; setUncertain(false); setNeedsRefresh(false); setKeyName(''); setKeysText('');
      const packLabel = data.packs.find(pack => pack.id === submission.packId)?.label ?? 'the selected bundle';
      setNotice(`${result.added} ${result.added === 1 ? 'key added' : 'keys added'} to ${packLabel}.`);
      onDirtyChange(true);
      try { if (!await onChanged()) throw new Error('Unconfirmed refresh'); }
      catch { if (mounted.current) { setNeedsRefresh(true); setError('Your keys were added, but the stock list could not refresh. Refresh stock to see the latest records.'); setErrorScope('refresh'); } }
    } catch {
      if (mounted.current) {
        setUncertain(true); setErrorScope('add');
        setError('Could not confirm whether this batch was added. Your draft is kept. Retry the same batch to check safely.');
      }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  function cancelRemoval() {
    setRemovingId(null);
    requestAnimationFrame(() => {
      if (removeTrigger.current?.isConnected) removeTrigger.current.focus();
      else listHeading.current?.focus();
    });
  }

  async function removeKey() {
    if (active.current || needsRefresh || !removing || !available(removing)) return;
    const id = removing.id;
    active.current = true; setBusy('remove'); setError(''); setErrorScope(null); setNotice('');
    try {
      const response = await fetch('/api/admin/runninghub/stock/' + encodeURIComponent(id), {
        method: 'DELETE', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: id }),
      });
      if (!mounted.current) return;
      if (response.status === 401 || response.status === 403) { onAuthExpired(); return; }
      if (!response.ok) {
        setNeedsRefresh(true); setErrorScope('remove');
        setError(response.status === 404 || response.status === 409
          ? 'This stock record changed. Refresh stock before deciding whether to delete it.'
          : 'Could not confirm deletion. Refresh stock to check its current status.');
        return;
      }
      const result = await response.json() as { removed?: boolean; id?: string };
      if (!mounted.current) return;
      if (result.removed !== true || result.id !== id) throw new Error('Unconfirmed deletion');
      setRemovingId(null); setNotice('Available key removed from sale.');
      try { if (!await onChanged()) throw new Error('Unconfirmed refresh'); }
      catch { if (mounted.current) { setNeedsRefresh(true); setError('The key was removed, but the stock list could not refresh. Refresh stock to see its current status.'); setErrorScope('refresh'); } }
      if (mounted.current) requestAnimationFrame(() => listHeading.current?.focus());
    } catch {
      if (mounted.current) { setNeedsRefresh(true); setErrorScope('remove'); setError('Could not confirm deletion. Refresh stock before trying again.'); }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  return <div className="rh-inventory">
    {error && <div className="admin-feedback admin-feedback-error" role="alert" id="rh-inventory-error"><div>
      <p>{error}</p>
      {(needsRefresh || errorScope === 'refresh') && <button type="button" disabled={locked} onClick={() => void refresh()}>Refresh stock and keep draft</button>}
    </div></div>}
    {notice && <p className="admin-feedback admin-feedback-success" role="status">{notice}</p>}

    <section className="rh-panel" aria-labelledby="rh-stock-summary-title">
      <div className="rh-panel-heading"><h2 id="rh-stock-summary-title">Stock by bundle</h2>
        <button type="button" className="admin-text-button" disabled={locked} onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden className={busy === 'refresh' ? 'admin-spinner' : undefined} />Refresh stock
        </button>
      </div>
      <div className="rh-table-wrap" tabIndex={0} role="region" aria-label="Stock counts by bundle">
        <table className="rh-table rh-stock-summary"><thead><tr><th scope="col">Bundle</th><th scope="col">Available</th><th scope="col">Reserved in recent stock</th><th scope="col">Issued in recent stock</th></tr></thead>
          <tbody>{data.packs.map(pack => <tr key={pack.id}><th scope="row">{pack.label}</th>
            <td>{pack.available}</td>{['reserved', 'issued'].map(status => <td key={status}>{data.stock.filter(item => item.packId === pack.id && item.status === status).length}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="rh-help">Available totals include all stock. Reserved and issued counts cover the latest 1,000 stock records.</p>
    </section>

    <section className="rh-panel" aria-labelledby="rh-add-stock-title">
      <div className="rh-panel-heading"><div><h2 id="rh-add-stock-title">Add keys</h2><p className="rh-help">Choose a bundle and paste one API key per line.</p></div></div>
      <form onSubmit={event => void addKeys(event)} autoComplete="off">
        <fieldset disabled={locked || uncertain}>
          <label className="admin-field">Bundle<select value={packId} onChange={event => {
            setPackId(event.target.value as Pack['id']); editDraft();
          }}>{data.packs.map(pack => <option value={pack.id} key={pack.id}>{pack.label}</option>)}</select></label>
          <label className="admin-field" htmlFor="rh-stock-key-name">Key name (optional)
            <input id="rh-stock-key-name" ref={keyNameInput} value={keyName} onChange={event => { setKeyName(event.target.value); editDraft(); }}
              type="text" maxLength={MAX_KEY_NAME} placeholder="Key - 1" autoComplete="off"
              aria-invalid={errorScope === 'name' && !!error || undefined}
              aria-describedby={'rh-stock-key-name-help' + (errorScope === 'name' && error ? ' rh-inventory-error' : '')} />
          </label>
          <p id="rh-stock-key-name-help" className="rh-help">Add one key at a time to give it a name. The buyer will see this name with their key.</p>
          <label className="admin-field" htmlFor="rh-stock-keys">API keys
            <textarea id="rh-stock-keys" ref={keysInput} value={keysText} onChange={event => { setKeysText(event.target.value); editDraft(); }}
              rows={7} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
              aria-invalid={errorScope === 'add' && !!error || undefined}
              aria-describedby={'rh-stock-keys-help' + (errorScope === 'add' && error ? ' rh-inventory-error' : '')} />
          </label>
          <p id="rh-stock-keys-help" className="rh-help">Up to 100 keys per batch. Each key must be 8–2,048 characters with no spaces. Empty lines are ignored.</p>
        </fieldset>
        <div className="rh-form-actions">
          <button type="submit" className="admin-button admin-button-primary" disabled={locked || needsRefresh || !enteredCount || !data.packs.length}>
            {busy === 'add' ? <LoaderCircle size={16} className="admin-spinner" aria-hidden /> : <Plus size={16} aria-hidden />}
            {busy === 'add' ? 'Adding keys…' : uncertain ? 'Retry same batch' : 'Add keys'}
          </button>
          <span className="rh-help">{enteredCount} {enteredCount === 1 ? 'key entered' : 'keys entered'}</span>
          {uncertain && <p className="rh-help">The bundle, name and keys are held until this request is confirmed.</p>}
        </div>
      </form>
    </section>

    <section className="rh-panel" aria-labelledby="rh-stock-list-title">
      <div className="rh-panel-heading"><div><h2 id="rh-stock-list-title" ref={listHeading} tabIndex={-1}>Stock records</h2><p className="rh-help">Latest 1,000 records. Only available keys can be deleted. All dates use Myanmar time.</p></div></div>
      {removingId && <section className="rh-confirmation" role="group" aria-labelledby="rh-delete-stock-title" aria-describedby="rh-delete-stock-description">
        <h3 id="rh-delete-stock-title" ref={confirmationHeading} tabIndex={-1}>Delete available key?</h3>
        <p id="rh-delete-stock-description">{canRemove ? 'This key will no longer be available for purchases.' : 'This record is no longer available for deletion. Refresh stock to see its current status.'}</p>
        <p className="rh-stock-reference">Stock ID: {removingId}</p>
        <div className="rh-form-actions"><button type="button" className="admin-button admin-button-secondary" disabled={locked} onClick={cancelRemoval}>Cancel</button>
          <button type="button" className="admin-button rh-danger-button" disabled={locked || needsRefresh || !canRemove} onClick={() => void removeKey()}>
            {busy === 'remove' ? <LoaderCircle size={16} className="admin-spinner" aria-hidden /> : <Trash2 size={16} aria-hidden />}
            {busy === 'remove' ? 'Deleting key…' : 'Delete available key'}
          </button>
        </div>
      </section>}
      {data.stock.length ? <div className="rh-table-wrap" tabIndex={0} role="region" aria-label="Stock records">
        <table className="rh-table"><thead><tr><th scope="col">Stock ID</th><th scope="col">Key name</th><th scope="col">Bundle</th><th scope="col">Status</th><th scope="col">Added</th><th scope="col">Order ID</th><th scope="col"><span className="admin-sr-only">Actions</span></th></tr></thead>
          <tbody>{data.stock.map(item => {
            const created = new Date(item.createdAt);
            return <tr key={item.id}><th scope="row" className="rh-stock-reference">{item.id}</th>
              <td className="rh-stock-key-name">{item.keyName ? <bdi>{item.keyName}</bdi> : 'Unnamed'}</td>
              <td>{data.packs.find(pack => pack.id === item.packId)?.label ?? item.packId}</td>
              <td><span className="rh-status" data-status={item.status}>{statusLabels[item.status] ?? 'Unknown'}</span></td>
              <td>{Number.isNaN(created.getTime()) ? 'Date unavailable' : <time dateTime={item.createdAt}>{dateFormat.format(created)}</time>}</td>
              <td className="rh-stock-reference">{item.issuedOrderId ?? item.reservedOrderId ?? 'None'}</td>
              <td>{available(item) && <button type="button" className="admin-text-button rh-danger-link" disabled={locked || needsRefresh || uncertain} aria-label={'Delete available key, stock ID ' + item.id} onClick={event => {
                removeTrigger.current = event.currentTarget; setRemovingId(item.id); setError(''); setErrorScope(null); setNotice('');
                requestAnimationFrame(() => confirmationHeading.current?.focus());
              }}><Trash2 size={16} aria-hidden />Delete…</button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <p className="rh-empty">No stock yet. Add keys to make a bundle available for purchase.</p>}
    </section>
  </div>;
}
