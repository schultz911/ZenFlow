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

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  cognitiveLoad: CognitiveLoad;
  status: TaskStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
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

export type RealtimeEventType = 
  | 'user_created'
  | 'user_updated'
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
