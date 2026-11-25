export const SUPERADMIN_EMAIL = 'kiran.s@zensciences.com';

export const VALID_ROLES = ['content', 'design', 'account_manager', 'administrator'] as const;
export type ValidRole = (typeof VALID_ROLES)[number];

export interface MemberLike {
  id: string;
  email: string;
  role?: string;
  isAdministrator?: boolean;
  isBusinessLead?: boolean;
  isCreativeDirector?: boolean;
  isClusterLead?: boolean;
  isTeamLead?: boolean;
  isAccountManager?: boolean;
  isContentLead?: boolean;
  isArtDirector?: boolean;
  isContentSpecialist?: boolean;
  isBrandDesigner?: boolean;
  designation?: string;
  creativeDirectorId?: string;
  clusterLeadId?: string;
}

export interface TaskPermissionLike {
  userId?: string;
  assigneeIds?: string[];
  team?: string;
  status?: string;
}

export const isSuperadmin = (user: Pick<MemberLike, 'email'> | undefined | null): boolean =>
  Boolean(user?.email && user.email.toLowerCase() === SUPERADMIN_EMAIL);

export const isAdminMember = (user: MemberLike | undefined | null): boolean =>
  Boolean(user && (isSuperadmin(user) || user.isAdministrator || user.role === 'administrator'));

export const isBusinessLead = (user: MemberLike | undefined | null): boolean =>
  Boolean(
    user &&
      (user.isBusinessLead ||
        user.designation === 'business_lead' ||
        user.designation === 'Business Lead')
  );

export const isCreativeDirector = (user: MemberLike | undefined | null): boolean =>
  Boolean(user && (isSuperadmin(user) || user.isCreativeDirector));

export const isClusterLead = (user: MemberLike | undefined | null): boolean =>
  Boolean(user?.isClusterLead);

export const isTeamLead = (user: MemberLike | undefined | null): boolean =>
  Boolean(
    user &&
      (user.isTeamLead || user.designation === 'team_lead' || user.designation === 'Team Lead')
  );

export const isAccountsMember = (user: MemberLike | undefined | null): boolean => {
  if (!user) return false;
  return Boolean(
    user.role === 'account_manager' ||
      user.isAccountManager ||
      user.designation === 'account_manager' ||
      user.designation === 'Account Manager'
  );
};

export const hasAuthorizedSpecialRole = (user: MemberLike | undefined | null): boolean => {
  if (!user) return false;
  return Boolean(
    isAdminMember(user) ||
      isBusinessLead(user) ||
      user.isCreativeDirector ||
      user.designation === 'creative_director' ||
      user.designation === 'Creative Director' ||
      user.isClusterLead ||
      user.designation === 'cluster_lead' ||
      user.designation === 'Cluster Lead' ||
      isTeamLead(user)
  );
};

export const canCreatePipelineTask = (user: MemberLike | undefined | null): boolean =>
  isAccountsMember(user) || hasAuthorizedSpecialRole(user);

export const canManageMembers = (user: MemberLike | undefined | null): boolean =>
  Boolean(
    user &&
      (isAdminMember(user) ||
        isBusinessLead(user) ||
        isCreativeDirector(user) ||
        isClusterLead(user))
  );

export const canAssignTask = (user: MemberLike | undefined | null): boolean =>
  Boolean(
    user &&
      (isAdminMember(user) ||
        isBusinessLead(user) ||
        isCreativeDirector(user) ||
        user.designation === 'creative_director' ||
        user.designation === 'Creative Director' ||
        isClusterLead(user))
  );

export const canSwitchBoards = (user: MemberLike | undefined | null): boolean =>
  canManageMembers(user);

export const canEdit = (caller: MemberLike | undefined | null, owner: MemberLike | undefined | null): boolean => {
  if (!caller || !owner) return false;
  if (isAdminMember(caller) || isBusinessLead(caller)) return true;
  if (isAccountsMember(caller)) return false;
  if (caller.id === owner.id) return true;
  if (caller.isCreativeDirector && owner.creativeDirectorId === caller.id) return true;
  if (caller.isClusterLead && (owner.clusterLeadId === caller.id || owner.creativeDirectorId === caller.id)) {
    return true;
  }
  if (isTeamLead(caller) || caller.isContentLead || caller.isArtDirector) {
    if (
      (caller.creativeDirectorId && owner.creativeDirectorId === caller.creativeDirectorId) ||
      (caller.clusterLeadId && owner.clusterLeadId === caller.clusterLeadId) ||
      (caller.role && owner.role === caller.role)
    ) {
      return true;
    }
  }
  return false;
};

export const canManageUser = (caller: MemberLike | undefined | null, target: MemberLike | undefined | null): boolean => {
  if (!caller || !target) return false;
  if (isAdminMember(caller) || isBusinessLead(caller)) return true;
  if (isCreativeDirector(caller)) return target.creativeDirectorId === caller.id;
  if (isClusterLead(caller)) {
    return target.clusterLeadId === caller.id || target.creativeDirectorId === caller.id;
  }
  return false;
};

export const getAssigneeIds = (task: Pick<TaskPermissionLike, 'userId' | 'assigneeIds'> | undefined | null): string[] => {
  if (!task) return [];
  if (Array.isArray(task.assigneeIds) && task.assigneeIds.length > 0) {
    return Array.from(new Set(task.assigneeIds.filter(Boolean)));
  }
  return task.userId ? [task.userId] : [];
};

export const canEditTask = (
  caller: MemberLike | undefined | null,
  task: TaskPermissionLike | undefined | null,
  users: readonly MemberLike[]
): boolean => {
  if (!caller || !task) return false;
  const assignees = getAssigneeIds(task);
  if (assignees.length === 0) {
    return canAssignTask(caller) || canCreatePipelineTask(caller);
  }
  return assignees.some(id => canEdit(caller, users.find(u => u.id === id)));
};

export const canEditUserBoard = (
  caller: MemberLike | undefined | null,
  targetUserId: string | undefined,
  users: readonly MemberLike[]
): boolean => {
  if (!caller) return false;
  if (!targetUserId) return canAssignTask(caller) || canCreatePipelineTask(caller);
  return canEdit(caller, users.find(u => u.id === targetUserId));
};

export const canAssignToDiscipline = (taskTeam: string | undefined, targetUser: MemberLike | undefined): boolean => {
  if (!targetUser || !taskTeam || !targetUser.role) return true;
  return targetUser.role === taskTeam;
};

export function deriveMemberDesignation(input: {
  role?: string;
  isAdministrator?: boolean;
  isBusinessLead?: boolean;
  isCreativeDirector?: boolean;
  isClusterLead?: boolean;
  isTeamLead?: boolean;
}): string | undefined {
  if (input.isBusinessLead) return 'Business Lead';
  if (input.isCreativeDirector) return 'Creative Director';
  if (input.isClusterLead) return 'Cluster Lead';
  if (input.isTeamLead) return 'Team Lead';
  if (input.role === 'account_manager') return 'Account Manager';
  if (input.isAdministrator || input.role === 'administrator') return 'Administrator';
  return undefined;
}
