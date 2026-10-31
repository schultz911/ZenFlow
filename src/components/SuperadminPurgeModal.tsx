import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { HoldToPurgeButton } from './HoldToPurgeButton';
import {
  ShieldAlert,
  X,
  Database,
  Users,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface SuperadminPurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SuperadminPurgeModal: React.FC<SuperadminPurgeModalProps> = ({ isOpen, onClose }) => {
  const {
    isSuperadmin,
    users,
    tasks,
    purgeAllDatabaseData,
  } = useDashboard();

  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    success: boolean;
    message: string;
    deletedTaskCount?: number;
    deletedUserCount?: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Strictly enforce superadmin exclusivity at modal level
  if (!isSuperadmin) {
    return null;
  }

  const otherUsersCount = users.filter(
    u => u.email.toLowerCase() !== 'kiran.s@zensciences.com'
  ).length;

  const handleExecutePurge = async () => {
    setIsPurging(true);
    setErrorMessage(null);
    try {
      const result = await purgeAllDatabaseData();
      setPurgeResult(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Database purge operation failed.');
      throw err;
    } finally {
      setIsPurging(false);
    }
  };

  const handleModalClose = () => {
    if (isPurging) return; // Prevent closing while in progress
    setPurgeResult(null);
    setErrorMessage(null);
    onClose();
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
          onClick={e => {
            if (e.target === e.currentTarget && !isPurging) handleModalClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-2xl overflow-hidden text-neutral-900 dark:text-white flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 px-6 py-4 bg-neutral-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base text-neutral-900 dark:text-white">
                    Purge Database
                  </h3>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 font-bold tracking-wider">
                    Superadmin
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isPurging}
                className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {purgeResult ? (
                /* Success View */
                <div className="py-4 text-center space-y-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h4 className="text-base font-semibold text-neutral-900 dark:text-white">
                    Database Purged Cleanly
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-white/60 max-w-sm mx-auto">
                    {purgeResult.message}
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto text-xs font-mono pt-2">
                    <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02]">
                      <div className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                        {purgeResult.deletedTaskCount ?? 0}
                      </div>
                      <div className="text-[10px] text-neutral-500 dark:text-white/40">Tasks Deleted</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02]">
                      <div className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                        {purgeResult.deletedUserCount ?? 0}
                      </div>
                      <div className="text-[10px] text-neutral-500 dark:text-white/40">Accounts Removed</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Warning & Purge Controls */
                <>
                  {/* Warning Notice Box */}
                  <div className="rounded-xl border border-red-500/20 bg-red-50/50 dark:bg-red-950/20 p-3.5 text-xs text-red-700 dark:text-red-300 leading-relaxed flex items-center gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                    <span>
                      Permanently deletes all tasks and member accounts. Root superadmin (<strong className="font-mono text-red-800 dark:text-red-200">kiran.s@zensciences.com</strong>) is retained.
                    </span>
                  </div>

                  {/* Impact Summary Cards */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02] flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-neutral-900 dark:text-white font-mono">{tasks.length}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-white/40">Tasks to wipe</div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02] flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Users className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-neutral-900 dark:text-white font-mono">{otherUsersCount}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-white/40">Accounts to remove</div>
                      </div>
                    </div>
                  </div>

                  {/* Error Notification */}
                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800/80 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Hold-to-Purge Section */}
                  <div className="pt-2">
                    <HoldToPurgeButton
                      onPurgeConfirm={handleExecutePurge}
                      isLoading={isPurging}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#141414] flex items-center justify-end">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isPurging}
                className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200 py-1.5 px-4 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
              >
                {purgeResult ? 'Done' : 'Cancel'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
