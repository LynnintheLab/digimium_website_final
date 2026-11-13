'use client';

import { useState } from 'react';
import { durationPattern } from '../../lib/duration';
import './duration-field.css';

type DurationUnit = 'day' | 'month' | 'year';
type Period = { quantity: string; unit: DurationUnit };

type DurationFieldProps = {
  id: string;
  value: string;
  onChange: (duration: string) => void;
  optional?: boolean;
};

function formatPeriod({ quantity, unit }: Period) {
  return quantity + ' ' + unit + (quantity === '1' ? '' : 's');
}

function PeriodInputs({ id, label, period, onChange, description }: {
  id: string;
  label: string;
  period: Period;
  onChange: (period: Period) => void;
  description?: string;
}) {
  function changeQuantity(input: string) {
    const digits = input.replace(/[၀-၉]/g, digit => String(digit.charCodeAt(0) - 0x1040));
    if (digits === '' || /^[1-9]\d*$/.test(digits)) onChange({ ...period, quantity: digits });
  }
  return (
    <div className="admin-duration-controls">
      <input id={id} type="text" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={73}
        placeholder="e.g. 1" value={period.quantity} aria-describedby={description}
        onChange={event => changeQuantity(event.target.value)} />
      <select aria-label={label + ' unit'} value={period.unit}
        onChange={event => onChange({ ...period, unit: event.target.value as DurationUnit })}>
        <option value="day">Day</option>
        <option value="month">Month</option>
        <option value="year">Year</option>
      </select>
    </div>
  );
}

export default function DurationField({ id, value, onChange, optional }: DurationFieldProps) {
  const [emptyUnit, setEmptyUnit] = useState<DurationUnit>('month');
  const [pendingGift, setPendingGift] = useState<Period | null>(null);
  const match = durationPattern.exec(value.trim());
  const paid: Period = { quantity: match?.[1] ?? '', unit: match ? match[2].toLowerCase() as DurationUnit : emptyUnit };
  const gift: Period | null = match?.[3]
    ? { quantity: match[3], unit: match[4].toLowerCase() as DurationUnit }
    : pendingGift;
  const hasCustomDuration = Boolean(value.trim() && !match);

  function update(nextPaid: Period, nextGift: Period | null) {
    let duration = '';
    if (nextPaid.quantity) {
      duration = formatPeriod(nextPaid);
      if (nextGift?.quantity) duration += ' + ' + formatPeriod(nextGift) + ' free';
    }
    if (duration.length > 80) return;
    setEmptyUnit(nextPaid.unit);
    // Keep partially entered periods editable before they form a saved duration.
    setPendingGift(nextPaid.quantity && nextGift?.quantity ? null : nextGift);
    if (hasCustomDuration && !nextPaid.quantity) return;
    if (nextPaid.quantity === paid.quantity && nextPaid.unit === paid.unit &&
      !nextGift?.quantity && !match?.[3]) return;
    if (duration !== value) onChange(duration);
  }

  return (
    <div className="admin-field" role="group" aria-labelledby={id + '-label'}>
      <label id={id + '-label'} htmlFor={id}>
        Duration {optional && <span className="admin-optional">Optional</span>}
      </label>
      <PeriodInputs id={id} label="Duration" period={paid} onChange={next => update(next, gift)}
        description={hasCustomDuration ? id + '-current' : undefined} />
      {hasCustomDuration && (
        <div className="admin-duration-current">
          <small id={id + '-current'}>Current duration: {value}. Enter a number to replace it.</small>
          <button type="button" className="admin-text-button" onClick={() => onChange('')}>Clear duration</button>
        </div>
      )}
      {paid.quantity && (gift ? (
        <div className="admin-duration-gift">
          <div className="admin-duration-gift-heading">
            <label htmlFor={id + '-gift'}>Gift duration</label>
            <button type="button" className="admin-text-button" onClick={() => update(paid, null)}>Remove gift</button>
          </div>
          <PeriodInputs id={id + '-gift'} label="Gift duration" period={gift} onChange={next => update(paid, next)} />
        </div>
      ) : (
        <button type="button" className="admin-text-button admin-duration-add"
          onClick={() => setPendingGift({ quantity: '', unit: paid.unit })}>Add gift duration</button>
      ))}
    </div>
  );
}
