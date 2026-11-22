'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { PAYMENT_METHODS, type PaymentMethod, type PaymentMethodId } from '@/lib/payment';
import { LOGO_PATH_PATTERN, MAX_LOGO_BYTES } from '@/lib/logo-path';
import './payment-settings.css';

export default function PaymentSettings({ value, disabled, onChange, onBusyChange }: {
  value: PaymentMethod[];
  disabled: boolean;
  onChange: (methods: PaymentMethod[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const uploadRequest = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState<PaymentMethodId | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => () => {
    if (uploadRequest.current) {
      uploadRequest.current.abort();
      uploadRequest.current = null;
      onBusyChange(false);
    }
  }, [onBusyChange]);

  function update(method: PaymentMethod, patch: Partial<PaymentMethod>) {
    const next = { ...method, ...patch };
    onChange(value.some(item => item.id === method.id) ? value.map(item => item.id === method.id ? next : item) : [...value, next]);
    setNotice('');
  }

  async function uploadQr(method: PaymentMethod, file: File) {
    if (disabled || uploadRequest.current) return;
    setError('');
    setNotice('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > MAX_LOGO_BYTES) {
      setError('Choose a PNG, JPEG or WebP merchant QR image up to 2 MB.');
      return;
    }
    const controller = new AbortController();
    uploadRequest.current = controller;
    setUploading(method.id);
    onBusyChange(true);
    try {
      const response = await fetch('/api/admin/logos', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file, signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as { path?: string; error?: string } | null;
      if (controller.signal.aborted) return;
      if (!response.ok || !result?.path || !LOGO_PATH_PATTERN.test(result.path)) {
        setError(result?.error || 'The QR upload failed. Choose the image again to retry.');
        return;
      }
      update(method, { qrPath: result.path });
      setNotice('Merchant QR uploaded. Save changes to use it at checkout.');
    } catch {
      if (!controller.signal.aborted) setError('The upload was interrupted. Choose the merchant QR again to retry.');
    } finally {
      if (uploadRequest.current === controller) {
        uploadRequest.current = null;
        setUploading(null);
        onBusyChange(false);
      }
    }
  }

  return <div className="admin-payment-settings">
    <p>Set the merchant destinations shown during checkout. Enable each method when its details are ready.</p>
    {PAYMENT_METHODS.map(({ id, name }) => {
      const method: PaymentMethod = value.find(item => item.id === id) ?? { id, enabled: false, accountName: '', accountNumber: '', instructions: '' };
      const isBinance = id === 'binance';
      return <fieldset className="admin-payment-method" key={id} disabled={disabled || uploading !== null}>
        <legend>{name}</legend>
        <label className="admin-toggle-row">
          <span><strong>Enable {name}</strong><span>Offer this payment method at checkout.</span></span>
          <input type="checkbox" className="admin-switch" checked={method.enabled} onChange={event => update(method, { enabled: event.target.checked })}/>
        </label>
        <div className="admin-form-grid">
          <label className="admin-field">Receiver name
            <input id={`payment-${id}-name`} value={method.accountName} maxLength={150} required={method.enabled} autoComplete="off"
              onChange={event => update(method, { accountName: event.target.value })}/>
          </label>
          <label className="admin-field">{isBinance ? 'Binance Pay ID' : 'Receiver phone / account number'}
            <input id={`payment-${id}-number`} value={method.accountNumber} maxLength={250} required={method.enabled} autoComplete="off" inputMode={isBinance ? 'numeric' : 'tel'}
              onChange={event => update(method, { accountNumber: event.target.value })}/>
          </label>
          {isBinance && <label className="admin-field admin-field-wide">MMK for 1 USDT
            <input id="payment-binance-rate" type="number" min="0.01" max={1000000000} step="0.01" value={method.mmkPerUsdt ?? ''} required={method.enabled}
              onChange={event => update(method, { mmkPerUsdt: event.target.value === '' ? undefined : Number(event.target.value) })}/>
            <small>Checkout calculates the USDT amount using this saved rate.</small>
          </label>}
          <label className="admin-field admin-field-wide">Payment instructions <span className="admin-optional">Optional</span>
            <textarea id={`payment-${id}-instructions`} value={method.instructions} rows={3} maxLength={1000} onChange={event => update(method, { instructions: event.target.value })}/>
          </label>
        </div>
        <div className="admin-merchant-qr">
          {method.qrPath && <Image src={method.qrPath} width={144} height={144} alt={`${name} merchant payment QR`} unoptimized/>}
          <div>
            <label className="admin-field">Merchant payment QR <span className="admin-optional">Optional</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void uploadQr(method, file);
              }}/>
            </label>
            <p>{uploading === id ? <><LoaderCircle size={15} className="admin-spinner"/>Uploading merchant QR…</> : <><Upload size={15}/>PNG, JPEG or WebP, up to 2 MB. Customers can view this merchant QR at checkout.</>}</p>
            {method.qrPath && <button className="admin-text-button" type="button" onClick={() => update(method, { qrPath: undefined })}><X size={15}/>Remove QR from this method</button>}
          </div>
        </div>
      </fieldset>;
    })}
    {error && <p role="alert" className="commerce-form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
