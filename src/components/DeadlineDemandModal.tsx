import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, X, Check, ArrowRight } from 'lucide-react';
import { Task, TaskStatus } from '../types';

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

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const getPresetDate = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const statusLabels: Record<TaskStatus, string> = {
    pipeline: 'Pipeline',
    retainer: 'Ongoing',
    todo: 'To Do',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
    archived: 'Archived',
  };

  const targetLabel = targetStatus ? (statusLabels[targetStatus] || targetStatus) : '';

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
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4 "
          >
          {/* Close button */}
          <button aria-label="Close dialog"
            onClick={onCancel}
            className="absolute top-4 right-4 rounded-lg p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header Icon & Title */}
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                Deadline Required
              </h3>
            </div>
          </div>

          {/* Task Info Summary */}
          <div className="rounded-xl border border-neutral-200/80 dark:border-white/5 bg-[var(--surface-muted)] p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-900 dark:text-white line-clamp-1">
                {task.title}
              </span>
              <span className="capitalize px-1.5 py-0.5 rounded text-[11px] font-medium bg-neutral-200 dark:bg-white/10 text-neutral-600 dark:text-white/60 shrink-0 ml-2">
                {task.cognitiveLoad} load
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span>Moving to</span>
              <ArrowRight className="h-3 w-3 text-neutral-400" />
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {targetLabel}
              </span>
              {targetUserName && (
                <span>({targetUserName})</span>
              )}
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-2">
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
                    className={`rounded-xl border p-2 text-center text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'border-[var(--border)] bg-white dark:bg-[#181818] text-neutral-700 dark:text-white/70 hover:bg-neutral-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="font-semibold">{preset.label}</div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      +{preset.days}d
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Date Input */}
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1" htmlFor="deadlinedemandmodal-field-1">
              Or pick specific date:
            </label>
            <input
              type="date"
              min={todayStr}
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] py-2 px-3 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none transition-colors cursor-pointer" id="deadlinedemandmodal-field-1"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-100 dark:border-white/5">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-xs font-medium text-neutral-600 dark:text-white/60 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedDate}
              onClick={() => handleApply(selectedDate)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-xs font-semibold text-white shadow-xs transition-all cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Set Deadline & Move</span>
            </button>
          </div>
        </DialogPanel>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
