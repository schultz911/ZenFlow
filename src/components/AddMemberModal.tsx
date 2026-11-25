import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserPlus, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth, useClickUp, useWorkspace } from '../context/DashboardContext';
import { Role } from '../types';
import { DialogPanel } from './ui/DialogPanel';
import { MemberRoleFields } from './forms/MemberRoleFields';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, isSuperadmin, isAdministrator, canManageMembers } = useAuth();
  const { createUser, creativeDirectors, clusterLeads } = useWorkspace();
  const { isClickupConnected, clickupMembers, loadClickupMembers } = useClickUp();

  const canAssignAdmin = isSuperadmin || isAdministrator;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role | undefined>('content');
  const [isAdministratorPrivilege, setIsAdministratorPrivilege] = useState(false);
  const [isBusinessLead, setIsBusinessLead] = useState(false);
  const [isCreativeDirector, setIsCreativeDirector] = useState(false);
  const [isClusterLead, setIsClusterLead] = useState(false);
  const [isTeamLead, setIsTeamLead] = useState(false);
  const [creativeDirectorId, setCreativeDirectorId] = useState('');
  const [clusterLeadId, setClusterLeadId] = useState('');
  const [selectedClickupUserId, setSelectedClickupUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setEmail('');
    setRole('content');
    setIsAdministratorPrivilege(false);
    setIsBusinessLead(false);
    setIsCreativeDirector(false);
    setIsClusterLead(false);
    setIsTeamLead(false);
    setCreativeDirectorId(currentUser?.isCreativeDirector ? currentUser.id : currentUser?.creativeDirectorId || '');
    setClusterLeadId(currentUser?.isClusterLead ? currentUser.id : currentUser?.clusterLeadId || '');
    setSelectedClickupUserId('');
    setError(null);
    if (isClickupConnected) {
      loadClickupMembers('');
    }
  }, [isOpen, currentUser, isClickupConnected, loadClickupMembers]);

  useEffect(() => {
    if (!email.trim() || clickupMembers.length === 0) return;
    const cleanEmail = email.trim().toLowerCase();
    const match = clickupMembers.find(m => m.email?.toLowerCase() === cleanEmail);
    if (match) setSelectedClickupUserId(match.id);
  }, [email, clickupMembers]);

  if (!canManageMembers) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Full name is required');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('A valid email address is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const designationLabel = isBusinessLead
        ? 'Business Lead'
        : isCreativeDirector
        ? 'Creative Director'
        : isClusterLead
        ? 'Cluster Lead'
        : isTeamLead
        ? 'Team Lead'
        : role === 'account_manager'
        ? 'Account Manager'
        : isAdministratorPrivilege
        ? 'Administrator'
        : undefined;

      const matchedClickup = clickupMembers.find(m => m.id === selectedClickupUserId);

      await createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        isAdministrator: isAdministratorPrivilege || undefined,
        isBusinessLead: isBusinessLead || undefined,
        isCreativeDirector: isCreativeDirector || undefined,
        isClusterLead: isClusterLead || undefined,
        isTeamLead: isTeamLead || undefined,
        isAccountManager: role === 'account_manager' || undefined,
        designation: designationLabel,
        creativeDirectorId: isBusinessLead ? undefined : creativeDirectorId || undefined,
        clusterLeadId: isBusinessLead ? undefined : clusterLeadId || undefined,
        clickupUserId: selectedClickupUserId || undefined,
        clickupUsername: matchedClickup?.username || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create member');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSubmitting) onClose();
          }}
        >
          <DialogPanel
            aria-label="Add team member"
            onClose={onClose}
            busy={isSubmitting}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            id="add-member-modal"
            className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 my-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Add Team Member</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Provision a team member, select roles, and configure permissions.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={isSubmitting}
                aria-label="Close modal"
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="pt-4 space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1 block" htmlFor="addmember-name">
                  Full Name
                </label>
                <input
                  id="addmember-name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Ananya Sharma"
                  className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] px-3 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1 block" htmlFor="addmember-email">
                  Google Workspace Email
                </label>
                <input
                  id="addmember-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@zensciences.com"
                  className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] px-3 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <MemberRoleFields
                idPrefix="addmember"
                role={role}
                onChangeRole={setRole}
                isAdministrator={isAdministratorPrivilege}
                onChangeAdministrator={setIsAdministratorPrivilege}
                canAssignAdmin={canAssignAdmin}
                isBusinessLead={isBusinessLead}
                onChangeBusinessLead={checked => {
                  setIsBusinessLead(checked);
                  if (checked) {
                    setCreativeDirectorId('');
                    setClusterLeadId('');
                  }
                }}
                isCreativeDirector={isCreativeDirector}
                onChangeCreativeDirector={setIsCreativeDirector}
                isClusterLead={isClusterLead}
                onChangeClusterLead={setIsClusterLead}
                isTeamLead={isTeamLead}
                onChangeTeamLead={setIsTeamLead}
                creativeDirectorId={creativeDirectorId}
                onChangeCreativeDirectorId={setCreativeDirectorId}
                clusterLeadId={clusterLeadId}
                onChangeClusterLeadId={setClusterLeadId}
                creativeDirectors={creativeDirectors}
                clusterLeads={clusterLeads}
              />

              {isClickupConnected && clickupMembers.length > 0 && (
                <div>
                  <label className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1 block" htmlFor="addmember-clickup">
                    Link ClickUp User (Optional)
                  </label>
                  <select
                    id="addmember-clickup"
                    value={selectedClickupUserId}
                    onChange={e => setSelectedClickupUserId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">— Auto-match by email —</option>
                    {clickupMembers.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.username} ({m.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border)] px-3.5 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>{isSubmitting ? 'Adding...' : 'Add Team Member'}</span>
                </button>
              </div>
            </form>

            {isClickupConnected && (
              <div className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3 flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-[var(--text-secondary)]">
                  The new member will be able to sign in immediately using their registered Google email.
                </p>
              </div>
            )}
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
