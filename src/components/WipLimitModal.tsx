import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X, CheckCircle2, ArrowLeft, Layers } from 'lucide-react';
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
  return (
    <AnimatePresence>
      {isOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-md rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 shadow-2xl z-10 space-y-4"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-lg p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                In-Progress Limit Reached
              </h3>
              <p className="text-xs text-neutral-500 dark:text-white/50 mt-0.5">
                Maximum 2 concurrent active tasks
              </p>
            </div>
          </div>

          {/* Main instruction banner */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
            Only <strong>two tasks</strong> can be in progress at any given time. Please complete one of the active tasks or move an in-progress task to <strong>To Do</strong> to start working on a new one.
          </div>

          {/* Active Tasks In Progress list */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-2">
              Currently in progress ({inProgressTasks.length}/2):
            </div>
            <div className="space-y-2">
              {inProgressTasks.map(t => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#181818] p-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-neutral-900 dark:text-white truncate">
                      {t.title}
                    </div>
                    <div className="text-[10px] text-neutral-400 dark:text-white/40 capitalize">
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
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-neutral-600 dark:text-white/60 bg-neutral-200/80 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 transition-colors cursor-pointer"
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
                        title="Mark as Done"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-green-700 dark:text-green-300 bg-green-500/15 hover:bg-green-500/25 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Done</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center justify-end pt-2 border-t border-neutral-100 dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/20 transition-all cursor-pointer"
            >
              Understood
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
  );
};
