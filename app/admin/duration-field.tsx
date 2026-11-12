'use client';

import { useState } from 'react';
import './duration-field.css';

type DurationUnit = 'day' | 'month' | 'year';

type DurationFieldProps = {
  id: string;
  value: string;
  onChange: (duration: string) => void;
  optional?: boolean;
};

export default function DurationField({ id, value, onChange, optional }: DurationFieldProps) {
  const [emptyUnit, setEmptyUnit] = useState<DurationUnit>('month');
  const match = /^([1-9]\d*)\s*(day|month|year)s?$/i.exec(value.trim());
  const quantity = match?.[1] ?? '';
  const unit = (match?.[2].toLowerCase() as DurationUnit | undefined) ?? emptyUnit;
  const hasCustomDuration = Boolean(value.trim() && !match);

  function changeQuantity(input: string) {
    const digits = input.replace(/[၀-၉]/g, digit => String(digit.charCodeAt(0) - 0x1040));
    if (!digits) {
      setEmptyUnit(unit);
      onChange('');
      return;
    }
    if (!/^[1-9]\d*$/.test(digits)) return;
    onChange(formatDuration(digits, unit));
  }

  function changeUnit(next: DurationUnit) {
    setEmptyUnit(next);
    if (quantity) onChange(formatDuration(quantity, next));
  }

  return (
    <div className="admin-field" role="group" aria-labelledby={id + '-label'}>
      <label id={id + '-label'} htmlFor={id}>
        Duration {optional && <span className="admin-optional">Optional</span>}
      </label>
      <div className="admin-duration-controls">
        <input id={id} type="text" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={73}
          placeholder="e.g. 1" value={quantity}
          aria-describedby={hasCustomDuration ? id + '-current' : undefined}
          onChange={event => changeQuantity(event.target.value)} />
        <select aria-label="Duration unit" value={unit}
          onChange={event => changeUnit(event.target.value as DurationUnit)}>
          <option value="day">Day</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </div>
      {hasCustomDuration && (
        <div className="admin-duration-current">
          <small id={id + '-current'}>Current duration: {value}. Enter a number to replace it.</small>
          <button type="button" className="admin-text-button" onClick={() => onChange('')}>Clear duration</button>
        </div>
      )}
    </div>
  );
}

function formatDuration(quantity: string, unit: DurationUnit) {
  return `${quantity} ${unit}${quantity === '1' ? '' : 's'}`;
}
