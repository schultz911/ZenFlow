import React from 'react';
import { getLastDayOfMonth, getLocalOffsetDateKey } from '../../utils/workload';

interface DateQuickPresetsProps {
  value: string;
  onSelectDate: (nextDate: string) => void;
  disabled?: boolean;
  includeToday?: boolean;
  originalDate?: string;
  allowClear?: boolean;
  className?: string;
}

export const DateQuickPresets: React.FC<DateQuickPresetsProps> = ({
  value,
  onSelectDate,
  disabled = false,
  includeToday = false,
  originalDate,
  allowClear = false,
  className = '',
}) => {
  const presets: Array<{ label: string; date: string }> = [
    ...(originalDate ? [{ label: 'Original', date: originalDate }] : []),
    ...(includeToday ? [{ label: 'Today', date: getLocalOffsetDateKey(0) }] : []),
    { label: 'Tomorrow', date: getLocalOffsetDateKey(1) },
    { label: '+3d', date: getLocalOffsetDateKey(3) },
    { label: '+1w', date: getLocalOffsetDateKey(7) },
    { label: 'EOM', date: getLastDayOfMonth() },
  ];

  return (
    <div className={`flex items-center gap-1 flex-wrap text-[11px] ${className}`}>
      {presets.map(preset => {
        const isActive = value === preset.date;
        return (
          <button
            key={preset.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelectDate(preset.date)}
            title={`Set deadline to ${preset.date}`}
            className={`mobile-tap-control sm:min-h-[24px] rounded-[5px] border px-2 sm:px-1.5 py-0.5 font-medium tabular-nums transition-colors cursor-pointer disabled:opacity-50 ${
              isActive
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 font-semibold'
                : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
      {allowClear && value && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectDate('')}
          title="Clear deadline"
          className="mobile-tap-control sm:min-h-[24px] rounded-[5px] px-2 sm:px-1.5 py-0.5 font-medium text-red-600 dark:text-red-400 hover:bg-[var(--danger-soft)] transition-colors cursor-pointer disabled:opacity-50"
        >
          Clear
        </button>
      )}
    </div>
  );
};
