'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProductPlan } from '@/lib/catalog';
import './plan-editor.css';

export type PlanEditorProps = {
  plans: ProductPlan[];
  onChange: (plans: ProductPlan[]) => void;
  disabled?: boolean;
};

const MAX_PLANS = 30;

export function planFieldId(planId: string, field: 'name' | 'price' | 'duration' | 'published') {
  return `service-plan-${planId}-${field}`;
}

export function PlanEditor({ plans, onChange, disabled = false }: PlanEditorProps) {
  const prefix = useId();
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<string | 'add' | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    if (target === 'add') addButton.current?.focus();
    else nameInputs.current.get(target)?.focus();
    pendingFocus.current = null;
  }, [plans]);

  function updatePlan(id: string, patch: Partial<ProductPlan>) {
    if (disabled) return;
    onChange(plans.map(plan => plan.id === id ? { ...plan, ...patch } : plan));
    setNotice('');
  }

  function addPlan() {
    if (disabled || plans.length >= MAX_PLANS) return;
    const plan: ProductPlan = { id: crypto.randomUUID(), name: '', price: '', duration: '', published: false };
    pendingFocus.current = plan.id;
    onChange([...plans, plan]);
    setNotice('New plan added as a draft.');
  }

  function removePlan(plan: ProductPlan, index: number) {
    if (disabled) return;
    const hasContent = Boolean(plan.name.trim() || plan.price.trim() || plan.duration.trim());
    if (hasContent && !window.confirm(`Remove ${plan.name.trim() || 'this plan'} from your draft? This takes effect when you save changes.`)) return;
    pendingFocus.current = plans[index + 1]?.id ?? plans[index - 1]?.id ?? 'add';
    onChange(plans.filter(item => item.id !== plan.id));
    setNotice('Plan removed from your draft. Revert restores the last saved catalog.');
  }

  return <section className="admin-form-section admin-plan-editor" aria-labelledby={`${prefix}-heading`}>
    <div className="admin-plan-heading">
      <h3 id={`${prefix}-heading`}>Plan options</h3>
      <span>{plans.length} / {MAX_PLANS}</span>
    </div>
    <p className="admin-plan-help" id={`${prefix}-help`}>Review each plan’s price, then turn on Show on website. Plans appear after you save and publish the service. Leave a price blank for customers to enquire.</p>

    {plans.length ? <div className="admin-plan-list">
      {plans.map((plan, index) => {
        return <fieldset key={plan.id} className="admin-plan-row" disabled={disabled} aria-describedby={`${prefix}-help`}>
          <legend>Plan {index + 1}</legend>
          <div className="admin-form-grid">
            <label className="admin-field admin-field-wide" htmlFor={planFieldId(plan.id, 'name')}>Plan name
              <input id={planFieldId(plan.id, 'name')} ref={element => { if (element) nameInputs.current.set(plan.id, element); else nameInputs.current.delete(plan.id); }} value={plan.name} maxLength={180} required placeholder="e.g. Plus — private account" onChange={event => updatePlan(plan.id, { name: event.target.value })} />
            </label>
            <label className="admin-field" htmlFor={planFieldId(plan.id, 'price')}>Price
              <input id={planFieldId(plan.id, 'price')} value={plan.price} maxLength={80} placeholder="e.g. 25,000 MMK" onChange={event => updatePlan(plan.id, { price: event.target.value })} />
            </label>
            <label className="admin-field" htmlFor={planFieldId(plan.id, 'duration')}>Duration
              <input id={planFieldId(plan.id, 'duration')} value={plan.duration} maxLength={80} placeholder="e.g. 1 month" onChange={event => updatePlan(plan.id, { duration: event.target.value })} />
            </label>
          </div>
          <div className="admin-plan-actions">
            <label className="admin-plan-publish" htmlFor={planFieldId(plan.id, 'published')}>
              <input id={planFieldId(plan.id, 'published')} type="checkbox" checked={plan.published} onChange={event => updatePlan(plan.id, { published: event.target.checked })} />
              <span>Show on website</span>
            </label>
            <button type="button" className="admin-text-button admin-plan-remove" aria-label={`Remove ${plan.name || `plan ${index + 1}`}`} onClick={() => removePlan(plan, index)}><Trash2 size={15} />Remove plan</button>
          </div>
        </fieldset>;
      })}
    </div> : <p className="admin-plan-empty">No plan options yet. Add one when this service has different packages or durations.</p>}

    <div className="admin-plan-footer">
      <button ref={addButton} type="button" className="admin-button admin-button-secondary" disabled={disabled || plans.length >= MAX_PLANS} onClick={addPlan}><Plus size={16} />Add plan</button>
      {plans.length >= MAX_PLANS && <p>This service has reached the 30-plan limit.</p>}
    </div>
    <p className="admin-plan-notice" role="status">{notice}</p>
  </section>;
}

export default PlanEditor;
