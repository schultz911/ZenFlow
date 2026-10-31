import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { HoldToPurgeButton } from './HoldToPurgeButton';
import { DialogPanel } from './ui/DialogPanel';

interface SuperadminPurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SuperadminPurgeModal: React.FC<SuperadminPurgeModalProps> = ({ isOpen, onClose }) => {
  const { isSuperadmin, users, tasks, purgeAllDatabaseData } = useDashboard();
  const [isPurging, setIsPurging] = useState(false);
  const submittingRef = useRef(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof purgeAllDatabaseData>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (submittingRef.current) return;
    setResult(null);
    setError(null);
    onClose();
  };

  const execute = async () => {
    if (!isOpen) throw new Error('Purge canceled.');
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsPurging(true);
    setError(null);
    try {
      const response = await purgeAllDatabaseData();
      if (!response.success) throw new Error(response.message || 'Database purge failed.');
      setResult(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Database purge failed. Please try again.');
      throw cause;
    } finally {
      submittingRef.current = false;
      setIsPurging(false);
    }
  };

  if (!isSuperadmin || typeof document === 'undefined') return null;
  const accountCount = users.filter(user => user.email.toLowerCase() !== 'kiran.s@zensciences.com').length;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="dialog-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={event => {
          if (event.target === event.currentTarget) close();
        }}>
          <DialogPanel
            aria-labelledby="purge-title"
            aria-describedby="purge-description"
            onClose={close}
            busy={isPurging}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            className="w-full max-w-md overflow-y-auto p-5 sm:p-6"
          >
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 id="purge-title" className="text-base font-semibold tracking-tight">Purge Database</h2>
              <button type="button" className="icon-button" aria-label="Close purge confirmation" disabled={isPurging} onClick={close}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {result ? (
              <div role="status" className="space-y-4">
                <p id="purge-description" className="text-sm text-emerald-700 dark:text-emerald-300">Database purged successfully.</p>
                <p className="text-sm text-[var(--text-secondary)]">{result.deletedTaskCount ?? 0} tasks and {result.deletedUserCount ?? 0} accounts removed. The root superadmin account is preserved.</p>
                <button type="button" className="button-secondary w-full" autoFocus onClick={close}>Done</button>
              </div>
            ) : (
              <>
                <p id="purge-description" className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  Permanently delete all workspace tasks and team accounts. This action cannot be undone.
                </p>
                <dl className="my-4 divide-y divide-[var(--border)] text-sm">
                  <div className="flex items-center justify-between py-2.5"><dt className="text-[var(--text-secondary)]">Tasks to delete</dt><dd className="font-medium tabular-nums">{tasks.length}</dd></div>
                  <div className="flex items-center justify-between py-2.5"><dt className="text-[var(--text-secondary)]">Accounts to remove</dt><dd className="font-medium tabular-nums">{accountCount}</dd></div>
                  <div className="py-2.5"><dt className="text-[var(--text-secondary)]">Protected account</dt><dd className="mt-1 break-all">kiran.s@zensciences.com</dd></div>
                </dl>
                {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
                <HoldToPurgeButton onPurgeConfirm={execute} isLoading={isPurging} />
                <button type="button" className="button-secondary mt-3 w-full" disabled={isPurging} onClick={close}>Cancel</button>
              </>
            )}
          </DialogPanel>
        </div>
      )}
    </AnimatePresence>, document.body,
  );
};
