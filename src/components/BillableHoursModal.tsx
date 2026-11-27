import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, X, Clock, Plus, Minus, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { Task } from '../types';
import { getTaskBillableMs, formatBillableHours, formatBillableDetailed, formatTaskStatus } from '../utils/workload';

interface BillableHoursModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (taskId: string, newDurationMs: number, reason?: string) => Promise<void>;
}

const QUICK_PRESETS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '15m', minutes: -15 },
];

const REASON_PRESETS = [
  'Manual correction',
  'Client briefing',
  'Review session',
  'Timer overrun',
];

export const BillableHoursModal: React.FC<BillableHoursModalProps> = ({
  isOpen,
  task,
  onClose,
  onSave,
}) => {
  const [hours, setHours] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);

  // Derive initial values when task changes or modal opens
  useEffect(() => {
    if (isOpen && task) {
      const currentMs = getTaskBillableMs(task);
      const totalMinutes = Math.round(currentMs / 60000);
      setHours(Math.floor(totalMinutes / 60));
      setMinutes(totalMinutes % 60);
      setReason('');
      setSaveError(null);
      setIsSubmitting(false);

      // Focus input on mount
      setTimeout(() => {
        hoursInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, task]);

  const currentDurationMs = useMemo(() => {
    return task ? getTaskBillableMs(task) : 0;
  }, [task]);

  const newDurationMs = useMemo(() => {
    const validHours = Math.max(0, hours || 0);
    const validMinutes = Math.max(0, Math.min(59, minutes || 0));
    return (validHours * 60 + validMinutes) * 60 * 1000;
  }, [hours, minutes]);

  const oldFormatted = useMemo(() => formatBillableHours(currentDurationMs), [currentDurationMs]);

  // Adjust duration by adding or subtracting minutes
  const applyPresetMinutes = (deltaMinutes: number) => {
    const currentTotalMin = Math.max(0, (hours || 0) * 60 + (minutes || 0) + deltaMinutes);
    setHours(Math.floor(currentTotalMin / 60));
    setMinutes(currentTotalMin % 60);
  };

  const handleResetToZero = () => {
    setHours(0);
    setMinutes(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || isSubmitting) return;

    setSaveError(null);
    setIsSubmitting(true);
    try {
      await onSave(task.id, newDurationMs, reason.trim() || undefined);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save billable duration. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSubmitting) onClose();
          }}
        >
          <DialogPanel aria-label="Adjust billable hours" onClose={onClose} busy={isSubmitting}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg my-auto overflow-hidden"
          >
            {/* Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                  <Timer className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                    Adjust Billable Hours
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate" title={task.title}>
                    {task.title}
                  </p>
                </div>
              </div>
              <button
                aria-label="Close dialog"
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-5 space-y-4">
                {saveError && (
                  <div role="alert" className="callout callout-danger flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{saveError}</span>
                  </div>
                )}

                {/* Current Tracked Duration Summary Strip */}
                <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap tabular-nums">
                    <Clock className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                    <span className="text-[var(--text-secondary)]">Recorded:</span>
                    <strong className="text-[var(--text-primary)] font-semibold">
                      {formatBillableDetailed(currentDurationMs)}
                    </strong>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      ({oldFormatted})
                    </span>
                  </div>
                  {task.status === 'in_progress' ? (
                    <span className="rounded-[5px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold shrink-0">
                      Active in progress
                    </span>
                  ) : (
                    <span className="ledger-badge shrink-0">
                      {formatTaskStatus(task.status)}
                    </span>
                  )}
                </div>

                {/* Hours and Minutes Inputs */}
                <div>
                  <label className="field-label" htmlFor="billablehoursmodal-field-1">
                    Correct Total Duration
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="billablehoursmodal-field-1" className="text-xs font-medium text-[var(--text-secondary)]">Hours</label>
                        <span className="text-[11px] text-[var(--text-muted)]">hrs</span>
                      </div>
                      <input
                        ref={hoursInputRef}
                        type="number"
                        min="0"
                        max="999"
                        step="1"
                        value={hours}
                        onChange={e => setHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="field-control text-sm font-semibold tabular-nums"
                        id="billablehoursmodal-field-1"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="billablehoursmodal-minutes" className="text-xs font-medium text-[var(--text-secondary)]">Minutes</label>
                        <span className="text-[11px] text-[var(--text-muted)]">0 – 59 min</span>
                      </div>
                      <input
                        id="billablehoursmodal-minutes"
                        type="number"
                        min="0"
                        max="59"
                        step="1"
                        value={minutes}
                        onChange={e => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                        className="field-control text-sm font-semibold tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Adjustment Presets */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Quick Presets</span>
                    <button
                      type="button"
                      onClick={handleResetToZero}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                      style={{ minHeight: 'auto' }}
                    >
                      <RotateCcw className="h-2.5 w-2.5" />
                      <span>Reset to 0h</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PRESETS.map(preset => (
                      <button
                        key={preset.minutes}
                        type="button"
                        aria-label={`${preset.minutes > 0 ? 'Add' : 'Subtract'} ${preset.label}`}
                        onClick={() => applyPresetMinutes(preset.minutes)}
                        className="inline-flex items-center gap-0.5 rounded-[5px] border border-[var(--border)] bg-[var(--surface-subtle)] hover:bg-[var(--border)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-primary)] transition-colors cursor-pointer"
                        style={{ minHeight: '28px' }}
                      >
                        {preset.minutes > 0 ? (
                          <Plus aria-hidden="true" className="h-2.5 w-2.5 text-[#1d4ed8] dark:text-blue-400" />
                        ) : (
                          <Minus aria-hidden="true" className="h-2.5 w-2.5 text-amber-700 dark:text-amber-400" />
                        )}
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason / Note Input */}
                <div>
                  <label className="field-label" htmlFor="billablehoursmodal-field-2">
                    Reason for Adjustment (Optional)
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {REASON_PRESETS.map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setReason(item)}
                        className={`rounded-[5px] px-2 py-0.5 text-[11px] font-medium border transition-colors cursor-pointer ${
                          reason === item
                            ? 'bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 border-[var(--accent)]'
                            : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)]'
                        }`}
                        style={{ minHeight: '26px' }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g., Client meeting overrun, manual correction"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    maxLength={200}
                    className="field-control"
                    id="billablehoursmodal-field-2"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="dialog-footer">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="button-primary"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? 'Saving...' : 'Apply Correction'}</span>
                </button>
              </div>
            </form>
          </DialogPanel>
      </motion.div>
      )}
    </AnimatePresence>
  );
};
