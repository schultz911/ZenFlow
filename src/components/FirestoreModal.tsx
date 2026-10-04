import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '../context/DashboardContext';
import {
  Database,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  Key,
  ExternalLink,
  Unlink,
  CheckCircle,
  Loader2,
  Layers,
} from 'lucide-react';

interface FirestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirestoreModal: React.FC<FirestoreModalProps> = ({ isOpen, onClose }) => {
  const {
    firestoreStatus,
    refreshFirestoreStatus,
    syncWithFirestore,
    users,
    tasks,
    isClickupConnected,
    clickupApiKey,
    connectClickup,
    disconnectClickup,
    clickupSpaces,
  } = useDashboard();

  // Firestore sync states
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ClickUp connection states
  const [apiKeyInput, setApiKeyInput] = useState(clickupApiKey || '');
  const [isClickupLoading, setIsClickupLoading] = useState(false);
  const [clickupError, setClickupError] = useState<string | null>(null);
  const [clickupSuccess, setClickupSuccess] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isClickupLoading && !isSyncing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isClickupLoading, isSyncing]);

  // Refresh status and sync state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      refreshFirestoreStatus();
      setFeedback(null);
      setApiKeyInput(clickupApiKey || '');
      setClickupError(null);
      setClickupSuccess(null);
    }
  }, [isOpen, clickupApiKey, refreshFirestoreStatus]);

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

  const handleConnectClickUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setClickupError(null);
    setClickupSuccess(null);

    const key = apiKeyInput.trim();
    if (!key) {
      setClickupError('Please provide a ClickUp Personal API token (starts with pk_).');
      return;
    }

    setIsClickupLoading(true);
    try {
      const res = await connectClickup(key);
      if (res.success) {
        setClickupSuccess('Successfully connected to ClickUp!');
      } else {
        setClickupError(res.error || 'Failed to authenticate with ClickUp. Please verify your token.');
      }
    } catch (err: any) {
      setClickupError(err.message || 'Network error verifying ClickUp token.');
    } finally {
      setIsClickupLoading(false);
    }
  };

  const handleDisconnectClickUp = () => {
    disconnectClickup();
    setApiKeyInput('');
    setClickupSuccess('Disconnected from ClickUp.');
  };

  const isConnected = firestoreStatus?.connected;
  const displayProject = firestoreStatus?.projectId || 'zen-flow-7173d';

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget && !isClickupLoading && !isSyncing) onClose();
      }}
    >
      <div
        id="workspace-connections-modal"
        className="w-full max-w-xl max-h-[90vh] my-auto flex flex-col rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#111111] shadow-2xl transition-all text-neutral-900 dark:text-white overflow-hidden"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-white/5 shrink-0 bg-white dark:bg-[#111111]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
                Workspace Connection Status
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40">
                Cloud Database (Firestore) & ClickUp Integration
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
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-6">
          {/* ========================================= */}
          {/* SECTION 1: Cloud Database (Firestore) */}
          {/* ========================================= */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/50 flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-blue-500" />
                <span>Cloud Storage (Firestore)</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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

            {/* Feedback Alert for Firestore */}
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

            {/* Connection Details Card */}
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

              <div className="flex items-center justify-between text-xs border-t border-neutral-200/60 dark:border-white/5 pt-2">
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

            {/* Firestore Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black py-2 px-3 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
              >
                <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Verifying...' : 'Verify & Sync Firestore'}</span>
              </button>

              <button
                type="button"
                onClick={handleRefreshStatus}
                disabled={isRefreshing}
                className="flex items-center justify-center gap-1 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800/60 text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 py-2 px-3 text-xs font-medium transition-colors cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* ========================================= */}
          {/* SECTION 2: ClickUp Workspace Integration */}
          {/* ========================================= */}
          <div className="space-y-3 pt-3 border-t border-neutral-100 dark:border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-purple-500" />
                <span>ClickUp API Integration</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isClickupConnected
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-neutral-500/15 text-neutral-600 dark:text-white/50'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isClickupConnected ? 'bg-emerald-500' : 'bg-neutral-400'
                  }`}
                />
                {isClickupConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>

            {/* ClickUp Feedback Alerts */}
            {clickupError && (
              <div className="rounded-xl p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{clickupError}</span>
              </div>
            )}

            {clickupSuccess && (
              <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-600 dark:text-emerald-300 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                <span>{clickupSuccess}</span>
              </div>
            )}

            {isClickupConnected ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold text-xs">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>ClickUp API Authenticated</span>
                  </div>
                  <button
                    onClick={handleDisconnectClickUp}
                    type="button"
                    className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>

                <div className="text-xs space-y-1.5 pt-1 border-t border-emerald-500/10 text-neutral-600 dark:text-white/70">
                  <div className="flex items-center justify-between">
                    <span>Personal API Token</span>
                    <span className="font-mono text-[11px] text-neutral-500 dark:text-white/50">
                      {clickupApiKey ? `pk_••••••••${clickupApiKey.slice(-4)}` : 'Active'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Available Spaces</span>
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {clickupSpaces.length} space(s) available
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConnectClickUp} className="space-y-3">
                <p className="text-xs text-neutral-500 dark:text-white/50">
                  Connect your ClickUp account to synchronize tasks, custom fields, deadlines, and tracked time.
                </p>
                <div>
                  <label className="block text-[10px] uppercase font-semibold text-neutral-500 dark:text-white/40 mb-1">
                    Personal API Token
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={e => setApiKeyInput(e.target.value)}
                    placeholder="pk_1234567_abcdef..."
                    disabled={isClickupLoading}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#161616] text-xs focus:outline-none focus:border-purple-500 transition-all font-mono text-neutral-900 dark:text-white"
                  />
                  <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-white/40 flex items-center gap-1">
                    <span>Find this in ClickUp: Settings &rarr; Apps &rarr; API Token &rarr; Generate.</span>
                    <a
                      href="https://app.clickup.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-0.5 ml-1"
                    >
                      Open ClickUp <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isClickupLoading || !apiKeyInput.trim()}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white py-2 px-3 text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
                >
                  {isClickupLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying Token...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      <span>Connect ClickUp</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-100 dark:border-white/5 bg-neutral-50/50 dark:bg-[#141414] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-white py-1.5 px-4 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
