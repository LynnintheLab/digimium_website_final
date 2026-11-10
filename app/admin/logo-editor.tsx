'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Copy, LoaderCircle, Upload, X } from 'lucide-react';
import { markKeys, type Product } from '@/lib/catalog';
import { LOGO_PATH_PATTERN, MAX_LOGO_BYTES, MAX_LOGO_DIMENSION } from '@/lib/logo-path';
import { productLogoSrc } from '@/lib/product-logo';
import './logo-editor.css';

type LogoFields = Pick<Product, 'name' | 'mark' | 'logoPath'>;
type Props = {
  product: LogoFields;
  disabled: boolean;
  markLabels: Record<string, string>;
  onChange: (patch: Pick<Partial<Product>, 'mark' | 'logoPath'>) => void;
  onBusyChange: (busy: boolean) => void;
};

export function ServiceMark({ product }: { product: LogoFields }) {
  const src = productLogoSrc(product);
  const [failed, setFailed] = useState<string>();
  return <span className="admin-service-mark" aria-hidden="true">
    {src && failed !== src
      ? <img src={src} alt="" onError={() => setFailed(src)} />
      : <span className="admin-service-initial">{product.name.trim().slice(0, 1).toUpperCase() || 'D'}</span>}
  </span>;
}

export function LogoEditor({ product, disabled, markLabels, onChange, onBusyChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const pathInput = useRef<HTMLInputElement>(null);
  const uploadRequest = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [existingPath, setExistingPath] = useState('');
  const existingPanel = useRef<HTMLDetailsElement>(null);

  useLayoutEffect(() => () => {
    if (uploadRequest.current) {
      uploadRequest.current.abort();
      uploadRequest.current = null;
      onBusyChange(false);
    }
  }, [onBusyChange]);

  async function uploadLogo(file: File) {
    if (disabled || uploadRequest.current) return;
    setError('');
    setMessage('');
    const mime = file.type.toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      setError('Choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (!file.size || file.size > MAX_LOGO_BYTES) {
      setError('Choose an image between 1 byte and 2 MB.');
      return;
    }
    const request = new AbortController();
    uploadRequest.current = request;
    setUploading(true);
    onBusyChange(true);
    try {
      const response = await fetch('/api/admin/logos', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': mime },
        body: file, signal: request.signal,
      });
      const result = await response.json().catch(() => null) as { path?: string; error?: string } | null;
      if (request.signal.aborted) return;
      if (!response.ok || !result?.path || !LOGO_PATH_PATTERN.test(result.path)) {
        setError(result?.error || 'The upload failed. Choose the file again to retry.');
        return;
      }
      onChange({ logoPath: result.path });
      setExistingPath('');
      if (existingPanel.current) existingPanel.current.open = false;
      setMessage('Logo uploaded. Save changes to attach it to this service.');
    } catch {
      if (!request.signal.aborted) setError('The upload was interrupted. Check your connection and choose the file again.');
    } finally {
      if (uploadRequest.current === request) {
        uploadRequest.current = null;
        setUploading(false);
        onBusyChange(false);
      }
    }
  }

  async function copyPath() {
    if (!product.logoPath) return;
    setError('');
    try {
      await navigator.clipboard.writeText(product.logoPath);
      setMessage('Logo path copied.');
    } catch {
      pathInput.current?.select();
      setMessage('The logo path is selected. Use Copy on your device.');
    }
  }

  function useExistingPath() {
    const path = existingPath.trim();
    if (disabled || uploading) return;
    setMessage('');
    if (!LOGO_PATH_PATTERN.test(path)) {
      setError('Paste a logo path copied from this site’s product editor.');
      return;
    }
    setError('');
    onChange({ logoPath: path });
    setExistingPath('');
    if (existingPanel.current) existingPanel.current.open = false;
    setMessage('Logo selected. Save changes to attach it to this service.');
  }

  return <section className="admin-form-section admin-logo-editor" aria-labelledby="product-logo-heading">
    <h3 id="product-logo-heading">Product logo</h3>
    <div className="admin-logo-tools">
      <ServiceMark product={product} />
      <div className="admin-logo-choices">
        <input ref={fileInput} id="product-logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled || uploading} onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void uploadLogo(file);
        }} />
        <button type="button" className="admin-button admin-button-secondary" disabled={disabled || uploading} onClick={() => fileInput.current?.click()} aria-describedby="product-logo-hint">
          {uploading ? <LoaderCircle size={16} className="admin-spinner" /> : <Upload size={16} />}
          {uploading ? 'Uploading…' : product.logoPath ? 'Replace logo' : 'Upload logo'}
        </button>
        {product.logoPath && <button type="button" className="admin-text-button" disabled={disabled || uploading} onClick={() => {
          onChange({ logoPath: undefined });
          setError('');
          setMessage('Uploaded logo detached. Save changes to use the built-in icon.');
        }}><X size={15} />Remove logo</button>}
      </div>
    </div>
    <p id="product-logo-hint" className="admin-logo-hint">PNG, JPEG or WebP · up to 2 MB and {MAX_LOGO_DIMENSION.toLocaleString('en-US')} × {MAX_LOGO_DIMENSION.toLocaleString('en-US')} pixels</p>
    {product.logoPath && <div className="admin-logo-path-row">
      <label className="admin-field" htmlFor="product-logo-path">Saved logo path
        <input ref={pathInput} id="product-logo-path" value={product.logoPath} readOnly onFocus={event => event.currentTarget.select()} spellCheck={false} />
      </label>
      <button type="button" className="admin-button admin-button-secondary" onClick={() => void copyPath()}><Copy size={15} />Copy path</button>
    </div>}
    <label className="admin-field" htmlFor="service-mark">Built-in icon<select id="service-mark" value={product.mark} disabled={disabled || uploading} onChange={event => onChange({ mark: event.target.value })}>
      <option value="">Service initial</option>
      {markKeys.map(mark => <option key={mark} value={mark}>{markLabels[mark] || mark}</option>)}
    </select><small>Used when the service has no uploaded logo.</small></label>
    <details ref={existingPanel} className="admin-logo-reuse">
      <summary>Use a saved logo path</summary>
      <div className="admin-logo-path-row"><label className="admin-field" htmlFor="product-existing-logo-path">Logo path
        <input id="product-existing-logo-path" type="text" value={existingPath} maxLength={120} placeholder="/media/logos/…" autoComplete="off" spellCheck={false} onChange={event => { setExistingPath(event.target.value); setError(''); }} disabled={disabled || uploading} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); useExistingPath(); } }} />
      </label><button type="button" className="admin-button admin-button-secondary" disabled={disabled || uploading || !existingPath.trim()} onClick={useExistingPath}>Use path</button></div>
    </details>
    {error && <p className="admin-logo-issue" role="alert">{error}</p>}
    <p className="admin-logo-notice" role="status">{message}</p>
  </section>;
}
