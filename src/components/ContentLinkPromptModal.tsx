import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Task } from '../types';
import { X, Link2, Send, AlertCircle } from 'lucide-react';
import { DialogPanel } from './ui/DialogPanel';

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
    <AnimatePresence>
      {isOpen && task && (
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
            aria-label="Attach content document link"
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
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                  <Link2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                    Attach Content Document Link
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    {task.title}
                  </p>
                </div>
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
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Provide the link to the completed content document before moving this deliverable to{' '}
                  <span className="font-semibold text-[var(--text-primary)]">Sent</span>.
                  {hasSiblingDesignTask && (
                    <span className="block mt-1 text-emerald-700 dark:text-emerald-400 font-medium">
                      This link will automatically be attached to the linked Design task as well.
                    </span>
                  )}
                </p>

                <div>
                  <label className="field-label flex items-center gap-1.5" htmlFor="content-doc-url-input">
                    <Link2 className="h-3 w-3 text-[var(--text-muted)]" />
                    <span>
                      Content Document URL <span className="text-red-600 dark:text-red-400">*</span>
                    </span>
                  </label>
                  <input
                    id="content-doc-url-input"
                    type="url"
                    value={url}
                    onChange={e => {
                      setUrl(e.target.value);
                      setError('');
                    }}
                    placeholder="https://docs.google.com/document/d/..."
                    autoFocus
                    className="field-control"
                  />
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
                <button type="submit" className="button-emerald">
                  <Send className="h-3.5 w-3.5" />
                  <span>Save Link &amp; Mark Sent</span>
                </button>
              </div>
            </form>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
