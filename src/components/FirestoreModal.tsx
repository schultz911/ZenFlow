import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../context/DashboardContext';
import {
  Database,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
} from 'lucide-react';

interface FirestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirestoreModal: React.FC<FirestoreModalProps> = ({ isOpen, onClose }) => {
  const { firestoreStatus, refreshFirestoreStatus, syncWithFirestore, users, tasks } =
    useDashboard();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Close on Escape key
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

  // Refresh status whenever modal opens
  useEffect(() => {
    if (isOpen) {
      refreshFirestoreStatus();
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await syncWithFirestore();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Confirmed: Workspace synchronized with Firestore!',
        });
      } else {
        setFeedback({ type: 'error', message: res.message || 'Sync failed' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Sync verification failed' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    try {
      await refreshFirestoreStatus();
      setFeedback({ type: 'success', message: 'Connection status updated.' });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to refresh status.' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const isConnected = firestoreStatus?.connected;
  const displayProject = firestoreStatus?.projectId || 'zen-flow-7173d';

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="firestore-connection-modal"
        className="w-full max-w-lg max-h-[90vh] my-auto flex flex-col rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#111111] shadow-2xl transition-all text-neutral-900 dark:text-white overflow-hidden"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-white/5 shrink-0 bg-white dark:bg-[#111111]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
                Firestore Sync Status
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40">
                Connection verification for zen-flow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`rounded-xl p-3 text-xs flex items-center gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-500 border border-red-500/20'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
          )}

          {/* Real-time Status Card */}
          <div
            className={`rounded-xl border p-4 transition-all ${
              isConnected
                ? 'border-emerald-500/20 bg-emerald-500/5'
                : 'border-amber-500/20 bg-amber-500/5'
            }`}
          >
            <div className="flex items-center gap-3">
              {isConnected ? (
                <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3
                    className={`text-xs font-semibold ${
                      isConnected
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {isConnected
                      ? 'Firestore Connected & Synchronized'
                      : 'Connecting to Firestore...'}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      isConnected
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                      }`}
                    />
                    {isConnected ? 'Live Sync' : 'Standby'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Connection Metadata */}
          <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#161616] p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-white/40">Firebase Project</span>
              <span className="font-mono font-medium text-neutral-800 dark:text-white/90">
                {displayProject}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-white/40">Storage Collections</span>
              <span className="font-mono text-[11px] font-medium text-neutral-700 dark:text-white/80">
                /users, /tasks
              </span>
            </div>

            <div className="flex items-center justify-between text-xs border-t border-neutral-200/60 dark:border-white/5 pt-2.5">
              <span className="text-neutral-500 dark:text-white/40">Workspace Data</span>
              <span className="font-medium text-neutral-700 dark:text-white/80">
                {users.length} member swimlanes · {tasks.length} tasks
              </span>
            </div>

            {firestoreStatus?.lastSyncTime && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500 dark:text-white/40">Last Synchronized</span>
                <span className="text-neutral-600 dark:text-white/60">
                  {new Date(firestoreStatus.lastSyncTime).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black py-2.5 px-4 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Verifying with Firestore...' : 'Confirm Connection & Sync'}</span>
            </button>

            <button
              onClick={handleRefreshStatus}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800/60 text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 py-2.5 px-4 text-xs font-medium transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={onClose}
              className="flex items-center justify-center rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-white py-2.5 px-4 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
