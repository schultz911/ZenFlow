import { DialogPanel } from './ui/DialogPanel';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, X, Check, ArrowRight } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { formatLocalDateKey, formatTaskStatus, getLocalOffsetDateKey } from '../utils/workload';

interface DeadlineDemandModalProps {
  isOpen: boolean;
  task: Task | null;
  targetStatus: TaskStatus | null;
  targetUserName?: string;
  onConfirm: (taskId: string, dueDate: string) => void;
  onCancel: () => void;
}

export const DeadlineDemandModal: React.FC<DeadlineDemandModalProps> = ({
  isOpen,
  task,
  targetStatus,
  targetUserName,
  onConfirm,
  onCancel,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('');

  const todayStr = formatLocalDateKey();

  const getPresetDate = (daysAhead: number) => getLocalOffsetDateKey(daysAhead);

  const targetLabel = targetStatus ? formatTaskStatus(targetStatus) : '';

  const handleApply = (date: string) => {
    if (!date || !task) return;
    onConfirm(task.id, date);
  };

  return (
    <AnimatePresence>
      {isOpen && task && targetStatus && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget) onCancel();
          }}
        >
          <DialogPanel aria-label="Deadline required" onClose={onCancel} busy={false}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md my-auto overflow-hidden"
          >
            {/* Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-amber-600/10 border border-amber-600/25 text-amber-700 dark:text-amber-400">
                  <Calendar className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  Deadline Required
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={onCancel}
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Task Info Summary */}
              <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--text-primary)] truncate">
                    {task.title}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold capitalize text-[var(--text-secondary)] shrink-0">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        task.cognitiveLoad === 'high'
                          ? 'bg-red-600 dark:bg-red-400'
                          : task.cognitiveLoad === 'medium'
                          ? 'bg-amber-600 dark:bg-amber-400'
                          : 'bg-emerald-600 dark:bg-emerald-400'
                      }`}
                    />
                    {task.cognitiveLoad} load
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <span>Moving to</span>
                  <ArrowRight className="h-3 w-3 text-[var(--text-muted)]" />
                  <span className="font-semibold text-[#1d4ed8] dark:text-blue-400">
                    {targetLabel}
                  </span>
                  {targetUserName && (
                    <span>({targetUserName})</span>
                  )}
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label className="field-label">
                  Select Due Date
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Today', days: 0 },
                    { label: 'Tomorrow', days: 1 },
                    { label: 'In 3 Days', days: 3 },
                    { label: 'Next Week', days: 7 },
                  ].map(preset => {
                    const pDate = getPresetDate(preset.days);
                    const isSelected = selectedDate === pDate;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setSelectedDate(pDate)}
                        className={`rounded-[7px] border px-2 py-2 text-center text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300'
                            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]'
                        }`}
                      >
                        <div className="font-semibold">{preset.label}</div>
                        <div className="text-[11px] tabular-nums text-[var(--text-secondary)] mt-0.5">
                          +{preset.days}d
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Input */}
              <div>
                <label className="field-label" htmlFor="deadlinedemandmodal-field-1">
                  Or Pick Specific Date
                </label>
                <input
                  type="date"
                  min={todayStr}
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="field-control tabular-nums cursor-pointer"
                  id="deadlinedemandmodal-field-1"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="dialog-footer">
              <button
                type="button"
                onClick={onCancel}
                className="button-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedDate}
                onClick={() => handleApply(selectedDate)}
                className="button-primary"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Set Deadline &amp; Move</span>
              </button>
            </div>
          </DialogPanel>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
