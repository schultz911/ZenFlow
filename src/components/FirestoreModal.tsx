import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { AuditLogEntry } from '../types';
import {
  Database,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  Key,
  Loader2,
  Layers,
  ShieldCheck,
  Download,
  ChevronDown,
  ChevronUp,
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
    isSuperadmin,
    canManageMembers,
    fetchAuditLogs,
    downloadAuditLogs,
  } = useDashboard();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Service Account Credentials Upload state
  const [serviceAccountInput, setServiceAccountInput] = useState('');
  const [isUploadingKey, setIsUploadingKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // SOC2 Compliance Audit states
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [showAuditFeed, setShowAuditFeed] = useState(false);

  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    firestore: false,
    audit: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSyncing && !isUploadingKey) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSyncing, isUploadingKey]);

  // Refresh status and collapse details when modal opens
  useEffect(() => {
    if (isOpen) {
      refreshFirestoreStatus();
      setFeedback(null);
      setKeyFeedback(null);
      setServiceAccountInput('');
      setShowAuditFeed(false);
      setExpandedSections({
        firestore: false,
        audit: false,
      });
    }
  }, [isOpen, refreshFirestoreStatus]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await syncWithFirestore();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Workspace synchronized successfully with Firestore.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Sync failed. Check Firestore service account permissions.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to trigger synchronization with Firestore.',
      });
    } finally {
      setIsSyncing(false);
      refreshFirestoreStatus();
    }
  };

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    try {
      await refreshFirestoreStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUploadServiceAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyFeedback(null);
    const key = serviceAccountInput.trim();
    if (!key) {
      setKeyFeedback({ type: 'error', message: 'Please provide the JSON service account key content.' });
      return;
    }

    try {
      JSON.parse(key);
    } catch {
      setKeyFeedback({ type: 'error', message: 'Invalid JSON format. Please paste valid Google Cloud Service Account JSON.' });
      return;
    }

    setIsUploadingKey(true);
    try {
      const res = await fetch('/api/firestore/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zenflow-request': '1',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ serviceAccountKey: key }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setKeyFeedback({ type: 'success', message: data.message || 'Firestore connected successfully!' });
        setServiceAccountInput('');
        await refreshFirestoreStatus();
      } else {
        setKeyFeedback({ type: 'error', message: data.error || 'Failed to connect to Firestore with provided key.' });
      }
    } catch (err: any) {
      setKeyFeedback({ type: 'error', message: err.message || 'Network error saving Firestore credentials.' });
    } finally {
      setIsUploadingKey(false);
    }
  };

  const handleToggleAuditFeed = async () => {
    if (!showAuditFeed && auditLogs.length === 0) {
      setIsLoadingAudit(true);
      try {
        const logs = await fetchAuditLogs(50);
        setAuditLogs(logs);
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        setIsLoadingAudit(false);
      }
    }
    setShowAuditFeed(prev => !prev);
  };

  const isConnected = firestoreStatus?.mode === 'admin' || firestoreStatus?.serviceAccountFound;
  const displayProject = firestoreStatus?.projectId || 'Not Configured';

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-xs overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSyncing && !isUploadingKey) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
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
                    Database & Compliance
                  </h2>
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
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-3">
              {/* SECTION 1: Cloud Storage (Firestore) */}
              <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#161616] overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => toggleSection('firestore')}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-neutral-100/70 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Database className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                        Cloud Storage (Firestore)
                      </h3>
                      <p className="text-[11px] text-neutral-500 dark:text-white/40 truncate">
                        {displayProject} · {users.length} members · {tasks.length} tasks
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
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
                      {isConnected ? 'Live Sync' : 'Local / Standby'}
                    </span>
                    {expandedSections.firestore ? (
                      <ChevronUp className="h-4 w-4 text-neutral-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-neutral-400" />
                    )}
                  </div>
                </button>

                {expandedSections.firestore && (
                  <div className="p-4 pt-2 border-t border-neutral-200/60 dark:border-white/5 space-y-3 bg-white dark:bg-[#121212]">
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
                        <span>{feedback.message}</span>
                      </div>
                    )}

                    {/* Metadata Card */}
                    <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#161616] p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 dark:text-white/40">Project ID</span>
                        <span className="font-mono text-[11px] font-semibold text-neutral-800 dark:text-white/90">
                          {firestoreStatus?.projectId || 'Not set'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 dark:text-white/40">Database ID</span>
                        <span className="font-mono text-[11px] text-neutral-800 dark:text-white/90">
                          {firestoreStatus?.databaseId || '(default)'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 dark:text-white/40">Persistence Mode</span>
                        <span className="font-medium text-neutral-800 dark:text-white/90">
                          {firestoreStatus?.mode === 'admin'
                            ? 'Cloud Firestore Admin'
                            : 'Local Storage'}
                        </span>
                      </div>

                      {firestoreStatus?.lastSyncTime && (
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500 dark:text-white/40">Last Synchronized</span>
                          <span className="text-neutral-600 dark:text-white/60">
                            {new Date(firestoreStatus.lastSyncTime).toLocaleTimeString()}
                          </span>
                        </div>
                      )}

                      {firestoreStatus?.lastError && (
                        <div className="pt-2 border-t border-neutral-200/50 dark:border-white/5 text-[11px] text-amber-600 dark:text-amber-400">
                          Warning: {firestoreStatus.lastError}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        {isSyncing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span>{isSyncing ? 'Syncing...' : 'Sync Workspace with Firestore'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRefreshStatus}
                        disabled={isRefreshing}
                        title="Refresh database status"
                        className="flex items-center justify-center rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800/60 text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 p-2 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    {/* Superadmin: Configure Service Account Key */}
                    {isSuperadmin && (
                      <div className="pt-2 border-t border-neutral-200/60 dark:border-white/5 space-y-2">
                        <label className="block text-xs font-semibold text-neutral-800 dark:text-white/90">
                          Configure Firebase Admin Service Account Key
                        </label>
                        <p className="text-[11px] text-neutral-500 dark:text-white/40 leading-relaxed">
                          Provide Google Cloud Service Account JSON credentials to connect cloud Firestore persistence.
                        </p>

                        {keyFeedback && (
                          <div
                            className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                              keyFeedback.type === 'success'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-500 border border-red-500/20'
                            }`}
                          >
                            {keyFeedback.type === 'success' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span>{keyFeedback.message}</span>
                          </div>
                        )}

                        <form onSubmit={handleUploadServiceAccount} className="space-y-2">
                          <textarea
                            value={serviceAccountInput}
                            onChange={e => setServiceAccountInput(e.target.value)}
                            placeholder='Paste service account JSON: { "type": "service_account", "project_id": "...", ... }'
                            rows={3}
                            className="w-full rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#161616] p-2.5 text-[11px] font-mono text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isUploadingKey || !serviceAccountInput.trim()}
                            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-40 shadow-xs"
                          >
                            {isUploadingKey ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Key className="h-3 w-3" />
                            )}
                            <span>{isUploadingKey ? 'Connecting...' : 'Apply Firestore Credentials'}</span>
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 2: SOC2 Compliance Audit Stream */}
              <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#161616] overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => toggleSection('audit')}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-neutral-100/70 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                        SOC2 Compliance Audit Stream
                      </h3>
                      <p className="text-[11px] text-neutral-500 dark:text-white/40 truncate">
                        Append-only audit trail mirrored to Firestore & NDJSON disk
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                      Append-Only Active
                    </span>
                    {expandedSections.audit ? (
                      <ChevronUp className="h-4 w-4 text-neutral-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-neutral-400" />
                    )}
                  </div>
                </button>

                {expandedSections.audit && (
                  <div className="p-4 pt-2 border-t border-neutral-200/60 dark:border-white/5 space-y-3 bg-white dark:bg-[#121212]">
                    <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#161616] p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 dark:text-white/40">Persistence Storage</span>
                        <span className="font-mono text-[11px] text-neutral-800 dark:text-white/90">
                          Firestore /compliance_audit_logs & local audit log
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 dark:text-white/40">Audit Coverage</span>
                        <span className="text-neutral-600 dark:text-white/60">
                          Reassignments, hours overrides, permissions & deletions
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={downloadAuditLogs}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white py-2 px-3 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Audit Stream (NDJSON)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleAuditFeed}
                        disabled={isLoadingAudit || !canManageMembers}
                        className="flex items-center justify-center gap-1 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800/60 text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 py-2 px-3 text-xs font-medium transition-colors cursor-pointer"
                      >
                        {isLoadingAudit ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : showAuditFeed ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        <span>{showAuditFeed ? 'Hide Log' : 'View Log'}</span>
                      </button>
                    </div>

                    {/* Expandable Recent Audit Log Feed */}
                    {showAuditFeed && (
                      <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-900 text-neutral-100 p-3 text-[11px] font-mono space-y-2 max-h-56 overflow-y-auto">
                        <div className="flex items-center justify-between text-[10px] text-neutral-400 border-b border-neutral-800 pb-1">
                          <span>Recent Audit Events ({auditLogs.length})</span>
                          <span>Immutable Stream</span>
                        </div>
                        {auditLogs.length === 0 ? (
                          <div className="text-neutral-500 py-3 text-center font-sans text-xs">No audit records logged yet.</div>
                        ) : (
                          auditLogs.slice(0, 20).map(entry => (
                            <div key={entry.id} className="border-b border-neutral-800/50 pb-1.5 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between text-neutral-400">
                                <span className="text-purple-400 uppercase text-[9px] font-semibold tracking-wider">
                                  [{entry.category}] {entry.action}
                                </span>
                                <span className="text-[9px] text-neutral-500">
                                  {new Date(entry.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <div className="text-neutral-300 text-[10px] truncate mt-0.5">
                                {entry.details || `${entry.targetType}:${entry.targetId}`}
                              </div>
                              {entry.actor?.name && (
                                <div className="text-[9px] text-neutral-500">
                                  Actor: {entry.actor.name} ({entry.actor.email || 'system'})
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
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
