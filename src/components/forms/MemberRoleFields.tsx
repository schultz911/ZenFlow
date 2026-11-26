import React from 'react';
import { Briefcase, ChevronDown, Crown, FileText, Lock, Palette, Shield, Users } from 'lucide-react';
import type { Role, User } from '../../types';

export interface MemberRoleFieldsProps {
  idPrefix: string;
  role: Role | undefined;
  onChangeRole: React.Dispatch<React.SetStateAction<Role | undefined>>;
  isAdministrator: boolean;
  onChangeAdministrator: (val: boolean) => void;
  canAssignAdmin: boolean;
  isTargetSuperadmin?: boolean;
  isBusinessLead: boolean;
  onChangeBusinessLead: (val: boolean) => void;
  isCreativeDirector: boolean;
  onChangeCreativeDirector: (val: boolean) => void;
  isClusterLead: boolean;
  onChangeClusterLead: (val: boolean) => void;
  isTeamLead: boolean;
  onChangeTeamLead: (val: boolean) => void;
  creativeDirectorId: string;
  onChangeCreativeDirectorId: (id: string) => void;
  clusterLeadId: string;
  onChangeClusterLeadId: (id: string) => void;
  creativeDirectors: User[];
  clusterLeads: User[];
  excludeUserId?: string;
}

const ROLE_OPTIONS: Array<{
  id: Role;
  label: string;
  desc: string;
  icon: React.ReactNode;
  tooltip: string;
}> = [
  {
    id: 'content',
    label: 'Content',
    desc: 'Writing & Concept',
    icon: <FileText className="h-4 w-4 text-blue-500" />,
    tooltip: 'Writing, editorial, and content strategy team',
  },
  {
    id: 'design',
    label: 'Design',
    desc: 'Adaptive & Visual',
    icon: <Palette className="h-4 w-4 text-indigo-500" />,
    tooltip: 'Visual design, branding, and graphic design team',
  },
  {
    id: 'account_manager',
    label: 'Accounts',
    desc: 'Client Servicing',
    icon: <Briefcase className="h-4 w-4 text-amber-500" />,
    tooltip: 'Client relationship management team (board viewing without task modification)',
  },
];

