import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useAuth, useWorkspace } from '../context/DashboardContext';
import { getSuperadminEmail } from '../domain/permissions';
import { HoldToPurgeButton } from './HoldToPurgeButton';
import { DialogPanel } from './ui/DialogPanel';

interface SuperadminPurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SuperadminPurgeModal: React.FC<SuperadminPurgeModalProps> = ({ isOpen, onClose }) => {
  const { isSuperadmin } = useAuth();
  const { users, tasks, purgeAllDatabaseData } = useWorkspace();
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
  const superEmail = getSuperadminEmail();
  const accountCount = users.filter(user => user.email.trim().toLowerCase() !== superEmail).length;

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
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            className="w-full max-w-md overflow-hidden"
          >
            <div className="dialog-header">
              <h2 id="purge-title" className="text-sm font-bold tracking-tight text-[var(--text-primary)]">Purge Database</h2>
              <button type="button" className="icon-button" aria-label="Close purge confirmation" disabled={isPurging} onClick={close}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              {result ? (
                <div role="status" className="space-y-4">
                  <p id="purge-description" className="callout callout-success font-medium">Database purged successfully.</p>
                  <p className="text-xs text-[var(--text-secondary)] tabular-nums">{result.deletedTaskCount ?? 0} tasks and {result.deletedUserCount ?? 0} accounts removed. The root superadmin account is preserved.</p>
                  <button type="button" className="button-secondary w-full" autoFocus onClick={close}>Done</button>
                </div>
              ) : (
                <>
                  <p id="purge-description" className="text-xs leading-relaxed text-[var(--text-secondary)]">
                    Permanently delete all workspace tasks and team accounts. This action cannot be undone.
                  </p>
                  <dl className="my-4 rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] divide-y divide-[var(--border-subtle)] text-xs">
                    <div className="flex items-center justify-between px-3 py-2.5"><dt className="text-[var(--text-secondary)]">Tasks to delete</dt><dd className="font-semibold tabular-nums text-[var(--text-primary)]">{tasks.length}</dd></div>
                    <div className="flex items-center justify-between px-3 py-2.5"><dt className="text-[var(--text-secondary)]">Accounts to remove</dt><dd className="font-semibold tabular-nums text-[var(--text-primary)]">{accountCount}</dd></div>
                    <div className="px-3 py-2.5"><dt className="text-[var(--text-secondary)]">Protected account</dt><dd className="mt-1 font-mono text-[11px] text-[var(--text-primary)] break-all">{superEmail}</dd></div>
                  </dl>
                  {error && <p role="alert" className="callout callout-danger mb-3">{error}</p>}
                  <HoldToPurgeButton onPurgeConfirm={execute} isLoading={isPurging} />
                  <button type="button" className="button-secondary mt-3 w-full" disabled={isPurging} onClick={close}>Cancel</button>
                </>
              )}
            </div>
          </DialogPanel>
        </div>
      )}
    </AnimatePresence>, document.body,
  );
};
