export type Role = 'content' | 'design';

export type CognitiveLoad = 'low' | 'medium' | 'high';

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'archived';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarColor?: string;
  createdAt: string;
}

export interface TaskActivity {
  id: string;
  timestamp: string;
  action: 'created' | 'status_change' | 'reassigned' | 'rescheduled' | 'updated';
  from?: string;
  to?: string;
  actorName?: string;
  details?: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  cognitiveLoad: CognitiveLoad;
  status: TaskStatus;
  order: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  activityLog?: TaskActivity[];
}

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
}

export interface WorkloadBreakdown {
  totalScore: number;
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
}

export interface TaskOrderUpdate {
  id: string;
  userId?: string;
  status: TaskStatus;
  order: number;
}

export type RealtimeEventType = 
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'tasks_reordered'
  | 'sync_all';

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: any;
  timestamp: number;
}
