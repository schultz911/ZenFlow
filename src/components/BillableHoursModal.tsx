import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, X, Clock, Plus, Minus, RotateCcw, Check } from 'lucide-react';
import { Task, User } from '../types';
import { getTaskBillableMs, formatBillableHours, formatBillableDetailed } from '../utils/workload';

interface BillableHoursModalProps {
  isOpen: boolean;
  task: Task | null;
  currentUser?: User | null;
  onClose: () => void;
  onSave: (taskId: string, newDurationMs: number, reason?: string) => Promise<void>;
}

const QUICK_PRESETS = [
  { label: '+15m', minutes: 15 },
  { label: '+30m', minutes: 30 },
  { label: '+1h', minutes: 60 },
  { label: '+2h', minutes: 120 },
  { label: '-15m', minutes: -15 },
  { label: '-30m', minutes: -30 },
];

const REASON_PRESETS = [
  'Manual correction',
  'Client briefing',
  'Review session',
  'Timer overrun',
  'Off-board research',
];

export const BillableHoursModal: React.FC<BillableHoursModalProps> = ({
  isOpen,
  task,
  currentUser,
  onClose,
  onSave,
}) => {
  const [hours, setHours] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const hoursInputRef = useRef<HTMLInputElement>(null);

  // Derive initial values when task changes or modal opens
  useEffect(() => {
    if (isOpen && task) {
      const currentMs = getTaskBillableMs(task);
      const totalMinutes = Math.round(currentMs / 60000);
      setHours(Math.floor(totalMinutes / 60));
      setMinutes(totalMinutes % 60);
      setReason('');
      setIsSubmitting(false);

      // Focus input on mount
      setTimeout(() => {
        hoursInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, task]);

  // Keyboard shortcut listener (Esc to close)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

    setIsSubmitting(true);
    try {
      await onSave(task.id, newDurationMs, reason.trim() || undefined);
      onClose();
    } catch (err) {
      console.error('Failed to adjust billable hours:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && task && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => {
              if (e.target === e.currentTarget && !isSubmitting) onClose();
            }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 shadow-2xl z-10 space-y-5 text-neutral-900 dark:text-white"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="absolute top-4 right-4 rounded-lg p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400">
              <Timer className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                Adjust Billable Hours
              </h3>
              <p className="text-xs text-neutral-500 dark:text-white/50 truncate mt-0.5" title={task.title}>
                {task.title}
              </p>
            </div>
          </div>

          {/* Current Tracked Duration Info Card */}
          <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#181818] p-3.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-neutral-400 dark:text-white/40" />
              <span className="text-neutral-500 dark:text-white/50 font-medium">Currently Recorded:</span>
              <strong className="text-neutral-900 dark:text-white font-semibold">
                {formatBillableDetailed(currentDurationMs)}
              </strong>
              <span className="text-[11px] text-neutral-400 dark:text-white/40">
                ({oldFormatted})
              </span>
            </div>
            {task.status === 'in_progress' ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 text-[10px] font-semibold animate-pulse">
                Active in progress
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-neutral-200/60 dark:bg-white/10 text-neutral-600 dark:text-white/60 px-2 py-0.5 text-[10px] font-medium capitalize">
                {task.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Hours and Minutes Inputs */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/40 mb-2">
                Correct Total Duration
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-neutral-600 dark:text-white/70">Hours</span>
                    <span className="text-[11px] text-neutral-400">hrs</span>
                  </div>
                  <input
                    ref={hoursInputRef}
                    type="number"
                    min="0"
                    max="999"
                    step="1"
                    value={hours}
                    onChange={e => setHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#161616] px-3.5 py-2 text-sm font-semibold text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-neutral-600 dark:text-white/70">Minutes</span>
                    <span className="text-[11px] text-neutral-400">0 - 59 min</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    value={minutes}
                    onChange={e => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                    className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#161616] px-3.5 py-2 text-sm font-semibold text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Quick Adjustment Presets */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-neutral-500 dark:text-white/40">Quick Presets:</span>
                <button
                  type="button"
                  onClick={handleResetToZero}
                  className="inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-red-500 dark:text-white/40 dark:hover:text-red-400 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  <span>Reset to 0h</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPresetMinutes(preset.minutes)}
                    className="inline-flex items-center gap-0.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-white/80 hover:bg-neutral-200 dark:hover:bg-white/10 hover:border-neutral-300 transition-colors cursor-pointer"
                  >
                    {preset.minutes > 0 ? (
                      <Plus className="h-2.5 w-2.5 text-blue-500" />
                    ) : (
                      <Minus className="h-2.5 w-2.5 text-amber-500" />
                    )}
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reason / Note Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/40 mb-1.5">
                Reason for Adjustment (Optional)
              </label>
              <div className="flex flex-wrap gap-1 mb-2">
                {REASON_PRESETS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setReason(item)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer ${
                      reason === item
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-500/40'
                        : 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-white/60 border-neutral-200 dark:border-white/5 hover:border-neutral-300'
                    }`}
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
                className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#161616] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100 dark:border-white/5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#141414] px-4 py-2 text-xs font-medium text-neutral-600 dark:text-white/50 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-md shadow-blue-900/20 disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isSubmitting ? 'Saving...' : 'Apply Correction'}</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
};
