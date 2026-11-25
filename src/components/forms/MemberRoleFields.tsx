import React from 'react';
import { Briefcase, Crown, FileText, Lock, Palette, Shield, Users } from 'lucide-react';
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
        className={`rounded-xl border p-3 flex items-center justify-between transition-all ${
          !canAssignAdmin
            ? 'opacity-50 bg-neutral-100/50 dark:bg-white/[0.02] border-[var(--border)]'
            : isAdministrator
            ? 'border-rose-500/40 bg-rose-500/5 dark:bg-rose-500/10'
            : 'border-[var(--border)] bg-[var(--surface)]'
        }`}
        title={
          canAssignAdmin
            ? 'Grant administrator privileges with full board and account access'
            : 'Administrator privileges are restricted to Superadmins and other Administrators'
        }
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5 bg-rose-500/10 text-rose-500">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-900 dark:text-white">Administrator Privileges</span>
              {!canAssignAdmin && <Lock className="w-3 h-3 text-neutral-400" />}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              System & Ops — Full board access, team management, and workspace settings
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            id={`toggle-${idPrefix}-admin-privilege`}
            disabled={!canAssignAdmin || isTargetSuperadmin}
            checked={isTargetSuperadmin ? true : isAdministrator}
            onChange={e => onChangeAdministrator(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600 disabled:cursor-not-allowed" />
        </label>
      </div>

      {/* Team Selection (optional) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)]"
            title="Select the member's functional team (click selected team to deselect)"
          >
            TEAM
          </label>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {role ? '(click selected to deselect)' : '(no team selected)'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ROLE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangeRole(prev => (prev === opt.id ? undefined : opt.id))}
              title={opt.tooltip}
              className={`flex items-start gap-2 rounded-xl border p-2 text-left transition-all ${
                role === opt.id
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500 cursor-pointer'
                  : 'border-[var(--border)] bg-[var(--surface)] text-neutral-600 dark:text-white/60 hover:border-neutral-300 cursor-pointer'
              }`}
            >
              <div className="rounded-lg p-1 bg-neutral-200/50 dark:bg-white/5 shrink-0">{opt.icon}</div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{opt.label}</p>
                <p className="text-[11px] text-[var(--text-secondary)] truncate">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Special Roles Selection */}
      <div>
        <label className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1.5 block">
          SPECIAL ROLES
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label
            className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-all ${
              isBusinessLead
                ? 'border-indigo-500/40 bg-indigo-500/5 dark:bg-indigo-500/10'
                : 'border-[var(--border)] bg-[var(--surface)] hover:border-neutral-300'
            }`}
          >
            <input
              type="checkbox"
              checked={isBusinessLead}
              onChange={e => onChangeBusinessLead(e.target.checked)}
              className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Business Lead</span>
          </label>

          <label
            className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-all ${
              isCreativeDirector
                ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10'
                : 'border-[var(--border)] bg-[var(--surface)] hover:border-neutral-300'
            }`}
          >
            <input
              type="checkbox"
              checked={isCreativeDirector}
              onChange={e => onChangeCreativeDirector(e.target.checked)}
              className="rounded border-neutral-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
            />
            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Creative Director</span>
          </label>

          <label
            className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-all ${
              isClusterLead
                ? 'border-blue-500/40 bg-blue-500/5 dark:bg-blue-500/10'
                : 'border-[var(--border)] bg-[var(--surface)] hover:border-neutral-300'
            }`}
          >
            <input
              type="checkbox"
              checked={isClusterLead}
              onChange={e => onChangeClusterLead(e.target.checked)}
              className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Cluster Lead</span>
          </label>

          <label
            className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-all ${
              isTeamLead
                ? 'border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10'
                : 'border-[var(--border)] bg-[var(--surface)] hover:border-neutral-300'
            }`}
          >
            <input
              type="checkbox"
              checked={isTeamLead}
              onChange={e => onChangeTeamLead(e.target.checked)}
              className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
            />
            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Team Lead</span>
          </label>
        </div>
      </div>

      {/* Assigned Creative Director & Cluster Lead */}
      {!isBusinessLead && !isCreativeDirector && availableCreativeDirectors.length > 0 && (
        <div>
          <label
            className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1"
            htmlFor={`${idPrefix}-cd-select`}
          >
            <Crown className="h-3 w-3 text-amber-500" />
            Assigned Creative Director
          </label>
          <select
            value={creativeDirectorId}
            onChange={e => onChangeCreativeDirectorId(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none cursor-pointer"
            id={`${idPrefix}-cd-select`}
          >
            <option value="">— No Delivery Lead / Independent —</option>
            {availableCreativeDirectors.map(cd => (
              <option key={cd.id} value={cd.id}>
                {cd.name} ({cd.role === 'design' ? 'Design' : cd.role === 'account_manager' ? 'Accounts' : 'Content'})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
            Boards follow the Creative Director as the delivery lead of a cluster.
          </p>
        </div>
      )}

      {!isBusinessLead && !isClusterLead && availableClusterLeads.length > 0 && (
        <div>
          <label
            className="text-xs uppercase tracking-wider font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1"
            htmlFor={`${idPrefix}-cluster-select`}
          >
            <Users className="h-3 w-3 text-blue-500" />
            Assigned Cluster Lead
          </label>
          <select
            value={clusterLeadId}
            onChange={e => onChangeClusterLeadId(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-[var(--surface)] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none cursor-pointer"
            id={`${idPrefix}-cluster-select`}
          >
            <option value="">— No Cluster Lead Assigned —</option>
            {availableClusterLeads.map(cl => (
              <option key={cl.id} value={cl.id}>
                {cl.name} ({cl.role === 'design' ? 'Design' : cl.role === 'account_manager' ? 'Accounts' : 'Content'})
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
};
