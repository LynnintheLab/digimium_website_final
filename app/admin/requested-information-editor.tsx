'use client';

import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CustomerField } from '@/lib/payment';
import './payment-settings.css';

const MAX_FIELDS = 12;

export function requestedFieldId(fieldId: string) {
  return `checkout-field-${fieldId}-label`;
}

export default function RequestedInformationEditor({ fields, onChange, disabled = false, inheritedFields }: {
  fields: CustomerField[] | undefined;
  onChange: (fields: CustomerField[] | undefined) => void;
  disabled?: boolean;
  inheritedFields?: CustomerField[];
}) {
  const prefix = useId();
  const [customFields, setCustomFields] = useState<CustomerField[]>(fields ?? []);
  const canInherit = inheritedFields !== undefined;
  const inherited = canInherit && fields === undefined;
  const activeFields = fields ?? [];

  function change(next: CustomerField[]) {
    setCustomFields(next);
    onChange(next);
  }

  function update(id: string, patch: Partial<CustomerField>) {
    change(activeFields.map(field => field.id === id ? { ...field, ...patch } : field));
  }

  function addField() {
    if (disabled || activeFields.length >= MAX_FIELDS) return;
    const field: CustomerField = { id: crypto.randomUUID(), label: '', type: 'text', required: true };
    change([...activeFields, field]);
    requestAnimationFrame(() => document.getElementById(requestedFieldId(field.id))?.focus());
  }

  function removeField(id: string, index: number) {
    const next = activeFields[index + 1] ?? activeFields[index - 1];
    change(activeFields.filter(field => field.id !== id));
    requestAnimationFrame(() => document.getElementById(next ? requestedFieldId(next.id) : `${prefix}-add`)?.focus());
  }

  return <section className="admin-checkout-fields" aria-labelledby={`${prefix}-heading`}>
    <h3 id={`${prefix}-heading`}>Information needed from customer</h3>
    <p>Customers fill these fields for each purchased account during checkout.</p>
    {canInherit && <label className="admin-field">Fields for this plan
      <select disabled={disabled} value={inherited ? 'inherit' : activeFields.length ? 'custom' : 'none'} onChange={event => {
        if (event.target.value === 'inherit') onChange(undefined);
        else if (event.target.value === 'none') change([]);
        else change(customFields.length ? customFields : inheritedFields.length
          ? inheritedFields.map(field => ({ ...field, id: crypto.randomUUID() }))
          : [{ id: crypto.randomUUID(), label: '', type: 'text', required: true }]);
      }}>
        <option value="inherit">Use service fields</option>
        <option value="custom">Choose fields for this plan</option>
        <option value="none">No additional information</option>
      </select>
    </label>}
    {inherited ? <p className="admin-checkout-field-summary">{inheritedFields.length
      ? inheritedFields.map(field => field.label || 'Untitled field').join(' · ')
      : 'This service asks for no additional information.'}</p> : <>
      {activeFields.length === 0 && <p className="admin-checkout-field-summary">No additional information required.</p>}
      {activeFields.map((field, index) => <fieldset key={field.id} className="admin-checkout-field-row" disabled={disabled}>
        <legend>Field {index + 1}</legend>
        <div className="admin-form-grid">
          <label className="admin-field">English label
            <input id={requestedFieldId(field.id)} value={field.label} maxLength={100} placeholder="e.g. Account email" required
              onChange={event => update(field.id, { label: event.target.value })}/>
          </label>
          <label className="admin-field">Myanmar label <span className="admin-optional">Optional</span>
            <input lang="my" value={field.labelMy ?? ''} maxLength={160} onChange={event => update(field.id, { labelMy: event.target.value })}/>
          </label>
          <label className="admin-field">Input type
            <select value={field.type} onChange={event => update(field.id, { type: event.target.value as CustomerField['type'] })}>
              <option value="text">Text</option><option value="email">Email</option><option value="password">Password</option>
            </select>
          </label>
          <label className="admin-plan-publish">
            <input type="checkbox" checked={field.required} onChange={event => update(field.id, { required: event.target.checked })}/>Required
          </label>
        </div>
        <button type="button" className="admin-text-button" aria-label={`Remove ${field.label || `field ${index + 1}`}`} onClick={() => removeField(field.id, index)}>
          <Trash2 size={15}/>Remove field
        </button>
      </fieldset>)}
      <button id={`${prefix}-add`} type="button" className="admin-button admin-button-secondary" disabled={disabled || activeFields.length >= MAX_FIELDS} onClick={addField}>
        <Plus size={16}/>Add field
      </button>
      {activeFields.length >= MAX_FIELDS && <p>This offer has reached the {MAX_FIELDS}-field limit.</p>}
    </>}
  </section>;
}
