import { DialogPanel } from './ui/DialogPanel';
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ArrowLeft, Layers } from 'lucide-react';
import { Task, User } from '../types';

interface WipLimitModalProps {
  isOpen: boolean;
  user: User | null;
  inProgressTasks: Task[];
  onClose: () => void;
  onMoveToDone?: (taskId: string) => void;
  onMoveToTodo?: (taskId: string) => void;
}

export const WipLimitModal: React.FC<WipLimitModalProps> = ({
  isOpen,
  user,
  inProgressTasks,
  onClose,
  onMoveToDone,
  onMoveToTodo,
}) => {
  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && user && (
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
          <DialogPanel aria-label="Work in progress limit" onClose={onClose} busy={false}
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
                  <Layers className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  In-Progress Limit Reached
                </h3>
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

            <div className="p-5 space-y-4">
              {/* Main instruction banner */}
              <div className="callout callout-warning leading-relaxed">
                Only <strong>two tasks</strong> can be in progress at any given time. Complete an active task or move one back to <strong>To Do</strong> to start a new one.
              </div>

              {/* Active Tasks In Progress list */}
              <div>
                <div className="field-label tabular-nums">
                  Currently in progress ({inProgressTasks.length}/2)
                </div>
                <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border-subtle)] overflow-hidden">
                  {inProgressTasks.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--text-primary)] truncate">
                          {t.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] capitalize tabular-nums">
                          {t.cognitiveLoad} load · {t.dueDate ? `Due ${t.dueDate}` : 'No deadline'}
                        </div>
                      </div>

                      {/* Quick triage actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {onMoveToTodo && (
                          <button
                            type="button"
                            onClick={() => {
                              onMoveToTodo(t.id);
                              onClose();
                            }}
                            title="Move back to To Do"
                            className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--border)] bg-[var(--surface-subtle)] hover:bg-[var(--border)] px-2 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                            style={{ minHeight: '28px' }}
                          >
                            <ArrowLeft className="h-3 w-3" />
                            <span>To Do</span>
                          </button>
                        )}
                        {onMoveToDone && (
                          <button
                            type="button"
                            onClick={() => {
                              onMoveToDone(t.id);
                              onClose();
                            }}
                            title="Mark as Sent"
                            className="inline-flex items-center gap-1 rounded-[5px] bg-emerald-600/12 border border-emerald-600/25 hover:bg-emerald-600/20 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 transition-colors cursor-pointer"
                            style={{ minHeight: '28px' }}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Sent</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="dialog-footer">
              <button
                type="button"
                onClick={onClose}
                className="button-primary"
              >
                Understood
              </button>
            </div>
          </DialogPanel>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
