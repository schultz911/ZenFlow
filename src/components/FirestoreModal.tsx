import { DialogPanel } from './ui/DialogPanel';
import { apiFetch } from '../lib/api';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, useClickUp, useWorkspace } from '../context/DashboardContext';
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
  Radio,
  ExternalLink,
  Unlink,
} from 'lucide-react';
import { SuperadminPurgeModal } from './SuperadminPurgeModal';

interface FirestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirestoreModal: React.FC<FirestoreModalProps> = ({ isOpen, onClose }) => {
  const {
    isSuperadmin,
    canManageMembers,
  } = useAuth();
  const {
    firestoreStatus,
    refreshFirestoreStatus,
    syncWithFirestore,
    users,
    tasks,
    fetchAuditLogs,
    downloadAuditLogs,
  } = useWorkspace();
  const {
    isClickupConnected,
    clickupSpaces,
    connectClickup,
    disconnectClickup,
    clickupWebhookStatus,
    refreshClickupWebhookStatus,
    registerClickupWebhook,
  } = useClickUp();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [purgeModalOpen, setPurgeModalOpen] = useState(false);

  // Service Account Credentials Upload state
  const [serviceAccountInput, setServiceAccountInput] = useState('');
  const [isUploadingKey, setIsUploadingKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // SOC2 Compliance Audit states
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [showAuditFeed, setShowAuditFeed] = useState(false);

  // ClickUp states
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isClickupLoading, setIsClickupLoading] = useState(false);
  const [clickupError, setClickupError] = useState<string | null>(null);
  const [clickupSuccess, setClickupSuccess] = useState<string | null>(null);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const [webhookFeedback, setWebhookFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    firestore: false,
    clickup: false,
    webhook: false,
    audit: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Refresh status and collapse details when modal opens
  useEffect(() => {
    if (isOpen) {
      setPurgeModalOpen(false);
      refreshFirestoreStatus();
      if (isClickupConnected) {
        refreshClickupWebhookStatus();
      }
      setFeedback(null);
      setKeyFeedback(null);
      setClickupError(null);
      setClickupSuccess(null);
      setWebhookFeedback(null);
      setApiKeyInput('');
      setServiceAccountInput('');
      setShowAuditFeed(false);
      setExpandedSections({
        firestore: false,
        clickup: false,
        webhook: false,
        audit: false,
      });
    }
  }, [isOpen, refreshFirestoreStatus, isClickupConnected, refreshClickupWebhookStatus]);

  const handleConnectClickUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = apiKeyInput.trim();
    if (!token) return;
    setIsClickupLoading(true);
    setClickupError(null);
    setClickupSuccess(null);
    try {
      const result = await connectClickup(token);
      if (result.success) {
        setClickupSuccess('ClickUp API connected and spaces loaded.');
        setApiKeyInput('');
      } else {
        setClickupError(result.error || 'Failed to connect ClickUp API token.');
      }
    } catch (err: any) {
      setClickupError(err?.message || 'Failed to connect ClickUp API token.');
    } finally {
      setIsClickupLoading(false);
    }
  };

  const handleDisconnectClickUp = async () => {
    setIsClickupLoading(true);
    setClickupError(null);
    setClickupSuccess(null);
    try {
      await disconnectClickup();
      setClickupSuccess('ClickUp account disconnected.');
    } catch (err: any) {
      setClickupError(err?.message || 'Failed to disconnect ClickUp.');
    } finally {
      setIsClickupLoading(false);
    }
  };

