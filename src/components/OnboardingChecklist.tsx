import React, { useState, useEffect, useRef } from 'react';
import { Check, Loader2, X, KeyRound, FolderKanban, Webhook, ChevronDown, ExternalLink } from 'lucide-react';
import { useAuth, useClickUp, useWorkspace } from '../context/DashboardContext';

interface OnboardingChecklistProps {
  forceOpen: boolean;
  onCloseForceOpen: () => void;
}

const DISMISS_PREFIX = 'zenflow_onboarding_dismissed_v1_';
const SYNCED_PREFIX = 'zenflow_onboarding_synced_v1_';

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  forceOpen,
  onCloseForceOpen,
}) => {
  const { currentUser, isSuperadmin } = useAuth();
  const { tasks, updateUserProfile } = useWorkspace();
  const {
    isClickupConnected,
    clickupSpaces,
    selectedClickupSpaceId,
    clickupMembers,
    loadClickupMembers,
    connectClickup,
    setSelectedClickupSpaceId,
    syncUserTasksWithClickUp,
    clickupWebhookStatus,
    refreshClickupWebhookStatus,
    registerClickupWebhook,
  } = useClickUp();

  const [dismissed, setDismissed] = useState(true);
  const [hasSynced, setHasSynced] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [connectingKey, setConnectingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [spaceIdInput, setSpaceIdInput] = useState('');
  const [syncingTasks, setSyncingTasks] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [webhookNotice, setWebhookNotice] = useState<string | null>(null);
  const [webhookNonFatalDone, setWebhookNonFatalDone] = useState(false);
  const autoWebhookAttemptedRef = useRef<string | null>(null);
  const membersLoadedForUserRef = useRef<string | null>(null);
  const prevSelectedSpaceRef = useRef<string>(selectedClickupSpaceId);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const userId = currentUser?.id || '';

  useEffect(() => {
    if (!userId) return;
    try {
      setDismissed(localStorage.getItem(`${DISMISS_PREFIX}${userId}`) === 'true');
      setHasSynced(localStorage.getItem(`${SYNCED_PREFIX}${userId}`) === 'true');
    } catch {
      setDismissed(false);
      setHasSynced(false);
    }
    setSpaceIdInput('');
    prevSelectedSpaceRef.current = '';
    setKeyError(null);
    setSyncNotice(null);
    setWebhookNotice(null);
    setWebhookNonFatalDone(false);
    autoWebhookAttemptedRef.current = null;
    membersLoadedForUserRef.current = null;
  }, [userId]);

  useEffect(() => {
    if (selectedClickupSpaceId && selectedClickupSpaceId !== prevSelectedSpaceRef.current) {
      prevSelectedSpaceRef.current = selectedClickupSpaceId;
      setSpaceIdInput(selectedClickupSpaceId);
      return;
    }
    prevSelectedSpaceRef.current = selectedClickupSpaceId;
    if (!spaceIdInput) {
      if (selectedClickupSpaceId) {
        setSpaceIdInput(selectedClickupSpaceId);
      } else if (clickupSpaces.length > 0) {
        setSpaceIdInput(clickupSpaces[0].id);
      }
    }
  }, [selectedClickupSpaceId, clickupSpaces, spaceIdInput]);

  const webhookStatusLoaded = clickupWebhookStatus !== null;
  const webhookRegistered = Boolean(clickupWebhookStatus?.registered);
  const step1Done = isClickupConnected;
  const step2Done = step1Done && (hasSynced || webhookRegistered || tasks.some(t => Boolean(t?.clickupTaskId)));
  const step3Done = webhookRegistered;
  const totalSteps = isSuperadmin ? 3 : 2;
  const allComplete = step1Done && step2Done && (!isSuperadmin || step3Done);
  const shouldShow = Boolean(currentUser) && (forceOpen || (!dismissed && !allComplete));

  useEffect(() => {
    if (!shouldShow || !currentUser || !step1Done) return;
    if (clickupMembers.length === 0 && membersLoadedForUserRef.current !== userId) {
      membersLoadedForUserRef.current = userId;
      loadClickupMembers('').catch(() => {});
    }
    if (isSuperadmin && !webhookStatusLoaded) {
      refreshClickupWebhookStatus().catch(() => {});
    }
  }, [shouldShow, currentUser, userId, step1Done, isSuperadmin, clickupMembers.length, loadClickupMembers, webhookStatusLoaded, refreshClickupWebhookStatus]);

  useEffect(() => {
    if (!isSuperadmin || !shouldShow || !userId || !step1Done || !step2Done) return;
    if (!webhookStatusLoaded || webhookRegistered || webhookNonFatalDone) return;
    if (autoWebhookAttemptedRef.current === userId) return;

    autoWebhookAttemptedRef.current = userId;
    setRegisteringWebhook(true);
    registerClickupWebhook()
      .then(res => {
        if (!isMountedRef.current || autoWebhookAttemptedRef.current !== userId) return;
        if (res.success) {
          setWebhookNotice(res.message || 'Webhook enabled');
        } else {
          setWebhookNonFatalDone(true);
          setWebhookNotice(
            res.message || 'Webhook requires ClickUp admin rights; manual sync remains available.'
          );
        }
      })
      .catch(err => {
        if (!isMountedRef.current || autoWebhookAttemptedRef.current !== userId) return;
        setWebhookNonFatalDone(true);
        setWebhookNotice(
          err?.message || 'Webhook requires ClickUp admin rights; manual sync remains available.'
        );
      })
      .finally(() => {
        if (isMountedRef.current) setRegisteringWebhook(false);
      });
  }, [shouldShow, userId, step1Done, step2Done, webhookStatusLoaded, webhookRegistered, webhookNonFatalDone, registerClickupWebhook]);

  if (!shouldShow || !currentUser) return null;

  const matchedMember = clickupMembers.find(
    m => m.email?.toLowerCase() === currentUser.email.toLowerCase()
  );

  const completedCount = (isSuperadmin ? [step1Done, step2Done, step3Done] : [step1Done, step2Done]).filter(Boolean).length;
  const showCompactStrip = !forceOpen && !isExpanded && step1Done;

  const handleDismiss = () => {
    try {
      localStorage.setItem(`${DISMISS_PREFIX}${currentUser.id}`, 'true');
    } catch {}
    setDismissed(true);
    setIsExpanded(false);
    onCloseForceOpen();
  };

  const handleConnectKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setConnectingKey(true);
    setKeyError(null);
    try {
      const res = await connectClickup(apiKeyInput.trim());
      if (res.success) {
        setApiKeyInput('');
        setIsExpanded(true);
      } else {
        setKeyError(res.error || 'Could not verify ClickUp API key');
      }
    } catch (err: any) {
      setKeyError(err?.message || 'Could not verify ClickUp API key');
    } finally {
      setConnectingKey(false);
    }
  };

  const handleSyncSpace = async () => {
    setSyncingTasks(true);
    setSyncNotice(null);
    try {
      if (matchedMember && matchedMember.id !== currentUser.clickupUserId) {
        await updateUserProfile(currentUser.id, {
          clickupUserId: matchedMember.id,
          clickupUsername: matchedMember.username,
        });
      }
      const chosenId = spaceIdInput || selectedClickupSpaceId || clickupSpaces[0]?.id;
      if (chosenId) {
        const chosenSpace = clickupSpaces.find(s => s.id === chosenId);
        await setSelectedClickupSpaceId(chosenId, chosenSpace?.name);
      }
      const result = await syncUserTasksWithClickUp(currentUser.id);
      if (result.success) {
        try {
          localStorage.setItem(`${SYNCED_PREFIX}${currentUser.id}`, 'true');
        } catch {}
        setHasSynced(true);
        setSyncNotice(result.message || `Synced ${result.syncedCount} task(s)`);
      } else {
        setSyncNotice(result.message || 'Sync did not finish');
      }
    } catch (err: any) {
      setSyncNotice(err?.message || 'Failed to sync tasks');
    } finally {
      setSyncingTasks(false);
    }
  };

  const handleManualWebhook = async () => {
    setRegisteringWebhook(true);
    setWebhookNotice(null);
    try {
      const res = await registerClickupWebhook();
      if (res.success) {
        setWebhookNotice(res.message || 'Webhook enabled');
      } else {
        setWebhookNonFatalDone(true);
        setWebhookNotice(res.message || 'Webhook requires ClickUp admin rights; manual sync remains active.');
      }
    } catch (err: any) {
      setWebhookNonFatalDone(true);
      setWebhookNotice(err?.message || 'Webhook requires ClickUp admin rights; manual sync remains active.');
    } finally {
      setRegisteringWebhook(false);
    }
  };

  if (showCompactStrip) {
    return (
      <section
        id="workspace-onboarding-checklist"
        aria-label="Workspace Setup"
        className={`mb-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 flex-wrap items-center justify-between gap-2 text-xs ${
          forceOpen ? 'flex' : 'hidden sm:flex'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-400 shrink-0" />
          <span className="font-semibold text-[var(--text-primary)]">ClickUp setup:</span>
          <span className="tabular-nums text-[var(--text-secondary)]">
            {completedCount}/{totalSteps} complete
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="mobile-tap-control rounded-[5px] border border-[var(--border)] bg-[var(--surface-subtle)] hover:bg-[var(--border)] px-2.5 py-1 sm:min-h-0 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400 transition-colors cursor-pointer"
          >
            Finish setup
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss workspace setup"
            className="mobile-tap-control inline-flex items-center gap-1 rounded-[5px] px-2 py-1 sm:min-h-0 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <span>Skip for now</span>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      id="workspace-onboarding-checklist"
      aria-label="Workspace Setup"
      className={`ledger-frame mb-4 ${forceOpen ? 'block' : 'hidden sm:block'}`}
    >
      <div className="ledger-band flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <p className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">Workspace Setup</p>
          <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
            {completedCount}/{totalSteps} complete
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!forceOpen && step1Done && (
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="mobile-tap-control rounded-[5px] px-2 py-1 sm:min-h-0 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              Collapse
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="mobile-tap-control inline-flex items-center gap-1 rounded-[5px] px-2 py-1 sm:min-h-0 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <span>{allComplete ? 'Close' : 'Skip for now'}</span>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-[var(--border-subtle)]">
        {/* Step 1 */}
        <div className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                step1Done
                  ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {step1Done ? <Check className="h-3 w-3" /> : '1'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <KeyRound className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span>Add personal ClickUp API key</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {step1Done ? (
                  'Connected and verified against ClickUp.'
                ) : (
                  <>
                    Unlocks your ClickUp spaces, member mapping, and task sync. Find your token in ClickUp under{' '}
                    <strong className="text-[var(--text-primary)] font-semibold">Settings → Apps → API Token → Generate</strong>{' '}
                    <a
                      href="https://app.clickup.com/settings/apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline"
                    >
                      <span>Open ClickUp</span>
                      <ExternalLink aria-hidden="true" className="h-3 w-3" />
                    </a>
                  </>
                )}
              </p>
              {keyError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{keyError}</p>}
            </div>
          </div>

          {!step1Done && (
            <form onSubmit={handleConnectKey} className="flex items-center gap-2 shrink-0">
              <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="pk_..."
                aria-label="Personal ClickUp API key"
                className="field-control w-48 font-mono"
              />
              <button
                type="submit"
                disabled={connectingKey || !apiKeyInput.trim()}
                className="button-primary shrink-0"
              >
                {connectingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Connect'}
              </button>
            </form>
          )}
        </div>

        {/* Step 2 */}
        <div className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                step2Done
                  ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {step2Done ? <Check className="h-3 w-3" /> : '2'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <FolderKanban className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span>Confirm ClickUp Space &amp; sync tasks</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {!step1Done
                  ? 'Complete Step 1 first to load available spaces.'
                  : matchedMember
                  ? `Matched ClickUp profile: ${matchedMember.username || matchedMember.email}`
                  : 'Select your default delivery space and send your zenFlow tasks to ClickUp.'}
              </p>
              {syncNotice && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">{syncNotice}</p>
              )}
            </div>
          </div>

          {step1Done && (
            <div className="flex items-center gap-2 shrink-0">
              {clickupSpaces.length > 0 && (
                <div className="relative">
                  <select
                    aria-label="Default ClickUp Space"
                    value={spaceIdInput}
                    onChange={e => setSpaceIdInput(e.target.value)}
                    className="field-control max-w-[180px] pr-7"
                  >
                    {clickupSpaces.map(sp => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                </div>
              )}
              <button
                type="button"
                disabled={syncingTasks}
                onClick={handleSyncSpace}
                className="button-secondary shrink-0"
              >
                {syncingTasks ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Syncing</span>
                  </>
                ) : step2Done ? (
                  'Sync Again'
                ) : (
                  'Sync Tasks'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Step 3 (Superadmin workspace webhook) */}
        {isSuperadmin && (
        <div className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                step3Done
                  ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {step3Done ? <Check className="h-3 w-3" /> : '3'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <Webhook className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span>Enable real-time ClickUp webhook</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {clickupWebhookStatus?.registered
                  ? 'Real-time updates active for workspace changes.'
                  : webhookNotice || 'Runs automatically once a key is connected and workspace webhook is unset.'}
              </p>
            </div>
          </div>

          {step1Done && !clickupWebhookStatus?.registered && (
            <button
              type="button"
              disabled={registeringWebhook}
              onClick={handleManualWebhook}
              className="button-secondary shrink-0"
            >
              {registeringWebhook ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Enabling</span>
                </>
              ) : webhookNonFatalDone ? (
                'Retry Webhook'
              ) : (
                'Enable Webhook'
              )}
            </button>
          )}
        </div>
        )}
      </div>
    </section>
  );
};
