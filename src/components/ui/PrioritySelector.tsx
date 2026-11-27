import React from 'react';
import { Flag } from 'lucide-react';

export type TaskPriority = 'low' | 'medium' | 'high';

interface PrioritySelectorProps {
  value: TaskPriority;
  onChange: (next: TaskPriority) => void;
  labelId: string;
  label?: string;
  disabled?: boolean;
}

const PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];

/** Shared priority selector using Flag icons so colored dots remain reserved for cognitive load. */
export const PrioritySelector: React.FC<PrioritySelectorProps> = ({
  value,
  onChange,
  labelId,
  label = 'Priority',
  disabled = false,
}) => {
  return (
    <div>
      <span id={labelId} className="field-label">
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-3 gap-1.5">
        {PRIORITIES.map(p => {
          const isSelected = value === p;
          const flagClass =
            p === 'high'
              ? 'text-red-600 dark:text-red-400 fill-red-500/20'
              : p === 'medium'
                ? 'text-amber-600 dark:text-amber-400 fill-amber-500/20'
                : 'text-[var(--text-muted)]';

          return (
            <button
              key={p}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onChange(p)}
              className={`mobile-tap-control sm:min-h-0 flex items-center justify-center gap-1.5 py-1.5 rounded-[7px] border text-xs font-semibold capitalize transition-colors cursor-pointer disabled:opacity-50 ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Flag aria-hidden="true" className={`h-3 w-3 shrink-0 ${flagClass}`} />
              <span>{p}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