  const handleRegisterWebhook = async () => {
    setIsRegisteringWebhook(true);
    setWebhookFeedback(null);
    try {
      const result = await registerClickupWebhook();
      if (result.success) {
        setWebhookFeedback({ type: 'success', message: result.message || 'ClickUp webhook registered cleanly.' });
      } else {
        setWebhookFeedback({ type: 'error', message: result.message || 'Failed to register ClickUp webhook.' });
      }
    } catch (err: any) {
      setWebhookFeedback({ type: 'error', message: err?.message || 'Failed to register ClickUp webhook.' });
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

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
      const res = await apiFetch('/api/firestore/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

  const isConnected = Boolean(firestoreStatus?.connected);
  const displayProject = firestoreStatus?.projectId || 'Not Configured';

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSyncing && !isUploadingKey && !purgeModalOpen) onClose();
          }}
        >
          <DialogPanel aria-label="Database & Compliance" onClose={onClose} busy={isSyncing || isUploadingKey || purgeModalOpen}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            id="workspace-connections-modal"
            className="w-full max-w-xl my-auto flex flex-col overflow-hidden"
          >
            {/* Fixed Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                  <Layers className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  Database &amp; Compliance
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSyncing || isUploadingKey || purgeModalOpen}
                aria-label="Close modal"
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body — Single Hairline-Partitioned Accordion Ledger */}
            <div className="p-5 overflow-y-auto flex-1">
              <div className="ledger-frame divide-y divide-[var(--border)]">
                {/* SECTION 1: Cloud Storage (Firestore) */}
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSection('firestore')}
                    aria-expanded={expandedSections.firestore}
                    aria-controls="firestore-settings"
                    className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                        <Database className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          Cloud Storage (Firestore)
                        </h3>
                        <p className="text-[11px] tabular-nums text-[var(--text-secondary)] truncate">
                          {displayProject} · {users.length} members · {tasks.length} tasks
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                          isConnected
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isConnected ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-amber-600 dark:bg-amber-400'
                          }`}
                        />
                        <span>{isConnected ? 'Live Sync' : 'Local / Standby'}</span>
                      </span>
                      {expandedSections.firestore ? (
                        <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                      )}
                    </div>
                  </button>

                  {expandedSections.firestore && (
                    <div id="firestore-settings" className="p-4 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--surface-muted)]">
                      {feedback && (
                        <div
                          role="status"
                          className={`callout flex items-center gap-2 ${
                            feedback.type === 'success' ? 'callout-success' : 'callout-danger'
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

                      <dl className="rounded-[7px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border-subtle)] text-xs">
                        <div className="flex items-center justify-between px-3 py-2">
                          <dt className="text-[var(--text-secondary)]">Project ID</dt>
                          <dd className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                            {firestoreStatus?.projectId || 'Not set'}
                          </dd>
                        </div>

                        <div className="flex items-center justify-between px-3 py-2">
                          <dt className="text-[var(--text-secondary)]">Database ID</dt>
                          <dd className="font-mono text-[11px] text-[var(--text-primary)]">
                            {firestoreStatus?.databaseId || '(default)'}
                          </dd>
                        </div>

                        <div className="flex items-center justify-between px-3 py-2">
                          <dt className="text-[var(--text-secondary)]">Persistence Mode</dt>
                          <dd className="font-medium text-[var(--text-primary)]">
                            {isConnected ? 'Cloud Firestore Admin' : 'Local Storage'}
                          </dd>
                        </div>

                        {firestoreStatus?.lastSyncTime && (
                          <div className="flex items-center justify-between px-3 py-2">
                            <dt className="text-[var(--text-secondary)]">Last Synchronized</dt>
                            <dd className="tabular-nums text-[var(--text-secondary)]">
                              {new Date(firestoreStatus.lastSyncTime).toLocaleTimeString()}
                            </dd>
                          </div>
                        )}

                        {firestoreStatus?.lastError && (
                          <div className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                            Warning: {firestoreStatus.lastError}
                          </div>
                        )}
                      </dl>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleManualSync}
                          disabled={isSyncing}
                          className="button-primary flex-1"
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
                          aria-label="Refresh database status"
                          className="button-secondary !px-2.5"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                      </div>

                      {isSuperadmin && (
                        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                          <label htmlFor="firestore-credentials" className="field-label !mb-0">
                            Configure Firebase Admin Service Account Key
                          </label>
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            Provide Google Cloud Service Account JSON credentials to connect cloud Firestore persistence.
                          </p>

                          {keyFeedback && (
                            <div
                              role="status"
                              className={`callout flex items-center gap-2 ${
                                keyFeedback.type === 'success' ? 'callout-success' : 'callout-danger'
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
                              id="firestore-credentials"
                              value={serviceAccountInput}
                              onChange={e => setServiceAccountInput(e.target.value)}
                              placeholder='Paste service account JSON: { "type": "service_account", "project_id": "...", ... }'
                              rows={3}
                              className="field-control font-mono text-[11px]"
                            />
                            <button
                              type="submit"
                              disabled={isUploadingKey || !serviceAccountInput.trim()}
                              className="button-primary w-full"
                            >
                              {isUploadingKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Key className="h-3.5 w-3.5" />
                              )}
                              <span>{isUploadingKey ? 'Connecting...' : 'Apply Credentials'}</span>
                            </button>
                          </form>

                          <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-500/25 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                                Danger Zone
                              </p>
                              <p className="text-[11px] text-[var(--text-secondary)]">
                                Wipe all workspace tasks and member accounts.
                              </p>
                            </div>
                            <button
                              type="button"
                              className="button-danger-outline shrink-0"
                              disabled={isUploadingKey || isSyncing}
                              onClick={() => setPurgeModalOpen(true)}
                            >
                              Purge Database
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* SECTION 2: ClickUp API Integration */}
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSection('clickup')}
                    aria-expanded={expandedSections.clickup}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-primary)]">
                        <Key className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          ClickUp API Integration
                        </h3>
                        <p className="text-[11px] tabular-nums text-[var(--text-secondary)] truncate">
                          {isClickupConnected
                            ? `Authenticated · ${clickupSpaces.length} space(s) available`
                            : 'Connect personal token for task sync'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                          isClickupConnected
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isClickupConnected ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-[var(--text-muted)]'
                          }`}
                        />
                        <span>{isClickupConnected ? 'Connected' : 'Not Connected'}</span>
                      </span>
                      {expandedSections.clickup ? (
                        <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                      )}
                    </div>
                  </button>

                  {expandedSections.clickup && (
                    <div className="p-4 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--surface-muted)]">
                      {clickupError && (
                        <div role="alert" className="callout callout-danger flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{clickupError}</span>
                        </div>
                      )}

                      {clickupSuccess && (
                        <div role="status" className="callout callout-success flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{clickupSuccess}</span>
                        </div>
                      )}

                      {isClickupConnected ? (
                        <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>ClickUp API Authenticated</span>
                            </div>
                            <button
                              onClick={handleDisconnectClickUp}
                              type="button"
                              disabled={isClickupLoading}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                              style={{ minHeight: 'auto' }}
                            >
                              <Unlink className="w-3.5 h-3.5" />
                              <span>Disconnect</span>
                            </button>
                          </div>

                          <dl className="divide-y divide-[var(--border-subtle)] text-xs">
                            <div className="flex items-center justify-between px-3 py-2">
                              <dt className="text-[var(--text-secondary)]">Personal API Token</dt>
                              <dd className="font-mono text-[11px] text-[var(--text-primary)]">Active</dd>
                            </div>
                            <div className="flex items-center justify-between px-3 py-2">
                              <dt className="text-[var(--text-secondary)]">Available Spaces</dt>
                              <dd className="font-semibold tabular-nums text-[var(--text-primary)]">
                                {clickupSpaces.length} space(s)
                              </dd>
                            </div>
                          </dl>
                        </div>
                      ) : (
                        <form onSubmit={handleConnectClickUp} className="space-y-3">
                          <p className="text-xs text-[var(--text-secondary)]">
                            Connect your ClickUp account to synchronize spaces, lists, tasks, deadlines, and tracked time.
                          </p>
                          <div>
                            <label className="field-label" htmlFor="clickup-api-token-input">
                              Personal API Token
                            </label>
                            <input
                              id="clickup-api-token-input"
                              type="password"
                              value={apiKeyInput}
                              onChange={e => setApiKeyInput(e.target.value)}
                              placeholder="pk_1234567_abcdef..."
                              disabled={isClickupLoading}
                              className="field-control font-mono"
                            />
                            <p className="mt-1.5 text-[11px] text-[var(--text-secondary)] flex items-center gap-1 flex-wrap">
                              <span>Find this in ClickUp: Settings &rarr; Apps &rarr; API Token &rarr; Generate.</span>
                              <a
                                href="https://app.clickup.com"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#1d4ed8] dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 ml-1 font-medium"
                              >
                                <span>Open ClickUp</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </p>
                          </div>

                          <button
                            type="submit"
                            disabled={isClickupLoading || !apiKeyInput.trim()}
                            className="button-primary w-full"
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
                  )}
                </div>

                {/* SECTION 3: ClickUp Real-Time Webhook */}
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSection('webhook')}
                    aria-expanded={expandedSections.webhook}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                        <Radio className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          Real-Time ClickUp Webhook
                        </h3>
                        <p className="text-[11px] tabular-nums text-[var(--text-secondary)] truncate">
                          {clickupWebhookStatus?.registered
                            ? `Active · ${clickupWebhookStatus.totalEventsCount ?? 0} events received`
                            : 'Instantaneous inbound SSE propagation'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                          clickupWebhookStatus?.listening
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            clickupWebhookStatus?.listening ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-[var(--text-muted)]'
                          }`}
                        />
                        <span>
                          {clickupWebhookStatus?.registered
                            ? 'Active'
                            : clickupWebhookStatus?.listening
                            ? 'Standby'
                            : 'Inactive'}
                        </span>
                      </span>
                      {expandedSections.webhook ? (
                        <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                      )}
                    </div>
                  </button>

                  {expandedSections.webhook && (
                    <div className="p-4 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--surface-muted)]">
                      {webhookFeedback && (
                        <div
                          role="status"
                          className={`callout flex items-center gap-2 ${
                            webhookFeedback.type === 'success' ? 'callout-success' : 'callout-danger'
                          }`}
                        >
                          {webhookFeedback.type === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 shrink-0" />
                          )}
                          <span className="font-medium">{webhookFeedback.message}</span>
                        </div>
                      )}

                      <dl className="rounded-[7px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border-subtle)] text-xs">
                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                          <dt className="text-[var(--text-secondary)] shrink-0">Inbound Endpoint</dt>
                          <dd className="font-mono text-[11px] text-[var(--text-primary)] truncate">
                            {clickupWebhookStatus?.endpointUrl || '/api/clickup/webhook'}
                          </dd>
                        </div>

                        <div className="flex items-center justify-between px-3 py-2">
                          <dt className="text-[var(--text-secondary)]">Events Ingested</dt>
                          <dd className="font-semibold tabular-nums text-[var(--text-primary)]">
                            {clickupWebhookStatus?.totalEventsCount ?? 0} events received
                          </dd>
                        </div>

                        {clickupWebhookStatus?.lastEventAt && (
                          <div className="flex items-center justify-between px-3 py-2">
                            <dt className="text-[var(--text-secondary)]">Last Inbound Event</dt>
                            <dd className="tabular-nums text-[var(--text-secondary)]">
                              {new Date(clickupWebhookStatus.lastEventAt).toLocaleTimeString()} ({clickupWebhookStatus.lastEventAction || 'event'})
                            </dd>
                          </div>
                        )}
                      </dl>

                      <button
                        type="button"
                        onClick={handleRegisterWebhook}
                        disabled={isRegisteringWebhook || !isClickupConnected || !isSuperadmin}
                        title={isSuperadmin ? 'Register a signed ClickUp webhook' : 'Only the Superadmin can manage workspace webhooks'}
                        className="button-secondary w-full"
                      >
                        {isRegisteringWebhook ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Registering with ClickUp Team API...</span>
                          </>
                        ) : (
                          <>
                            <Radio className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                            <span>{clickupWebhookStatus?.registered ? 'Re-sync Webhook with ClickUp' : 'Register Webhook with ClickUp'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* SECTION 4: SOC2 Compliance Audit Stream */}
                <div>
                  <button
                    type="button"
                    onClick={() => toggleSection('audit')}
                    aria-expanded={expandedSections.audit}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          SOC2 Compliance Audit Stream
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#1d4ed8] dark:bg-blue-400" />
                        <span>Append-Only</span>
                      </span>
                      {expandedSections.audit ? (
                        <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                      )}
                    </div>
                  </button>

                  {expandedSections.audit && (
                    <div className="p-4 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--surface-muted)]">
                      <dl className="rounded-[7px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border-subtle)] text-xs">
                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <dt className="text-[var(--text-secondary)] shrink-0">Persistence Storage</dt>
                          <dd className="font-mono text-[11px] text-[var(--text-primary)] truncate">
                            Firestore /compliance_audit_logs &amp; local log
                          </dd>
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                          <dt className="text-[var(--text-secondary)] shrink-0">Audit Coverage</dt>
                          <dd className="text-[var(--text-secondary)] text-right">
                            Reassignments, hours overrides, permissions &amp; deletions
                          </dd>
                        </div>
                      </dl>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={downloadAuditLogs}
                          className="button-primary flex-1"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download Audit Stream (NDJSON)</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleToggleAuditFeed}
                          disabled={isLoadingAudit || !canManageMembers}
                          className="button-secondary shrink-0"
                        >
                          {isLoadingAudit ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
                        <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-primary)] p-3 text-[11px] font-mono space-y-2 max-h-56 overflow-y-auto">
                          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] border-b border-[var(--border)] pb-1.5 tabular-nums">
                            <span>Recent Audit Events ({auditLogs.length})</span>
                            <span>Immutable Stream</span>
                          </div>
                          {auditLogs.length === 0 ? (
                            <div className="text-[var(--text-muted)] py-3 text-center font-sans text-xs">No audit records logged yet.</div>
                          ) : (
                            auditLogs.slice(0, 20).map(entry => (
                              <div key={entry.id} className="border-b border-[var(--border-subtle)] pb-1.5 last:border-0 last:pb-0">
                                <div className="flex items-center justify-between gap-2 text-[var(--text-secondary)]">
                                  <span className="text-[#1d4ed8] dark:text-blue-400 uppercase text-[11px] font-semibold tracking-wider truncate">
                                    [{entry.category}] {entry.action}
                                  </span>
                                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                <div className="text-[var(--text-primary)] text-[11px] truncate mt-0.5">
                                  {entry.details || `${entry.targetType}:${entry.targetId}`}
                                </div>
                                {entry.actor?.name && (
                                  <div className="text-[11px] text-[var(--text-muted)]">
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
            </div>

            {/* Modal Footer */}
            <div className="dialog-footer">
              <button
                type="button"
                onClick={onClose}
                disabled={isSyncing || isUploadingKey || purgeModalOpen}
                className="button-secondary"
              >
                Close
              </button>
            </div>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return <>{createPortal(modalContent, document.body)}<SuperadminPurgeModal isOpen={isOpen && purgeModalOpen} onClose={() => setPurgeModalOpen(false)} /></>;
  }

  return modalContent;
};
