import React, { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import {
  Database,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Upload,
  RefreshCw,
  X,
  Key,
  FolderLock,
  ArrowRight,
} from 'lucide-react';

interface FirestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirestoreModal: React.FC<FirestoreModalProps> = ({ isOpen, onClose }) => {
  const { firestoreStatus, refreshFirestoreStatus, syncWithFirestore, uploadServiceAccountKey, users, tasks } =
    useDashboard();

  const [keyInput, setKeyInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      const text = event.target?.result as string;
      if (text) {
        setKeyInput(text);
        await handleSaveKey(text);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveKey = async (contentToSave?: string) => {
    const raw = (contentToSave || keyInput).trim();
    if (!raw) {
      setFeedback({ type: 'error', message: 'Please paste or upload your service account JSON.' });
      return;
    }

    try {
      JSON.parse(raw);
    } catch {
      setFeedback({ type: 'error', message: 'Invalid JSON format. Please verify the copied file.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await uploadServiceAccountKey(raw);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Connected to Firestore successfully!' });
        setKeyInput('');
      } else {
        setFeedback({ type: 'error', message: res.message || 'Connection failed' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit service account key' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await syncWithFirestore();
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Workspace synchronized with Firestore!' });
      } else {
        setFeedback({ type: 'error', message: res.message || 'Sync failed' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Sync failed' });
    } finally {
      setIsSyncing(false);
    }
  };

  const isConnected = firestoreStatus?.connected && firestoreStatus?.mode === 'admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        id="firestore-connection-modal"
        className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#111111] p-6 shadow-2xl transition-all text-neutral-900 dark:text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
                Firestore Database Status
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40">
                Persistent storage & team synchronizer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mt-4 rounded-xl p-3 text-xs flex items-center gap-2.5 ${
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

        {/* Connection Info */}
        <div className="mt-4 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#161616] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500 dark:text-white/40">Project ID</span>
            <span className="font-mono font-medium text-neutral-800 dark:text-white/90">
              {firestoreStatus?.projectId || 'zennext-4d040'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500 dark:text-white/40">Database ID</span>
            <span className="font-mono font-medium text-neutral-800 dark:text-white/90">
              {firestoreStatus?.databaseId || '(default)'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500 dark:text-white/40">Persistence Mode</span>
            <div className="flex items-center gap-1.5">
              {isConnected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Admin SDK (Direct Firestore)
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    Awaiting Service Account Key
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs border-t border-neutral-200/60 dark:border-white/5 pt-2">
            <span className="text-neutral-500 dark:text-white/40">Workspace Items</span>
            <span className="font-medium text-neutral-700 dark:text-white/70">
              {users.length} member swimlanes, {tasks.length} tasks
            </span>
          </div>
        </div>

        {isConnected ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Direct Firestore Persistence Active
                </p>
                <p className="text-xs text-neutral-600 dark:text-white/60 mt-1 leading-relaxed">
                  Every swimlane, member profile, task creation, status transition, and reorder is automatically
                  saved to the <code className="font-mono font-semibold">users</code> and{' '}
                  <code className="font-mono font-semibold">tasks</code> collections in your Firestore database.
                </p>
              </div>
            </div>

            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black py-2.5 px-4 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronizing with Firestore...' : 'Sync All Workspace Data to Firestore Now'}</span>
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <Key className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Connect Your Firebase Service Account
                  </p>
                  <p className="text-xs text-neutral-600 dark:text-white/60 mt-1 leading-relaxed">
                    Because project <span className="font-mono font-medium">zennext-4d040</span> enforces Firebase App
                    Check, a Firebase Service Account key is required to write directly to your database without
                    restrictions.
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-neutral-100 dark:bg-black/40 p-2.5 text-[11px] text-neutral-600 dark:text-white/50 space-y-1">
                <p className="font-medium text-neutral-700 dark:text-white/70">How to get your key:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>In Firebase Console, click the Gear icon ➔ Project Settings</li>
                  <li>Go to the "Service accounts" tab</li>
                  <li>Click "Generate new private key" and download the JSON</li>
                </ol>
              </div>
            </div>

            {/* Upload or Paste Form */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/40">
                  Upload or Paste Key JSON
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose file</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <textarea
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder='Paste raw service account JSON (e.g. {"type": "service_account", "project_id": ...})'
                rows={4}
                className="w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#161616] p-3 text-xs font-mono text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />

              <button
                onClick={() => handleSaveKey()}
                disabled={isSubmitting || !keyInput.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white py-2.5 px-4 text-xs font-medium disabled:opacity-50 transition-colors shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Connecting to Firestore...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Connect & Save All Workspace Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
