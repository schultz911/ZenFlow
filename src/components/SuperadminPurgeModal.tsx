import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { HoldToPurgeButton } from './HoldToPurgeButton';
import {
  AlertOctagon,
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={e => {
            if (e.target === e.currentTarget && !isPurging) handleModalClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-xl rounded-2xl bg-neutral-950 border border-red-900/60 shadow-2xl overflow-hidden text-neutral-100 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-red-900/40 bg-gradient-to-r from-red-950/60 to-neutral-950">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 text-red-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-white flex items-center gap-2">
                    Superadmin Database Purge
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-red-950 border border-red-600/60 text-red-400 font-bold tracking-wider">
                      Exclusive
                    </span>
                  </h3>
                  <p className="text-xs text-red-300/80">
                    Irreversible wipe of workspace data across local storage and Cloud Firestore
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isPurging}
                className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {purgeResult ? (
                /* Success View */
                <div className="space-y-4 py-3">
                  <div className="flex flex-col items-center justify-center text-center p-6 rounded-xl bg-emerald-950/30 border border-emerald-800/50">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-600/20 text-emerald-400 mb-3">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <h4 className="text-base font-semibold text-emerald-300">Database Purged Cleanly</h4>
                    <p className="text-xs text-emerald-200/80 mt-1 max-w-sm">
                      {purgeResult.message}
                    </p>
                    <div className="grid grid-cols-2 gap-3 w-full mt-4 max-w-xs text-xs font-mono">
                      <div className="p-2.5 rounded-lg bg-neutral-900 border border-emerald-900/50 text-neutral-300">
                        <div className="text-emerald-400 font-bold text-sm">{purgeResult.deletedTaskCount ?? 0}</div>
                        <div className="text-[10px] text-neutral-400">Tasks Deleted</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-neutral-900 border border-emerald-900/50 text-neutral-300">
                        <div className="text-emerald-400 font-bold text-sm">{purgeResult.deletedUserCount ?? 0}</div>
                        <div className="text-[10px] text-neutral-400">Accounts Removed</div>
                      </div>
                    </div>
                    <div className="mt-4 text-[11px] text-neutral-400">
                      Root account <span className="text-emerald-400 font-mono font-medium">kiran.s@zensciences.com</span> is active and retained.
                    </div>
                  </div>
                </div>
              ) : (
                /* Warning & Purge Controls */
                <>
                  {/* Warning Notice Box */}
                  <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-red-400 font-semibold text-xs tracking-wide uppercase">
                      <AlertOctagon className="h-4 w-4" />
                      <span>Destructive Action Warning</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Executing this operation will permanently purge all deliverables, tasks, and team member accounts from the database. Only your root superadmin account (<span className="text-white font-mono font-semibold">kiran.s@zensciences.com</span>) will be retained.
                    </p>
                  </div>

                  {/* Impact Summary Cards */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 text-red-400">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-white font-mono">{tasks.length}</div>
                        <div className="text-[11px] text-neutral-400">Tasks to be wiped</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400">
                        <Users className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-white font-mono">{otherUsersCount}</div>
                        <div className="text-[11px] text-neutral-400">Accounts to be removed</div>
                      </div>
                    </div>
                  </div>

                  {/* Error Notification */}
                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/80 text-xs text-red-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Hold-to-Purge Section */}
                  <div className="pt-2 space-y-2">
                    <div className="text-[11px] text-neutral-400 flex items-center justify-between px-1">
                      <span>Safety Lock: 5-Second Continuous Press</span>
                      <span className="text-neutral-500 font-mono">5000ms</span>
                    </div>
                    <HoldToPurgeButton
                      onPurgeConfirm={handleExecutePurge}
                      isLoading={isPurging}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-neutral-800/80 bg-neutral-900/60 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                SOC2 Non-Repudiation Audit Logged
              </span>
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isPurging}
                className="rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 py-1.5 px-4 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
              >
                {purgeResult ? 'Done' : 'Cancel'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

