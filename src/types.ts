export type Role = 'content' | 'design' | 'account_manager' | 'administrator' | 'none';

export type RoleFilter = 'all' | 'content' | 'design';

export type CognitiveLoad = 'low' | 'medium' | 'high';

export type TaskStatus = 'pipeline' | 'retainer' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'archived';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: Role;
  avatarColor?: string;
  createdAt: string;
  order?: number;
  designation?: string;
  isCreativeDirector?: boolean;
  creativeDirectorId?: string;
  isAdministrator?: boolean;
  isBusinessLead?: boolean;
  isClusterLead?: boolean;
  isTeamLead?: boolean;
  isAccountManager?: boolean;
  isContentLead?: boolean;
  isArtDirector?: boolean;
  isContentSpecialist?: boolean;
  isBrandDesigner?: boolean;
  clusterLeadId?: string;
  clickupApiKey?: string;
  clickupConnected?: boolean;
  selectedClickupSpaceId?: string;
  selectedClickupSpaceName?: string;
  clickupUserId?: string;
  clickupUsername?: string;
}

export interface ClickupMember {
  id: string;
  username: string;
  email: string;
  color?: string;
  profilePicture?: string;
  initials?: string;
}

export interface ClickupCustomFieldOption {
  id: string;
  name: string;
  color?: string;
  orderindex?: number;
}

export interface ClickupCustomField {
  id: string;
  name: string;
  type: string;
  type_config?: {
    options?: ClickupCustomFieldOption[];
  };
}

export interface ClickupSpace {
  id: string;
  name: string;
  color?: string;
  private?: boolean;
}

export interface ClickupList {
  id: string;
  name: string;
  orderindex?: number;
  folder?: {
    id: string;
    name: string;
  };
  space?: {
    id: string;
    name: string;
  };
}

export interface ClickupFolder {
  id: string;
  name: string;
  lists: ClickupList[];
}

export interface ClickupWebhookStatus {
  listening: boolean;
  registered: boolean;
  webhookId?: string;
  endpointUrl: string;
  lastEventAt?: string;
  lastEventAction?: string;
  totalEventsCount: number;
  supportedEvents?: string[];
}

export interface TaskActivity {
  id: string;
  timestamp: string;
  action: 'created' | 'status_change' | 'reassigned' | 'rescheduled' | 'updated' | 'billable_adjusted';
  from?: string;
  to?: string;
  actorName?: string;
  details?: string;
}

export interface TaskDisciplineMetadata {
  // Content
  contentType?: string;
  contentSpecifications?: string;
  sourceContentReferences?: string[];
  // Design
  assetType?: string;
  designSpecifications?: string;
  brandAssetsReferences?: string[];
}

export interface ParentTask {
  id: string;
  title: string;
  brief?: string;
  brandGuidelines?: string;
  clickupParentTaskId?: string;
  lastSyncedClickupDescHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  userId?: string;
  assigneeIds?: string[];
  team?: Role;
  title: string;
  description?: string;
  brandGuidelines?: string;
  lastSyncedClickupDescHash?: string;
  dueDate?: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD or ISO timestamp when moved from pipeline to swimlane
  cognitiveLoad: CognitiveLoad;
  status: TaskStatus;
  order: number;
  completedAt?: string;
  inProgressStartedAt?: string; // ISO timestamp when task entered in_progress
  inProgressDurationMs?: number; // Total accumulated milliseconds in in_progress
  createdAt: string;
  updatedAt: string;
  activityLog?: TaskActivity[];
  parentTaskId?: string;
  parentTaskTitle?: string;
  isSubtask?: boolean;
  client?: string;
  project?: string;
  estimatedHours?: number;
  priority?: 'low' | 'medium' | 'high';
  attachments?: string[];
  disciplineMetadata?: TaskDisciplineMetadata;
  contentDocLink?: string;
  clickupTaskId?: string;
  clickupFolderId?: string;
  clickupFolderName?: string;
  clickupListId?: string;
  clickupListName?: string;
  clickupSpaceId?: string;
  clickupSpaceName?: string;
  clickupUrl?: string;
  clickupTaskType?: string;
  clickupTaskTypeId?: string;
  clickupTaskTypeFieldId?: string;
  clickupParentTaskId?: string;
}

export type AnalyticsScope = 'all' | 'client' | 'delivery_unit' | 'project' | 'user';
export type AnalyticsTimeframe = 'today' | 'week' | 'custom';

export interface QueuedMutation {
  id: string;
  type: 'create_task' | 'update_task' | 'delete_task' | 'reorder_tasks' | 'delete_user';
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  payload?: any;
  timestamp: number;
  retryCount: number;
}

export interface TaskScoreItem {
  taskId: string;
  title: string;
  status: TaskStatus;
  cognitiveLoad: CognitiveLoad;
  hasDeadline: boolean;
  dueDate?: string;
  daysRemaining: number | null;
  statusWeight: number;
  cognitiveWeight: number;
  proximityMultiplier: number;
  calculatedScore: number;
  billableHours?: number;
}

export interface WorkloadBreakdown {
  totalScore: number;
  pipelineCount: number;
  inProgressCount: number;
  todoWithDeadlineCount: number;
  todoNoDeadlineCount: number;
  inReviewCount: number;
  doneCount: number;
  archivedCount: number;
  overdueCount: number;
  items: TaskScoreItem[];
  level: 'light' | 'optimal' | 'heavy' | 'overloaded';
  levelLabel: string;
  levelColor: string;
  badgeBg: string;
  badgeText: string;
  progressPercent: number; // 0 - 100 for capacity visual
}

export interface DragTaskInfo {
  taskId: string;
  sourceUserId: string;
  sourceStatus: TaskStatus;
  title: string;
  task?: Task;
  dueDate?: string;
}

export interface TaskOrderUpdate {
  id: string;
  userId?: string;
  assigneeIds?: string[];
  status: TaskStatus;
  order: number;
  dueDate?: string | null;
  startDate?: string;
  estimatedHours?: number;
  cognitiveLoad?: CognitiveLoad;
  contentDocLink?: string;
}

export type RealtimeEventType =
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'tasks_reordered'
  | 'access_request_created'
  | 'access_request_updated'
  | 'sync_all';

export interface AccessRequest {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'approved' | 'dismissed';
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: any;
  timestamp: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category: 'task' | 'user' | 'security' | 'webhook' | 'system';
  action: string;
  actor?: {
    id?: string;
    name?: string;
    email?: string;
    ip?: string;
  };
  targetId: string;
  targetType: 'task' | 'user' | 'workspace' | 'webhook';
  details?: string;
  from?: any;
  to?: any;
  metadata?: Record<string, any>;
}
