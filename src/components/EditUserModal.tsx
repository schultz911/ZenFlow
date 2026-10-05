import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { User, Role } from '../types';
import {
  X,
  UserCog,
  Palette,
  FileText,
  Crown,
  ShieldCheck,
  Loader2,
  Link2,
  Mail,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { ClickupMemberPicker } from './ClickupMemberPicker';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const {
    updateUserProfile,
    isSuperadmin,
    creativeDirectors,
    canManageMembers,
    clickupMembers,
    loadClickupMembers,
    isClickupConnected,
    clickupApiKey,
    users,
    tasks,
    remapUserTasks,
  } = useDashboard();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('content');
  const [isCD, setIsCD] = useState(false);
  const [selectedCDId, setSelectedCDId] = useState<string>('');
  const [clickupUserId, setClickupUserId] = useState<string>('');
  const [clickupUsername, setClickupUsername] = useState<string>('');
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Task remapping tool state
  const [showRemapTool, setShowRemapTool] = useState(false);
  const [remapSourceUserId, setRemapSourceUserId] = useState<string>('');
  const [remapDeleteSource, setRemapDeleteSource] = useState(false);
  const [isRemapping, setIsRemapping] = useState(false);
  const [remapStatusMessage, setRemapStatusMessage] = useState<string | null>(null);

  // Sync state whenever user changes or modal opens
  useEffect(() => {
    if (user && isOpen) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role);
      setIsCD(!!user.isCreativeDirector);
      setSelectedCDId(user.creativeDirectorId || '');
      setClickupUserId(user.clickupUserId || '');
      setClickupUsername(user.clickupUsername || '');
      setError(null);
      setShowRemapTool(false);
      setRemapSourceUserId('');
      setRemapDeleteSource(false);
      setRemapStatusMessage(null);

      // Auto-load ClickUp members if empty
      if (clickupMembers.length === 0 && (isClickupConnected || clickupApiKey)) {
        setIsLoadingMembers(true);
        loadClickupMembers(clickupApiKey).finally(() => setIsLoadingMembers(false));
      }
    }
  }, [user, isOpen, clickupMembers.length, isClickupConnected, clickupApiKey, loadClickupMembers]);

  // Global Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isRemapping) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, isRemapping, onClose]);

  const isTargetSuperadmin = Boolean(user?.email && user.email.toLowerCase() === 'kiran.s@zensciences.com');
  const cleanCurrentEmail = email.trim().toLowerCase();
  const isEmailChanged = Boolean(user && isSuperadmin && !isTargetSuperadmin && cleanCurrentEmail !== (user.email || '').toLowerCase());
  const duplicateTarget = (isEmailChanged && user)
    ? users.find(u => u.id !== user.id && u.email.toLowerCase().trim() === cleanCurrentEmail)
    : null;
  const userTasksCount = user ? tasks.filter(t => t.userId === user.id).length : 0;
  const duplicateUserTasksCount = duplicateTarget
    ? tasks.filter(t => t.userId === duplicateTarget.id).length
    : 0;

  // Other users for explicit task remapping
  const otherUsers = user ? users.filter(u => u.id !== user.id) : [];
  const selectedSourceTaskCount = remapSourceUserId
    ? tasks.filter(t => t.userId === remapSourceUserId).length
    : 0;

  const handleExecuteRemap = async () => {
    if (!remapSourceUserId || !user) return;
    setIsRemapping(true);
    setRemapStatusMessage(null);
    setError(null);
    try {
      const res = await remapUserTasks(remapSourceUserId, user.id, remapDeleteSource);
      if (res.success) {
        setRemapStatusMessage(`Successfully remapped ${res.remappedCount} task(s) to ${user.name}!`);
        setRemapSourceUserId('');
      } else {
        setError(res.error || 'Failed to remap tasks');
      }
    } catch (err: any) {
      setError(err.message || 'Error remapping tasks');
    } finally {
      setIsRemapping(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please enter a valid full name');
      return;
    }

    const updates: Partial<User> = {
      name: cleanName,
      role,
      clickupUserId: clickupUserId || undefined,
      clickupUsername: clickupUsername || undefined,
    };

    if (isSuperadmin && !isTargetSuperadmin) {
      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        setError('Please enter a valid email address');
        return;
      }
      updates.email = cleanEmail;
    }

    // Only Superadmin can change Creative Director status
    if (isSuperadmin) {
      updates.isCreativeDirector = isTargetSuperadmin ? true : isCD;
    }

    // Assign CD ID if not CD
    if (isCD || (isSuperadmin && isTargetSuperadmin)) {
      updates.creativeDirectorId = undefined;
    } else {
      updates.creativeDirectorId = selectedCDId || undefined;
    }

    setIsSubmitting(true);
    try {
      await updateUserProfile(user.id, updates);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update member profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && user && canManageMembers && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSubmitting && !isRemapping) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            id="edit-user-modal"
            className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#111111] shadow-2xl p-6 text-neutral-900 dark:text-white transition-all"
          >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Edit Team Member
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40">
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting || isRemapping}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Email Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40">
                Email Address
              </label>
              {isSuperadmin && !isTargetSuperadmin && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-2 py-0.5 font-semibold border border-amber-500/20">
                  <KeyRound className="w-3 h-3" />
                  Superadmin Editable
                </span>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                disabled={!isSuperadmin || isTargetSuperadmin}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. member@zensciences.com"
                className={`w-full rounded-xl pl-9 pr-3 py-2 text-sm transition-colors ${
                  isSuperadmin && !isTargetSuperadmin
                    ? 'border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
                    : 'border border-neutral-200 dark:border-white/5 bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 cursor-not-allowed'
                }`}
              />
            </div>

            {isTargetSuperadmin ? (
              <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                The primary Superadmin email address is the root workspace anchor and cannot be modified.
              </p>
            ) : isSuperadmin ? (
              <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                As Superadmin, you can correct mistyped emails. Any tasks mapped to the wrong email will be preserved and remapped.
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                Registered email is anchored to Google Workspace authentication. Only the Superadmin can edit it.
              </p>
            )}

            {/* Real-time Email Change / Conflict Indicator */}
            {isSuperadmin && !isTargetSuperadmin && cleanCurrentEmail !== user.email.toLowerCase() && (
              <div className="mt-2.5">
                {duplicateTarget ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      <span>Existing Account Detected ({duplicateTarget.name})</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/90">
                      An account with email <strong>{duplicateTarget.email}</strong> already exists on the board ({duplicateUserTasksCount} tasks).
                      Saving will <strong>merge these profiles</strong> and automatically <strong>remap all {userTasksCount} task(s)</strong> from this profile to <strong>{duplicateTarget.name}</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2 animate-in fade-in duration-150">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-500" />
                    <span>Email will be updated to <strong>{cleanCurrentEmail}</strong>. All {userTasksCount} task(s) remain safely mapped.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Workspace Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('content')}
                className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  role === 'content'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500'
                    : 'border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] text-neutral-600 dark:text-white/60 hover:border-neutral-300'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Content & Copy</span>
              </button>

              <button
                type="button"
                onClick={() => setRole('design')}
                className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  role === 'design'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500'
                    : 'border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] text-neutral-600 dark:text-white/60 hover:border-neutral-300'
                }`}
              >
                <Palette className="h-4 w-4" />
                <span>Design</span>
              </button>
            </div>
          </div>

          {/* Creative Director Status (Only editable by Superadmin) */}
          {isSuperadmin && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-50/30 dark:bg-purple-950/10 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTargetSuperadmin ? true : isCD}
                  disabled={isTargetSuperadmin}
                  onChange={e => setIsCD(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300 dark:border-neutral-700 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-900 dark:text-purple-300">
                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                    <span>Creative Director Privileges</span>
                    {isTargetSuperadmin && (
                      <span className="text-[10px] bg-purple-200 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 px-1.5 py-0.2 rounded font-bold">
                        Superadmin
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-white/50 mt-0.5 leading-relaxed">
                    {isTargetSuperadmin
                      ? 'The Superadmin account permanently retains full Creative Director permissions across all team boards.'
                      : 'Creative Directors manage their own team board, assign tasks, and access executive workspace analytics.'}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Assigned Creative Director Dropdown (if not a CD) */}
          {!isCD && !isTargetSuperadmin && (
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Assigned Team Board (Creative Director)
              </label>
              <select
                value={selectedCDId}
                onChange={e => setSelectedCDId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Independent / Direct Board</option>
                {creativeDirectors
                  .filter(cd => cd.id !== user.id)
                  .map(cd => (
                    <option key={cd.id} value={cd.id}>
                      {cd.name} ({cd.email})
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                This member will appear on the selected Creative Director's team board view.
              </p>
            </div>
          )}

          {/* ClickUp Member Mapping */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/10 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                  <Link2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-900 dark:text-white">
                    ClickUp Member Mapping
                  </label>
                  <p className="text-[10px] text-neutral-500 dark:text-white/40">
                    Map to ClickUp profile so tasks are assigned to the right person.
                  </p>
                </div>
              </div>
              {isLoadingMembers && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
              )}
            </div>

            <ClickupMemberPicker
              members={clickupMembers}
              selectedMemberId={clickupUserId}
              isLoading={isLoadingMembers}
              onRefresh={async () => {
                setIsLoadingMembers(true);
                await loadClickupMembers(clickupApiKey);
                setIsLoadingMembers(false);
              }}
              onSelect={member => {
                if (member) {
                  setClickupUserId(member.id);
                  setClickupUsername(member.username || '');
                } else {
                  setClickupUserId('');
                  setClickupUsername('');
                }
              }}
            />
          </div>

          {/* Superadmin Task Remapping & Transfer Section */}
          {isSuperadmin && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-50/20 dark:bg-purple-950/10 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowRemapTool(prev => !prev)}
                  className="flex items-center gap-2 text-xs font-semibold text-purple-900 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 transition-colors cursor-pointer text-left"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Task Remapping Tool</span>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-normal">
                    {showRemapTool ? '(Collapse)' : '(Remap tasks from another account)'}
                  </span>
                </button>
              </div>

              {showRemapTool && (
                <div className="pt-2 border-t border-purple-500/10 space-y-3 animate-in fade-in duration-150">
                  <p className="text-[11px] text-neutral-600 dark:text-white/60 leading-relaxed">
                    Transfer all tasks mapped to another member or mistaken email directly to <strong>{user.name}</strong>.
                  </p>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1">
                      Source Member / Account
                    </label>
                    <select
                      value={remapSourceUserId}
                      onChange={e => setRemapSourceUserId(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">-- Select member with misassigned tasks --</option>
                      {otherUsers.map(u => {
                        const count = tasks.filter(t => t.userId === u.id).length;
                        return (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email}) — {count} task(s)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {remapSourceUserId && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-white/70 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={remapDeleteSource}
                          onChange={e => setRemapDeleteSource(e.target.checked)}
                          className="rounded border-neutral-300 dark:border-neutral-700 text-purple-600 focus:ring-purple-500"
                        />
                        <span>Delete source member profile after transferring tasks</span>
                      </label>

                      <button
                        type="button"
                        disabled={isRemapping}
                        onClick={handleExecuteRemap}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 text-xs font-semibold shadow transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isRemapping ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Transferring tasks...</span>
                          </>
                        ) : (
                          <>
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>
                              Transfer Tasks to {user.name} ({selectedSourceTaskCount} task{selectedSourceTaskCount === 1 ? '' : 's'})
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {remapStatusMessage && (
                    <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2.5 text-xs text-green-700 dark:text-green-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500" />
                      <span>{remapStatusMessage}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isRemapping}
              className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#141414] px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-white/50 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="edit-user-submit-btn"
              disabled={isSubmitting || isRemapping || !name.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/20 hover:bg-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
};
