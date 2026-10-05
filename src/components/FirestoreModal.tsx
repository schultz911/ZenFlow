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
  ExternalLink,
  Unlink,
  CheckCircle,
  Loader2,
  Layers,
  Radio,
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
    isClickupConnected,
    clickupApiKey,
    connectClickup,
    disconnectClickup,
    clickupSpaces,
    clickupWebhookStatus,
    refreshClickupWebhookStatus,
    registerClickupWebhook,
    fetchAuditLogs,
    downloadAuditLogs,
  } = useDashboard();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ClickUp connection states
  const [apiKeyInput, setApiKeyInput] = useState(clickupApiKey || '');
  const [isClickupLoading, setIsClickupLoading] = useState(false);
  const [clickupError, setClickupError] = useState<string | null>(null);
  const [clickupSuccess, setClickupSuccess] = useState<string | null>(null);

  // ClickUp Webhook states
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const [webhookFeedback, setWebhookFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // SOC2 Compliance Audit states
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [showAuditFeed, setShowAuditFeed] = useState(false);

  // Collapsible section states - collapsed by default!
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

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isClickupLoading && !isSyncing && !isRegisteringWebhook) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isClickupLoading, isSyncing, isRegisteringWebhook]);

  // Refresh status and collapse all details whenever modal opens
  useEffect(() => {
    if (isOpen) {
      refreshFirestoreStatus();
      refreshClickupWebhookStatus();
      setFeedback(null);
      setApiKeyInput(clickupApiKey || '');
      setClickupError(null);
      setClickupSuccess(null);
      setWebhookFeedback(null);
      setShowAuditFeed(false);
      setExpandedSections({
        firestore: false,
        clickup: false,
        webhook: false,
        audit: false,
      });
    }
  }, [isOpen, clickupApiKey, refreshFirestoreStatus, refreshClickupWebhookStatus]);

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

  const handleRegisterWebhook = async () => {
    setIsRegisteringWebhook(true);
    setWebhookFeedback(null);
    try {
      const res = await registerClickupWebhook();
      if (res.success) {
        setWebhookFeedback({ type: 'success', message: res.message });
      } else {
        setWebhookFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setWebhookFeedback({ type: 'error', message: err.message || 'Failed to register webhook' });
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const handleToggleAuditFeed = async () => {
    if (!showAuditFeed) {
      setIsLoadingAudit(true);
      try {
        const logs = await fetchAuditLogs(30);
        setAuditLogs(logs);
      } finally {
        setIsLoadingAudit(false);
      }
    }
    setShowAuditFeed(prev => !prev);
  };

  const isConnected = firestoreStatus?.connected;
  const displayProject = firestoreStatus?.projectId || 'zen-flow-7173d';

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
            if (e.target === e.currentTarget && !isClickupLoading && !isSyncing && !isRegisteringWebhook) onClose();
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
                Connections & Compliance
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40">
                Cloud Database, ClickUp Webhooks & SOC2 Audit Stream
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

        {/* Scrollable Body - Collapsed Section Cards */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-3">
          {/* ========================================= */}
          {/* SECTION 1: Cloud Storage (Firestore)     */}
          {/* ========================================= */}
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
                  {isConnected ? 'Live Sync' : 'Standby'}
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
                    <span className="font-medium">{feedback.message}</span>
                  </div>
                )}

                {/* Connection Details Card */}
                <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#161616] p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-white/40">Firebase Project</span>
                    <span className="font-mono font-medium text-neutral-800 dark:text-white/90">
                      {displayProject}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-white/40">Storage Collections</span>
                    <span className="font-mono text-[11px] font-medium text-neutral-700 dark:text-white/80">
                      /users, /tasks, /compliance_audit_logs
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-neutral-200/60 dark:border-white/5 pt-2">
                    <span className="text-neutral-500 dark:text-white/40">Workspace Data</span>
                    <span className="font-medium text-neutral-700 dark:text-white/80">
                      {users.length} member swimlanes · {tasks.length} tasks
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
            )}
          </div>

          {/* ========================================= */}
          {/* SECTION 2: ClickUp Workspace Integration */}
          {/* ========================================= */}
          <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#161616] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('clickup')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-neutral-100/70 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Key className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                    ClickUp API Integration
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-white/40 truncate">
                    {isClickupConnected
                      ? `Authenticated · ${clickupSpaces.length} space(s) available`
                      : 'Connect personal token for task sync'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
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
                {expandedSections.clickup ? (
                  <ChevronUp className="h-4 w-4 text-neutral-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-neutral-400" />
                )}
              </div>
            </button>

            {expandedSections.clickup && (
              <div className="p-4 pt-2 border-t border-neutral-200/60 dark:border-white/5 space-y-3 bg-white dark:bg-[#121212]">
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
            )}
          </div>

          {/* ========================================= */}
          {/* SECTION 3: ClickUp Real-Time Webhook      */}
          {/* ========================================= */}
          <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#161616] overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => toggleSection('webhook')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-neutral-100/70 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Radio className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                    Real-Time ClickUp Webhook
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-white/40 truncate">
                    {clickupWebhookStatus?.registered
                      ? `Active · ${clickupWebhookStatus.totalEventsCount ?? 0} events received`
                      : 'Instantaneous inbound SSE propagation'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    clickupWebhookStatus?.listening
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-neutral-500/15 text-neutral-600 dark:text-white/50'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      clickupWebhookStatus?.listening ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'
                    }`}
                  />
                  {clickupWebhookStatus?.registered
                    ? 'Registered & Active'
                    : clickupWebhookStatus?.listening
                    ? 'Listener Standby'
                    : 'Inactive'}
                </span>
                {expandedSections.webhook ? (
                  <ChevronUp className="h-4 w-4 text-neutral-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-neutral-400" />
                )}
              </div>
            </button>

            {expandedSections.webhook && (
              <div className="p-4 pt-2 border-t border-neutral-200/60 dark:border-white/5 space-y-3 bg-white dark:bg-[#121212]">
                {webhookFeedback && (
                  <div
                    className={`rounded-xl p-3 text-xs flex items-center gap-2.5 ${
                      webhookFeedback.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-500 border border-red-500/20'
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

                <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#161616] p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-white/40">Inbound Endpoint</span>
                    <span className="font-mono text-[11px] text-neutral-800 dark:text-white/90 truncate max-w-[260px]">
                      {clickupWebhookStatus?.endpointUrl || '/api/clickup/webhook'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-white/40">Events Ingested</span>
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {clickupWebhookStatus?.totalEventsCount ?? 0} events received
                    </span>
                  </div>

                  {clickupWebhookStatus?.lastEventAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 dark:text-white/40">Last Inbound Event</span>
                      <span className="text-neutral-600 dark:text-white/60">
                        {new Date(clickupWebhookStatus.lastEventAt).toLocaleTimeString()} ({clickupWebhookStatus.lastEventAction || 'event'})
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-neutral-200/60 dark:border-white/5 pt-2">
                    <span className="text-neutral-500 dark:text-white/40">Propagation Route</span>
                    <span className="text-neutral-600 dark:text-white/60">
                      Instantaneous SSE via <code className="font-mono text-[10px] bg-neutral-200/50 dark:bg-white/10 px-1 py-0.5 rounded">/api/events</code>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRegisterWebhook}
                  disabled={isRegisteringWebhook || !isClickupConnected}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 py-2 px-3 text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isRegisteringWebhook ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Registering with ClickUp Team API...</span>
                    </>
                  ) : (
                    <>
                      <Radio className="w-3.5 h-3.5" />
                      <span>{clickupWebhookStatus?.registered ? 'Re-sync Webhook with ClickUp' : 'Register Webhook with ClickUp'}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ========================================= */}
          {/* SECTION 4: SOC2 Compliance Audit Stream   */}
          {/* ========================================= */}
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
                      data/compliance-audit.jsonl & /compliance_audit_logs
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-white/40">Audit Coverage</span>
                    <span className="text-neutral-600 dark:text-white/60">
                      Reassignments, hours overrides, permissions, deletions & webhooks
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
                    disabled={isLoadingAudit}
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
