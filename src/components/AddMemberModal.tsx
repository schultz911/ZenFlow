import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserPlus, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth, useClickUp, useWorkspace } from '../context/DashboardContext';
import { Role } from '../types';
import { DialogPanel } from './ui/DialogPanel';
import { MemberRoleFields } from './forms/MemberRoleFields';
import { ClickupMemberPicker } from './ClickupMemberPicker';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillMember?: { name: string; email: string } | null;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose, prefillMember }) => {
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
    setName(prefillMember?.name || '');
    setEmail(prefillMember?.email || '');
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
  }, [isOpen, prefillMember, currentUser, isClickupConnected, loadClickupMembers]);

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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            id="add-member-modal"
            className="w-full max-w-lg my-auto flex flex-col overflow-hidden"
          >
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">Add Team Member</h2>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    Provision a team member, select roles, and configure permissions.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                aria-label="Close modal"
                className="icon-button shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                {error && (
                  <div role="alert" className="callout callout-danger flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="field-label" htmlFor="addmember-name">
                    Full Name
                  </label>
                  <input
                    id="addmember-name"
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Ananya Sharma"
                    className="field-control"
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="addmember-email">
                    Google Workspace Email
                  </label>
                  <input
                    id="addmember-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@zensciences.com"
                    className="field-control"
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
                    <label className="field-label">
                      Link ClickUp User (Optional)
                    </label>
                    <ClickupMemberPicker
                      members={clickupMembers}
                      selectedMemberId={selectedClickupUserId || undefined}
                      onSelect={member => setSelectedClickupUserId(member ? member.id : '')}
                    />
                  </div>
                )}

                <div className="callout callout-info flex items-start gap-2.5 text-[11px]">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    The new member will be able to sign in immediately using their registered Google email.
                  </p>
                </div>
              </div>

              <div className="dialog-footer">
                <button
                  type="button"
                  onClick={onClose}
                  className="button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="button-primary"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>{isSubmitting ? 'Adding...' : 'Add Team Member'}</span>
                </button>
              </div>
            </form>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
