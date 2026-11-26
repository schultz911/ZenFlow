import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Task, CognitiveLoad, User } from '../types';
import { X, Calendar, Clock, Brain, ArrowRight, AlertCircle } from 'lucide-react';
import { getCognitiveLoadLabel } from '../utils/workload';
import { DialogPanel } from './ui/DialogPanel';

interface PipelineMovePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  targetUser: User | null;
  onConfirm: (data: {
    startDate: string;
    estimatedHours: number;
    cognitiveLoad: CognitiveLoad;
    dueDate?: string;
  }) => void;
}

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const PipelineMovePromptModal: React.FC<PipelineMovePromptModalProps> = ({
  isOpen,
  onClose,
  task,
  targetUser,
  onConfirm,
}) => {
  const [estimatedHours, setEstimatedHours] = useState<string>('2');
  const [cognitiveLoad, setCognitiveLoad] = useState<CognitiveLoad>('medium');
  const [dueDate, setDueDate] = useState<string>('');
  const [error, setError] = useState<string>('');

  const todayDate = getTodayIsoDate();

  useEffect(() => {
    if (!isOpen || !task) {
      setError('');
      return;
    }
    setEstimatedHours(
      task.estimatedHours !== undefined && task.estimatedHours > 0
        ? String(task.estimatedHours)
        : '2'
    );
    setCognitiveLoad(task.cognitiveLoad || 'medium');
    setDueDate(task.dueDate || '');
    setError('');
  }, [isOpen, task]);

  const startDate = task?.startDate || todayDate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedHours = Number(estimatedHours);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError('Estimated time must be greater than 0 hours.');
      return;
    }
    if (!dueDate) {
      setError('A deadline is required to schedule this task on a member board.');
      return;
    }
    onConfirm({
      startDate,
      estimatedHours: parsedHours,
      cognitiveLoad,
      dueDate,
    });
  };

  const cognitiveOptions: CognitiveLoad[] = ['low', 'medium', 'high'];

  return (
    <AnimatePresence>
      {isOpen && task && targetUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <DialogPanel
            aria-label="Assign pipeline task"
            onClose={onClose}
            busy={false}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md my-auto overflow-hidden"
          >
            <div className="dialog-header">
              <div className="min-w-0">
                <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  Assign Pipeline Task
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                  {task.title}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={onClose}
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-5 space-y-4">
                <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[var(--text-secondary)] shrink-0">Assignee:</span>
                    <span className="font-semibold text-[var(--text-primary)] truncate">{targetUser.name}</span>
                    {targetUser.role && (
                      <span className="ledger-badge uppercase shrink-0">
                        {targetUser.role}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold text-[11px] tabular-nums shrink-0">
                    <Calendar className="h-3 w-3" />
                    <span>Start {startDate}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label flex items-center gap-1.5" htmlFor="pipeline-move-hours">
                      <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                      <span>
                        Estimated Time (hrs) <span className="text-red-600 dark:text-red-400">*</span>
                      </span>
                    </label>
                    <input
                      id="pipeline-move-hours"
                      type="number"
                      min="0.25"
                      step="0.25"
                      value={estimatedHours}
                      onChange={e => {
                        setEstimatedHours(e.target.value);
                        setError('');
                      }}
                      autoFocus
                      className="field-control tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="field-label flex items-center gap-1.5" htmlFor="pipeline-move-deadline">
                      <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
                      <span>
                        Deadline <span className="text-red-600 dark:text-red-400">*</span>
                      </span>
                    </label>
                    <input
                      id="pipeline-move-deadline"
                      type="date"
                      value={dueDate}
                      onChange={e => {
                        setDueDate(e.target.value);
                        setError('');
                      }}
                      className="field-control tabular-nums cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label flex items-center gap-1.5">
                    <Brain className="h-3 w-3 text-[var(--text-muted)]" />
                    <span>
                      Cognitive Load <span className="text-red-600 dark:text-red-400">*</span>
                    </span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {cognitiveOptions.map(level => {
                      const active = cognitiveLoad === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setCognitiveLoad(level)}
                          className={`rounded-[7px] border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-xs capitalize font-semibold">
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                level === 'high'
                                  ? 'bg-red-600 dark:bg-red-400'
                                  : level === 'medium'
                                  ? 'bg-amber-600 dark:bg-amber-400'
                                  : 'bg-emerald-600 dark:bg-emerald-400'
                              }`}
                            />
                            <span>{level}</span>
                          </span>
                          <span className="block text-[10.5px] mt-0.5 truncate text-[var(--text-secondary)]">
                            {getCognitiveLoadLabel(level, targetUser.role)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <div role="alert" className="callout callout-danger flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="dialog-footer">
                <button type="button" onClick={onClose} className="button-secondary">
                  Cancel
                </button>
                <button type="submit" className="button-primary">
                  <span>Assign &amp; Start</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
