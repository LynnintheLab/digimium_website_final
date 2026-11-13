'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ProductPlan } from '@/lib/catalog';
import DurationField from './duration-field';
import PriceField from './price-field';
import './plan-editor.css';

export type PlanEditorProps = {
  plans: ProductPlan[];
  onChange: (plans: ProductPlan[]) => void;
  disabled?: boolean;
};

const MAX_PLANS = 30;

export function planFieldId(planId: string, field: 'name' | 'price' | 'discount-price' | 'duration' | 'published' | 'best-seller' | 'up' | 'down') {
  return `service-plan-${planId}-${field}`;
}

export function PlanEditor({ plans, onChange, disabled = false }: PlanEditorProps) {
  const prefix = useId();
  const pendingFocus = useRef<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    document.getElementById(target)?.focus();
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
    pendingFocus.current = planFieldId(plan.id, 'name');
    onChange([...plans, plan]);
    setNotice('New plan added as a draft.');
  }

  function removePlan(plan: ProductPlan, index: number) {
    if (disabled) return;
    const hasContent = Boolean(plan.name.trim() || plan.price.trim() || plan.discountPrice?.trim() || plan.duration.trim());
    if (hasContent && !window.confirm(`Remove ${plan.name.trim() || 'this plan'} from your draft? This takes effect when you save changes.`)) return;
    const nextPlan = plans[index + 1] ?? plans[index - 1];
    pendingFocus.current = nextPlan ? planFieldId(nextPlan.id, 'name') : `${prefix}-add`;
    onChange(plans.filter(item => item.id !== plan.id));
    setNotice('Plan removed from your draft. Revert restores the last saved catalog.');
  }

  function movePlan(index: number, direction: 'up' | 'down') {
    const destination = index + (direction === 'up' ? -1 : 1);
    if (disabled || destination < 0 || destination >= plans.length) return;
    const plan = plans[index];
    const reordered = [...plans];
    reordered[index] = plans[destination];
    reordered[destination] = plan;

    const nextDirection = destination === 0 ? 'down' : destination === plans.length - 1 ? 'up' : direction;
    pendingFocus.current = planFieldId(plan.id, nextDirection);
    onChange(reordered);
    setNotice(`${plan.name || 'Plan'} moved to position ${destination + 1} of ${plans.length}.`);
  }

  return <section className="admin-form-section admin-plan-editor" aria-labelledby={`${prefix}-heading`}>
    <div className="admin-plan-heading">
      <h3 id={`${prefix}-heading`}>Plan options</h3>
      <span>{plans.length} / {MAX_PLANS}</span>
    </div>
    <p className="admin-plan-help" id={`${prefix}-help`}>Review each plan’s price, then turn on Show on website. Plans appear after you save and publish the service. Leave a price blank for customers to enquire.</p>

    {plans.length ? <div className="admin-plan-list">
      {plans.map((plan, index) => {
        return <fieldset key={plan.id} className="admin-plan-row" disabled={disabled} aria-labelledby={`${prefix}-label-${plan.id}`} aria-describedby={`${prefix}-help`}>
          <legend>
            <span className="admin-plan-row-heading">
              <span id={`${prefix}-label-${plan.id}`}>Plan {index + 1}</span>
              {plans.length > 1 && <span className="admin-plan-order">
                <button type="button" id={planFieldId(plan.id, 'up')} aria-label={`Move ${plan.name || `plan ${index + 1}`} up`} title="Move up" disabled={disabled || index === 0} onClick={() => movePlan(index, 'up')}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" id={planFieldId(plan.id, 'down')} aria-label={`Move ${plan.name || `plan ${index + 1}`} down`} title="Move down" disabled={disabled || index === plans.length - 1} onClick={() => movePlan(index, 'down')}><ArrowDown size={16} aria-hidden="true" /></button>
              </span>}
            </span>
          </legend>
          <div className="admin-form-grid">
            <label className="admin-field admin-field-wide" htmlFor={planFieldId(plan.id, 'name')}>Plan name
              <input id={planFieldId(plan.id, 'name')} value={plan.name} maxLength={180} required placeholder="e.g. Plus — private account" onChange={event => updatePlan(plan.id, { name: event.target.value })} />
            </label>
            <PriceField id={planFieldId(plan.id, 'price')} discountId={planFieldId(plan.id, 'discount-price')}
              price={plan.price} discountPrice={plan.discountPrice} onChange={patch => updatePlan(plan.id, patch)} />
            <DurationField id={planFieldId(plan.id, 'duration')} value={plan.duration} onChange={duration => updatePlan(plan.id, { duration })} />
          </div>
          <div className="admin-plan-actions">
            <label className="admin-plan-publish" htmlFor={planFieldId(plan.id, 'published')}>
              <input id={planFieldId(plan.id, 'published')} type="checkbox" checked={plan.published} onChange={event => updatePlan(plan.id, { published: event.target.checked })} />
              <span>Show on website</span>
            </label>
            <label className="admin-plan-publish" htmlFor={planFieldId(plan.id, 'best-seller')}>
              <input id={planFieldId(plan.id, 'best-seller')} type="checkbox" checked={plan.bestSeller ?? false} onChange={event => updatePlan(plan.id, { bestSeller: event.target.checked })} />
              <span>Best Seller</span>
            </label>
            <button type="button" className="admin-text-button admin-plan-remove" aria-label={`Remove ${plan.name || `plan ${index + 1}`}`} onClick={() => removePlan(plan, index)}><Trash2 size={15} />Remove plan</button>
          </div>
        </fieldset>;
      })}
    </div> : <p className="admin-plan-empty">No plan options yet. Add one when this service has different packages or durations.</p>}

    <div className="admin-plan-footer">
      <button id={`${prefix}-add`} type="button" className="admin-button admin-button-secondary" disabled={disabled || plans.length >= MAX_PLANS} onClick={addPlan}><Plus size={16} />Add plan</button>
      {plans.length >= MAX_PLANS && <p>This service has reached the 30-plan limit.</p>}
    </div>
    <p className="admin-plan-notice" role="status">{notice}</p>
  </section>;
}

export default PlanEditor;