export const MemberRoleFields: React.FC<MemberRoleFieldsProps> = ({
  idPrefix,
  role,
  onChangeRole,
  isAdministrator,
  onChangeAdministrator,
  canAssignAdmin,
  isTargetSuperadmin = false,
  isBusinessLead,
  onChangeBusinessLead,
  isCreativeDirector,
  onChangeCreativeDirector,
  isClusterLead,
  onChangeClusterLead,
  isTeamLead,
  onChangeTeamLead,
  creativeDirectorId,
  onChangeCreativeDirectorId,
  clusterLeadId,
  onChangeClusterLeadId,
  creativeDirectors,
  clusterLeads,
  excludeUserId,
}) => {
  const availableCreativeDirectors = creativeDirectors.filter(cd => cd.id !== excludeUserId);
  const availableClusterLeads = clusterLeads.filter(cl => cl.id !== excludeUserId);

  return (
    <>
      {/* Administrator Privileges Toggle */}
      <div
        className={`rounded-[7px] border px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
          !canAssignAdmin
            ? 'opacity-50 bg-[var(--surface-subtle)] border-[var(--border)]'
            : isAdministrator
            ? 'border-red-600/35 bg-red-600/[0.06] dark:bg-red-500/10'
            : 'border-[var(--border)] bg-[var(--surface-muted)]'
        }`}
        title={
          canAssignAdmin
            ? 'Grant administrator privileges with full board and account access'
            : 'Administrator privileges are restricted to Superadmins and other Administrators'
        }
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-red-600/10 text-red-600 dark:text-red-400">
            <Shield className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Administrator Privileges</span>
              {!canAssignAdmin && <Lock className="w-3 h-3 text-[var(--text-muted)]" />}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              System &amp; Ops — Full board access, team management, and workspace settings
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            id={`toggle-${idPrefix}-admin-privilege`}
            disabled={!canAssignAdmin || isTargetSuperadmin}
            checked={isTargetSuperadmin ? true : isAdministrator}
            onChange={e => onChangeAdministrator(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-[var(--border)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--danger)]" />
        </label>
      </div>

      {/* Team Selection (optional) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="field-label !mb-0"
            title="Select the member's functional team (click selected team to deselect)"
          >
            Team
          </label>
          <span className="text-[11px] text-[var(--text-muted)]">
            {role ? 'Click selected to deselect' : 'No team selected'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ROLE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangeRole(prev => (prev === opt.id ? undefined : opt.id))}
              title={opt.tooltip}
              className={`flex items-start gap-2 rounded-[7px] border p-2.5 text-left transition-colors cursor-pointer ${
                role === opt.id
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div className="rounded-[5px] p-1 bg-[var(--surface-subtle)] border border-[var(--border-subtle)] shrink-0">{opt.icon}</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{opt.label}</p>
                <p className="text-[11px] text-[var(--text-secondary)] truncate">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Special Roles Selection */}
      <div>
        <label className="field-label">
          Special Roles
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Business Lead', checked: isBusinessLead, onChange: onChangeBusinessLead },
            { label: 'Creative Director', checked: isCreativeDirector, onChange: onChangeCreativeDirector },
            { label: 'Cluster Lead', checked: isClusterLead, onChange: onChangeClusterLead },
            { label: 'Team Lead', checked: isTeamLead, onChange: onChangeTeamLead },
          ].map(item => (
            <label
              key={item.label}
              className={`flex items-center gap-2 rounded-[7px] border px-2.5 py-2 cursor-pointer transition-colors ${
                item.checked
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={e => item.onChange(e.target.checked)}
                className="rounded border-[var(--border)] h-3.5 w-3.5"
              />
              <span className="text-xs font-medium text-[var(--text-primary)]">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Assigned Creative Director & Cluster Lead */}
      {!isBusinessLead && !isCreativeDirector && availableCreativeDirectors.length > 0 && (
        <div>
          <label
            className="field-label flex items-center gap-1"
            htmlFor={`${idPrefix}-cd-select`}
          >
            <Crown className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span>Assigned Creative Director</span>
          </label>
          <div className="relative">
            <select
              value={creativeDirectorId}
              onChange={e => onChangeCreativeDirectorId(e.target.value)}
              className="field-control pr-8 cursor-pointer"
              id={`${idPrefix}-cd-select`}
            >
              <option value="">— No Delivery Lead / Independent —</option>
              {availableCreativeDirectors.map(cd => (
                <option key={cd.id} value={cd.id}>
                  {cd.name} ({cd.role === 'design' ? 'Design' : cd.role === 'account_manager' ? 'Accounts' : 'Content'})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
            Boards follow the Creative Director as the delivery lead of a cluster.
          </p>
        </div>
      )}

      {!isBusinessLead && !isClusterLead && availableClusterLeads.length > 0 && (
        <div>
          <label
            className="field-label flex items-center gap-1"
            htmlFor={`${idPrefix}-cluster-select`}
          >
            <Users className="h-3 w-3 text-[#1d4ed8] dark:text-blue-400" />
            <span>Assigned Cluster Lead</span>
          </label>
          <div className="relative">
            <select
              value={clusterLeadId}
              onChange={e => onChangeClusterLeadId(e.target.value)}
              className="field-control pr-8 cursor-pointer"
              id={`${idPrefix}-cluster-select`}
            >
              <option value="">— No Cluster Lead Assigned —</option>
              {availableClusterLeads.map(cl => (
                <option key={cl.id} value={cl.id}>
                  {cl.name} ({cl.role === 'design' ? 'Design' : cl.role === 'account_manager' ? 'Accounts' : 'Content'})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          </div>
        </div>
      )}
    </>
  );
};
