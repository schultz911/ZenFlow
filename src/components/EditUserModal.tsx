import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, useClickUp, useWorkspace } from '../context/DashboardContext';
import { isSuperadmin as isSuperadminUser } from '../domain/permissions';
import { User, Role } from '../types';
import { ClickupMemberPicker } from './ClickupMemberPicker';
import { MemberRoleFields } from './forms/MemberRoleFields';
import { isTaskAssignedToUser } from '../utils/workload';
import {
  X,
  UserCog,
  ShieldCheck,
  Loader2,
  Mail,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  ChevronDown,
} from 'lucide-react';

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
    isSuperadmin,
    isAdministrator,
    canManageMembers,
  } = useAuth();
  const {
    updateUserProfile,
    creativeDirectors,
    clusterLeads,
    users,
    tasks,
    remapUserTasks,
  } = useWorkspace();
  const {
    isClickupConnected,
    clickupMembers,
    loadClickupMembers,
  } = useClickUp();

  const canAssignAdmin = isSuperadmin || isAdministrator;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role | undefined>('content');
  const [isAdminPrivilege, setIsAdminPrivilege] = useState(false);

  // Special Roles
  const [isBusinessLead, setIsBusinessLead] = useState(false);
  const [isCD, setIsCD] = useState(false);
  const [isClusterLead, setIsClusterLead] = useState(false);
  const [isTeamLead, setIsTeamLead] = useState(false);

  // Assigned Leaders & ClickUp mapping
  const [selectedCDId, setSelectedCDId] = useState<string>('');
  const [selectedClusterLeadId, setSelectedClusterLeadId] = useState<string>('');
  const [clickupUserId, setClickupUserId] = useState<string>('');
  const [clickupUsername, setClickupUsername] = useState<string>('');

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
      setIsAdminPrivilege(Boolean(user.isAdministrator || user.role === 'administrator'));
      setIsBusinessLead(Boolean(user.isBusinessLead || user.designation === 'business_lead' || user.designation === 'Business Lead'));
      setIsCD(Boolean(user.isCreativeDirector));
      setIsClusterLead(Boolean(user.isClusterLead));
      setIsTeamLead(Boolean(user.isTeamLead || user.designation === 'team_lead' || user.designation === 'Team Lead'));
      setSelectedCDId(user.creativeDirectorId || '');
      setSelectedClusterLeadId(user.clusterLeadId || '');
      setClickupUserId(user.clickupUserId || '');
      setClickupUsername(user.clickupUsername || '');
      setError(null);
      setShowRemapTool(false);
      setRemapSourceUserId('');
      setRemapDeleteSource(false);
      setRemapStatusMessage(null);
    }
  }, [user, isOpen]);

  const isTargetSuperadmin = isSuperadminUser(user);
  const cleanCurrentEmail = email.trim().toLowerCase();
  const isEmailChanged = Boolean(user && isSuperadmin && !isTargetSuperadmin && cleanCurrentEmail !== (user.email || '').toLowerCase());
  const duplicateTarget = (isEmailChanged && user)
    ? users.find(u => u.id !== user.id && (u.email || '').toLowerCase().trim() === cleanCurrentEmail)
    : null;
  const userTasksCount = user ? tasks.filter(t => isTaskAssignedToUser(t, user.id)).length : 0;
  const duplicateUserTasksCount = duplicateTarget
    ? tasks.filter(t => isTaskAssignedToUser(t, duplicateTarget.id)).length
    : 0;

  // Other users for explicit task remapping
  const otherUsers = user ? users.filter(u => u.id !== user.id) : [];
  const selectedSourceTaskCount = remapSourceUserId
    ? tasks.filter(t => isTaskAssignedToUser(t, remapSourceUserId)).length
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

    const isAccountMgr = role === 'account_manager';
    const designation = isBusinessLead
      ? 'Business Lead'
      : isCD
      ? 'Creative Director'
      : isClusterLead
      ? 'Cluster Lead'
      : isTeamLead
      ? 'Team Lead'
      : isAccountMgr
      ? 'Account Manager'
      : isAdminPrivilege
      ? 'Administrator'
      : undefined;

    const updates: Partial<User> = {
      name: cleanName,
      role: role || undefined,
      isAdministrator: isAdminPrivilege,
      isBusinessLead,
      isCreativeDirector: isTargetSuperadmin ? true : isCD,
      isClusterLead,
      isTeamLead,
      isAccountManager: isAccountMgr,
      designation,
      clickupUserId: clickupUserId || undefined,
      clickupUsername: clickupUsername || undefined,
    };

    if (!canAssignAdmin) {
      delete updates.isAdministrator;
      delete updates.isBusinessLead;
      delete updates.isCreativeDirector;
      delete updates.isClusterLead;
      delete updates.designation;
    }

    if (isSuperadmin && !isTargetSuperadmin) {
      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        setError('Please enter a valid email address');
        return;
      }
      updates.email = cleanEmail;
    }

    // Assign CD ID if not CD and not Business Lead
    if (isCD || isBusinessLead || (isSuperadmin && isTargetSuperadmin)) {
      updates.creativeDirectorId = undefined;
    } else {
      updates.creativeDirectorId = selectedCDId || undefined;
    }

    // Assign Cluster Lead ID if not Cluster Lead and not Business Lead
    if (isClusterLead || isBusinessLead) {
      updates.clusterLeadId = undefined;
    } else {
      updates.clusterLeadId = selectedClusterLeadId || undefined;
    }

    if (!role && !isBusinessLead && !isCD && (user.role || user.isBusinessLead || user.isCreativeDirector)) {
      setError('Choose a team for this member.');
      return;
    }

    if (isTeamLead && role !== 'content' && role !== 'design') {
      setError('Choose Content or Design for a Team Lead.');
      return;
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
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSubmitting && !isRemapping) onClose();
          }}
        >
          <DialogPanel aria-label="Edit team member" onClose={onClose} busy={isSubmitting || isRemapping}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            id="edit-user-modal"
            className="w-full max-w-lg my-auto flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                  <UserCog className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                    Edit Team Member
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={onClose}
                disabled={isSubmitting || isRemapping}
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                {error && (
                  <div role="alert" className="callout callout-danger">
                    {error}
                  </div>
                )}

                {/* Email Address */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="field-label !mb-0" htmlFor="editusermodal-field-1">
                      Email Address
                    </label>
                    {isSuperadmin && !isTargetSuperadmin && (
                      <span className="inline-flex items-center gap-1 rounded-[5px] bg-amber-600/10 text-amber-700 dark:text-amber-400 text-[10.5px] px-1.5 py-0.5 font-semibold border border-amber-600/25">
                        <KeyRound className="w-3 h-3" />
                        <span>Superadmin Editable</span>
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                      <Mail className="h-3.5 w-3.5" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      disabled={!isSuperadmin || isTargetSuperadmin}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="e.g. member@zensciences.com"
                      className="field-control pl-9"
                      id="editusermodal-field-1"
                    />
                  </div>

                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {isTargetSuperadmin
                      ? 'The primary Superadmin email address is the root workspace anchor and cannot be modified.'
                      : isSuperadmin
                      ? 'As Superadmin, you can correct mistyped emails. Mapped tasks are preserved and remapped.'
                      : 'Registered email is anchored to Google Workspace authentication. Only the Superadmin can edit it.'}
                  </p>

                  {/* Real-time Email Change / Conflict Indicator */}
                  {isSuperadmin && !isTargetSuperadmin && user && cleanCurrentEmail !== (user.email || '').toLowerCase() && (
                    <div className="mt-2.5">
                      {duplicateTarget ? (
                        <div className="callout callout-warning space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>Existing Account Detected ({duplicateTarget.name})</span>
                          </div>
                          <p className="text-[11px] leading-relaxed opacity-90">
                            An account with email <strong>{duplicateTarget.email}</strong> already exists ({duplicateUserTasksCount} tasks).
                            Saving will <strong>merge these profiles</strong> and remap all {userTasksCount} task(s) to <strong>{duplicateTarget.name}</strong>.
                          </p>
                        </div>
                      ) : (
                        <div className="callout callout-info flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>Email will be updated to <strong>{cleanCurrentEmail}</strong>. All {userTasksCount} task(s) remain safely mapped.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Full Name */}
                <div>
                  <label className="field-label" htmlFor="editusermodal-field-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="field-control"
                    id="editusermodal-field-2"
                  />
                </div>

                <MemberRoleFields
                  idPrefix="edituser"
                  role={role}
                  onChangeRole={setRole}
                  isAdministrator={isAdminPrivilege}
                  onChangeAdministrator={setIsAdminPrivilege}
                  canAssignAdmin={canAssignAdmin}
                  isTargetSuperadmin={isTargetSuperadmin}
                  isBusinessLead={isBusinessLead}
                  onChangeBusinessLead={checked => {
                    setIsBusinessLead(checked);
                    if (checked) {
                      setSelectedCDId('');
                      setSelectedClusterLeadId('');
                    }
                  }}
                  isCreativeDirector={isCD}
                  onChangeCreativeDirector={setIsCD}
                  isClusterLead={isClusterLead}
                  onChangeClusterLead={setIsClusterLead}
                  isTeamLead={isTeamLead}
                  onChangeTeamLead={setIsTeamLead}
                  creativeDirectorId={selectedCDId}
                  onChangeCreativeDirectorId={setSelectedCDId}
                  clusterLeadId={selectedClusterLeadId}
                  onChangeClusterLeadId={setSelectedClusterLeadId}
                  creativeDirectors={creativeDirectors}
                  clusterLeads={clusterLeads}
                  excludeUserId={user.id}
                />

                {/* ClickUp Workspace Member Mapping */}
                {isClickupConnected && (
                  <div>
                    <label htmlFor="editusermodal-clickup-search" className="field-label">
                      ClickUp Member Mapping
                    </label>
                    <ClickupMemberPicker
                      inputId="editusermodal-clickup-search"
                      members={clickupMembers}
                      selectedMemberId={clickupUserId || undefined}
                      onRefresh={loadClickupMembers}
                      onSelect={member => {
                        setClickupUserId(member ? member.id : '');
                        setClickupUsername(member ? member.username : '');
                      }}
                    />
                  </div>
                )}

                {/* Superadmin Task Remapping & Transfer Section */}
                {isSuperadmin && (
                  <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowRemapTool(prev => !prev)}
                      className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer text-left"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
                        <span>Task Remapping Tool</span>
                      </span>
                      <span className="text-[11px] font-medium text-[var(--text-secondary)] shrink-0">
                        {showRemapTool ? 'Collapse' : 'Remap from another account'}
                      </span>
                    </button>

                    {showRemapTool && (
                      <div className="p-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface)] space-y-3">
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          Transfer all tasks mapped to another member or mistaken email directly to <strong className="text-[var(--text-primary)]">{user.name}</strong>.
                        </p>

                        <div>
                          <label className="field-label" htmlFor="editusermodal-field-5">
                            Source Member / Account
                          </label>
                          <div className="relative">
                            <select
                              value={remapSourceUserId}
                              onChange={e => setRemapSourceUserId(e.target.value)}
                              className="field-control pr-8 cursor-pointer"
                              id="editusermodal-field-5"
                            >
                              <option value="">-- Select member with misassigned tasks --</option>
                              {otherUsers.map(u => {
                                const count = tasks.filter(t => isTaskAssignedToUser(t, u.id)).length;
                                return (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({u.email}) — {count} task(s)
                                  </option>
                                );
                              })}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                          </div>
                        </div>

                        {remapSourceUserId && (
                          <div className="space-y-2.5">
                            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={remapDeleteSource}
                                onChange={e => setRemapDeleteSource(e.target.checked)}
                                className="rounded border-[var(--border)] h-3.5 w-3.5"
                              />
                              <span>Delete source member profile after transferring tasks</span>
                            </label>

                            <button
                              type="button"
                              disabled={isRemapping}
                              onClick={handleExecuteRemap}
                              className="button-primary w-full"
                            >
                              {isRemapping ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Transferring tasks...</span>
                                </>
                              ) : (
                                <>
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                  <span className="tabular-nums">
                                    Transfer Tasks to {user.name} ({selectedSourceTaskCount} task{selectedSourceTaskCount === 1 ? '' : 's'})
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {remapStatusMessage && (
                          <div role="status" className="callout callout-success flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{remapStatusMessage}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="dialog-footer">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting || isRemapping}
                  className="button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="edit-user-submit-btn"
                  disabled={isSubmitting || isRemapping || !name.trim()}
                  className="button-primary"
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
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
