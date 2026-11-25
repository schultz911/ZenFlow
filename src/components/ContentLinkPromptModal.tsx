import React, { useState, useEffect } from 'react';
import { Task } from '../types';
import { X, Link2, Send, AlertCircle } from 'lucide-react';

interface ContentLinkPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  hasSiblingDesignTask?: boolean;
  onConfirm: (contentDocLink: string) => void;
}

export const ContentLinkPromptModal: React.FC<ContentLinkPromptModalProps> = ({
  isOpen,
  onClose,
  task,
  hasSiblingDesignTask,
  onConfirm,
}) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !task) {
      setError('');
      return;
    }
    setUrl(task.contentDocLink || '');
    setError('');
  }, [isOpen, task]);

  if (!isOpen || !task) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError('A content document link is required before marking this task as Sent.');
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setError('Please enter a valid http:// or https:// URL.');
        return;
      }
    } catch {
      setError('Please enter a valid URL (for example, https://docs.google.com/...).');
      return;
    }
    onConfirm(trimmed);
  };

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
              Attach Content Document Link
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
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
            Provide the link to the completed content document before moving this deliverable to <span className="font-semibold">Sent</span>.
            {hasSiblingDesignTask && (
              <span className="block mt-1 text-emerald-600 dark:text-emerald-400 font-medium">
                This link will automatically be attached to the linked Design task as well.
              </span>
            )}
          </p>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              <Link2 className="h-3.5 w-3.5 text-neutral-400" />
              Content Document URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError('');
              }}
              placeholder="https://docs.google.com/document/d/..."
              autoFocus
              className="w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20"
            />
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Save Link & Mark Sent</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
