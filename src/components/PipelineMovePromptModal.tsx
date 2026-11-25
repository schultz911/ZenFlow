import React, { useState, useEffect } from 'react';
import { Task, CognitiveLoad, User } from '../types';
import { X, Calendar, Clock, Brain, ArrowRight, AlertCircle } from 'lucide-react';
import { getCognitiveLoadLabel } from '../utils/workload';

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

  if (!isOpen || !task || !targetUser) return null;

  const startDate = task.startDate || todayDate;

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              Assign Pipeline Task
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate max-w-[320px]">
              {task.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] px-3.5 py-2.5 flex items-center justify-between text-xs">
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Assignee: </span>
              <span className="font-semibold text-neutral-900 dark:text-white">{targetUser.name}</span>
              <span className="ml-1.5 uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-200/70 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                {targetUser.role}
              </span>
            </div>
            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <Calendar className="h-3.5 w-3.5" />
              <span>Start: {startDate}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                <Clock className="h-3.5 w-3.5 text-neutral-400" />
                Estimated Time (hrs) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={estimatedHours}
                onChange={(e) => {
                  setEstimatedHours(e.target.value);
                  setError('');
                }}
                autoFocus
                className="w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                Deadline <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setError('');
                }}
                className="w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              <Brain className="h-3.5 w-3.5 text-neutral-400" />
              Cognitive Load <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {cognitiveOptions.map((level) => {
                const active = cognitiveLoad === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setCognitiveLoad(level)}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                      active
                        ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm'
                        : 'border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="block capitalize font-semibold">{level}</span>
                    <span className={`block text-[10px] mt-0.5 truncate ${active ? 'opacity-80' : 'text-neutral-400'}`}>
                      {getCognitiveLoadLabel(level, targetUser.role)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
            >
              <span>Assign & Start</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
