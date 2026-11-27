import React from 'react';
import { Brain } from 'lucide-react';
import { CognitiveLoad, Role } from '../../types';
import { COGNITIVE_LOAD_WEIGHTS, getCognitiveLoadLabel } from '../../utils/workload';

interface CognitiveLoadSelectorProps {
  value: CognitiveLoad;
  onChange: (next: CognitiveLoad) => void;
  role?: Role;
  disabled?: boolean;
  required?: boolean;
  label?: string;
}

const LEVELS: readonly CognitiveLoad[] = ['low', 'medium', 'high'];

/** Shared cognitive load tier picker displaying multiplier weight and role label consistently. */
export const CognitiveLoadSelector: React.FC<CognitiveLoadSelectorProps> = ({
  value,
  onChange,
  role,
  disabled = false,
  required = false,
  label = 'Cognitive Load',
}) => {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="field-label !mb-0 flex items-center gap-1.5">
          <Brain aria-hidden="true" className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
          <span>
            {label} {required && <span className="text-red-600 dark:text-red-400">*</span>}
          </span>
        </span>
        <span className="text-xs text-[var(--text-secondary)]">
          Low 1 · Medium 1.5 · High 2 points
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={label}>
        {LEVELS.map(level => {
          const isSelected = value === level;
          const weight = COGNITIVE_LOAD_WEIGHTS[level];
          const roleLabel = getCognitiveLoadLabel(level, role);

          return (
            <button
              key={level}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              title={`${level} cognitive load (${weight}x weight) — ${roleLabel}`}
              onClick={() => onChange(level)}
              className={`mobile-tap-control flex flex-col items-center justify-center p-2 rounded-[7px] border text-center transition-colors cursor-pointer disabled:opacity-50 ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 text-xs capitalize font-semibold">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    level === 'high'
                      ? 'bg-red-600 dark:bg-red-400'
                      : level === 'medium'
                        ? 'bg-amber-600 dark:bg-amber-400'
                        : 'bg-emerald-600 dark:bg-emerald-400'
                  }`}
                />
                <span>{level}</span>
                <span className="text-[11px] font-medium tabular-nums text-[var(--text-secondary)]">
                  {weight}x
                </span>
              </span>
              <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-full mt-0.5">
                {roleLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
