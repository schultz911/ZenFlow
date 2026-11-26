import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAuth, useWorkspace } from '../context/DashboardContext';
import { Task, User, RoleFilter } from '../types';
import { getCognitiveLoadLabel, getTaskAssigneeIds } from '../utils/workload';
import { isValidHttpUrl } from '../utils/taskMetadata';
import {
  Inbox,
  Plus,
  Search,
  UserX,
  Clock,
  Edit2,
  Trash2,
  GripVertical,
  Shield,
  FileText,
  Palette,
  CornerDownRight,
  Link2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

interface TeamPipelineProps {
  roleFilter: RoleFilter;
  tasks: Task[];
  users: User[];
  onOpenCreateModal: () => void;
  onOpenAssignmentModal: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onDragTaskStart?: (task: Task) => void;
  onDragTaskEnd?: () => void;
}

const DISCIPLINE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  content: FileText,
  design: Palette,
};

export const TeamPipeline: React.FC<TeamPipelineProps> = ({
  roleFilter,
  tasks,
  users,
  onOpenCreateModal,
  onOpenAssignmentModal,
  onEditTask,
  onDeleteTask,
  onDragTaskStart,
  onDragTaskEnd,
}) => {
  const {
    canCreatePipelineTask,
    canAssignTask,
  } = useAuth();
  const { updateTask } = useWorkspace();

  const [pipelineSearch, setPipelineSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) {
      map.set(u.id, u);
    }
    return map;
  }, [users]);

  const pipelineTasks = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) {
      if (!task || !task.id) continue;
      if (task.status !== 'pipeline') continue;

      const firstAssignee = getTaskAssigneeIds(task)[0];
      const taskTeam = task.team || (firstAssignee ? userMap.get(firstAssignee)?.role : undefined) || 'content';
      if (taskTeam !== 'content' && taskTeam !== 'design') continue;
      if (roleFilter === 'all' || taskTeam === roleFilter) {
        map.set(task.id, task);
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [tasks, roleFilter, userMap]);

  const totalCount = pipelineTasks.length;
  const unassignedCount = useMemo(() => {
    return pipelineTasks.filter(t => getTaskAssigneeIds(t).length === 0).length;
  }, [pipelineTasks]);
  const assignedCount = totalCount - unassignedCount;

  const displayedTasks = useMemo(() => {
    let result = pipelineTasks;

    if (filterMode === 'unassigned') {
      result = result.filter(t => getTaskAssigneeIds(t).length === 0);
    } else if (filterMode === 'assigned') {
      result = result.filter(t => getTaskAssigneeIds(t).length > 0);
    }

    const query = pipelineSearch.trim().toLowerCase();
    if (query) {
      result = result.filter(t => {
        const matchesTitle = t.title.toLowerCase().includes(query);
        const matchesDesc = t.description ? t.description.toLowerCase().includes(query) : false;
        const matchesClient = t.client ? t.client.toLowerCase().includes(query) : false;
        const matchesProject = t.project ? t.project.toLowerCase().includes(query) : false;
        const matchesParent = t.parentTaskTitle ? t.parentTaskTitle.toLowerCase().includes(query) : false;
        const assigneeNames = getTaskAssigneeIds(t)
          .map(id => userMap.get(id)?.name.toLowerCase() || '')
          .join(' ');
        const matchesAssignee = assigneeNames.includes(query);
        return matchesTitle || matchesDesc || matchesClient || matchesProject || matchesParent || matchesAssignee;
      });
    }

    return result;
  }, [pipelineTasks, filterMode, pipelineSearch, userMap]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    let taskId = '';
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.taskId) taskId = parsed.taskId;
      }
    } catch {
      // ignore
    }

    if (!taskId) {
      taskId = e.dataTransfer.getData('text/plain').trim();
    }

    if (taskId) {
      const existing = tasks.find(t => t.id === taskId);
      if (existing) {
        await updateTask(taskId, {
          status: 'pipeline',
          team: existing.team || (roleFilter === 'all' ? 'content' : roleFilter),
        });
      }
    }
  };

  const DisciplineIcon = roleFilter === 'all' ? Inbox : (DISCIPLINE_ICONS[roleFilter] || Inbox);
  const pipelineHeading = roleFilter === 'all'
    ? 'Team Pipeline'
    : `${roleFilter === 'content' ? 'Content' : 'Design'} Pipeline`;

  return (
    <section
      aria-label={pipelineHeading}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`ledger-frame mb-4 transition-colors ${
        isDragOver
          ? 'border-[#1d4ed8] dark:border-blue-400 bg-blue-50/40 dark:bg-blue-950/20'
          : ''
      }`}
    >
      {/* Top Ruled Ledger Band */}
      <div className={`ledger-band flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 sm:px-5 ${isCollapsed ? 'border-b-0' : ''}`}>
        <div className="flex items-center gap-2.5">
          <DisciplineIcon className="h-4 w-4 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
          <h2 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">
            {pipelineHeading}
          </h2>
          <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
            {totalCount} total
          </span>
          {unassignedCount > 0 && (
            <>
              <span className="text-[var(--text-muted)] text-xs">·</span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                {unassignedCount} unassigned
              </span>
            </>
          )}
        </div>

        {/* Hairline Filter Switch, Search & Create Task */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-[7px] bg-[var(--surface-subtle)] p-0.5 border border-[var(--border)] text-[11px] font-semibold">
            <button
              type="button"
              aria-pressed={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
                filterMode === 'all'
                  ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'unassigned'}
              onClick={() => setFilterMode('unassigned')}
              className={`px-2.5 py-1 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
                filterMode === 'unassigned'
                  ? 'bg-[var(--surface)] text-amber-700 dark:text-amber-400 border border-[var(--border)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
            >
              Unassigned ({unassignedCount})
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'assigned'}
              onClick={() => setFilterMode('assigned')}
              className={`px-2.5 py-1 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
                filterMode === 'assigned'
                  ? 'bg-[var(--surface)] text-[#1d4ed8] dark:text-blue-400 border border-[var(--border)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
            >
              Assigned ({assignedCount})
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={pipelineSearch}
              onChange={e => setPipelineSearch(e.target.value)}
              aria-label="Search pipeline"
              placeholder="Search pipeline..."
              className="w-40 sm:w-44 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] pl-7 pr-6 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            {pipelineSearch && (
              <button
                type="button"
                aria-label="Clear pipeline search"
                onClick={() => setPipelineSearch('')}
                className="absolute right-1.5 top-1.5 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {canCreatePipelineTask ? (
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="button-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Task</span>
            </button>
          ) : (
            <div
              title="Task creation is restricted to Accounts team members and authorized leadership"
              className="flex items-center gap-1.5 rounded-[7px] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--surface)]"
            >
              <Shield className="h-3 w-3" />
              <span>View-Only</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsCollapsed(prev => !prev)}
            title={isCollapsed ? 'Expand pipeline' : 'Collapse pipeline'}
            aria-label={isCollapsed ? 'Expand pipeline' : 'Collapse pipeline'}
            className="icon-button border border-[var(--border)] bg-[var(--surface)]"
          >
            {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Compact Ruled Ledger Triage Strip (no nested cards) */}
      {!isCollapsed && (
        <div className="bg-[var(--surface)]">
          {displayedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
              <Inbox className="h-4 w-4 text-[var(--text-muted)] mb-1.5" />
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {pipelineSearch || filterMode !== 'all'
                  ? 'No matching tasks in pipeline'
                  : `${pipelineHeading} is currently empty`}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] max-w-sm mt-0.5">
                {pipelineSearch || filterMode !== 'all'
                  ? 'Try clearing the search query or changing the filter mode.'
                  : canCreatePipelineTask
                  ? 'Create tasks using Add Task to generate Content or Design pipeline deliverables.'
                  : 'Unscheduled deliverables created by Accounts will appear here.'}
              </p>
              {canCreatePipelineTask && !pipelineSearch && filterMode === 'all' && (
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="button-primary mt-2.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Task</span>
                </button>
              )}
            </div>
          ) : (
            <div
              className={`grid grid-cols-1 ${
                displayedTasks.length === 1
                  ? 'md:grid-cols-1'
                  : displayedTasks.length === 2
                  ? 'md:grid-cols-2'
                  : 'md:grid-cols-2 lg:grid-cols-3'
              } divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]`}
            >
              {displayedTasks.map((task, idx) => {
                const isEditingThis = editingTaskId === task.id;
                const taskDiscipline = task.team === 'design' ? 'design' : 'content';
                const assigneeIds = getTaskAssigneeIds(task);
                const assignee = assigneeIds[0] ? userMap.get(assigneeIds[0]) : null;
                const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, taskDiscipline);
                const metadata = task.disciplineMetadata;

                return (
                  <motion.div
                    key={task.id}
                    layout="position"
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    draggable={!isEditingThis}
                    onDragStartCapture={(e: React.DragEvent) => {
                      if (isEditingThis) {
                        e.preventDefault();
                        return;
                      }
                      const dragPayload = {
                        taskId: task.id,
                        status: 'pipeline',
                        userId: assigneeIds[0] || '',
                        team: taskDiscipline,
                        order: task.order,
                        title: task.title,
                        dueDate: task.dueDate,
                      };
                      e.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
                      e.dataTransfer.setData('text/plain', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                      onDragTaskStart?.(task);
                    }}
                    onDragEndCapture={() => onDragTaskEnd?.()}
                    className={`group relative flex flex-col justify-between px-4 py-2.5 hover:bg-[var(--surface-muted)] transition-colors select-none cursor-grab active:cursor-grabbing ${
                      idx >= 3 ? 'lg:border-t lg:border-[var(--border-subtle)]' : ''
                    } ${idx >= 2 && displayedTasks.length > 2 ? 'md:border-t md:border-[var(--border-subtle)] lg:border-t-0' : ''}`}
                  >
                    {/* Top Line: Discipline · Priority · Due + Quick Actions */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0 text-[11px]">
                        <GripVertical className="h-3 w-3 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0 -ml-1" />
                        <span
                          className={`font-semibold uppercase tracking-wider ${
                            taskDiscipline === 'design'
                              ? 'text-indigo-700 dark:text-indigo-400'
                              : 'text-[#1d4ed8] dark:text-blue-400'
                          }`}
                        >
                          {taskDiscipline}
                        </span>
                        {task.priority && (
                          <>
                            <span className="text-[var(--text-muted)]">·</span>
                            <span
                              className={`font-semibold capitalize ${
                                task.priority === 'high'
                                  ? 'text-red-600 dark:text-red-400'
                                  : task.priority === 'medium'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-[var(--text-secondary)]'
                              }`}
                            >
                              {task.priority} priority
                            </span>
                          </>
                        )}
                        {task.dueDate && (
                          <>
                            <span className="text-[var(--text-muted)]">·</span>
                            <span className="text-[var(--text-secondary)] tabular-nums truncate">
                              {task.dueDate}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center card-actions opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onEditTask(task);
                          }}
                          title="Edit task details"
                          className="rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
                          style={{ minHeight: 'auto' }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onDeleteTask(task);
                          }}
                          title="Delete pipeline task"
                          className="rounded p-1 text-[var(--text-secondary)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors cursor-pointer"
                          style={{ minHeight: 'auto' }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Title + Inline Assign Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {task.isSubtask && task.parentTaskTitle && (
                          <div className="flex items-center gap-1 text-[10.5px] text-[#1d4ed8] dark:text-blue-400 font-medium truncate">
                            <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{task.parentTaskTitle}</span>
                          </div>
                        )}

                        {isEditingThis ? (
                          <div className="my-0.5" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              autoFocus
                              value={editingTitle}
                              onChange={e => setEditingTitle(e.target.value)}
                              onKeyDown={async e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const trimmed = editingTitle.trim();
                                  if (trimmed && trimmed !== task.title) {
                                    await updateTask(task.id, { title: trimmed });
                                  }
                                  setEditingTaskId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingTaskId(null);
                                }
                              }}
                              onBlur={async () => {
                                const trimmed = editingTitle.trim();
                                if (trimmed && trimmed !== task.title) {
                                  await updateTask(task.id, { title: trimmed });
                                }
                                setEditingTaskId(null);
                              }}
                              className="w-full rounded-[5px] border border-[var(--accent)] bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none"
                            />
                          </div>
                        ) : (
                          <h4
                            onClick={e => {
                              e.stopPropagation();
                              setEditingTaskId(task.id);
                              setEditingTitle(task.title);
                            }}
                            title="Click to rename"
                            className="text-[13px] font-semibold text-[var(--text-primary)] truncate hover:text-[#1d4ed8] dark:hover:text-blue-400 cursor-text leading-snug"
                          >
                            {task.title}
                          </h4>
                        )}

                        {/* Compact Single-Line Meta: Client · Project · Type · Brief + Load · Est (wrap-safe, no dangling middot) */}
                        <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-[var(--text-secondary)]">
                          {(task.client || task.project || metadata?.contentType || metadata?.assetType || (task.brandGuidelines && isValidHttpUrl(task.brandGuidelines))) && (
                            <div className="inline-flex items-center gap-1.5 flex-wrap min-w-0">
                              {task.client && (
                                <span className="font-medium text-[var(--text-primary)] truncate max-w-[100px]">
                                  {task.client}
                                </span>
                              )}
                              {task.client && task.project && <span className="text-[var(--text-muted)]">·</span>}
                              {task.project && <span className="truncate max-w-[110px]">{task.project}</span>}
                              {(metadata?.contentType || metadata?.assetType) && (
                                <>
                                  {(task.client || task.project) && <span className="text-[var(--text-muted)]">·</span>}
                                  <span className="truncate">{metadata?.contentType || metadata?.assetType}</span>
                                </>
                              )}
                              {task.brandGuidelines && isValidHttpUrl(task.brandGuidelines) && (
                                <>
                                  {(task.client || task.project || metadata?.contentType || metadata?.assetType) && (
                                    <span className="text-[var(--text-muted)]">·</span>
                                  )}
                                  <a
                                    href={task.brandGuidelines}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    title={`Brand Guidelines: ${task.brandGuidelines}`}
                                    className="inline-flex items-center gap-0.5 font-medium text-[#1d4ed8] dark:text-blue-400 hover:underline"
                                  >
                                    <Link2 className="h-2.5 w-2.5 shrink-0" />
                                    <span>Brief</span>
                                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                  </a>
                                </>
                              )}
                            </div>
                          )}

                          <div className="inline-flex items-center gap-2 shrink-0">
                            <span
                              title={`Cognitive Load: ${cognitiveLabel}`}
                              className="inline-flex items-center gap-1 capitalize"
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  task.cognitiveLoad === 'high'
                                    ? 'bg-red-600 dark:bg-red-400'
                                    : task.cognitiveLoad === 'medium'
                                    ? 'bg-amber-600 dark:bg-amber-400'
                                    : 'bg-emerald-600 dark:bg-emerald-400'
                                }`}
                              />
                              <span>{task.cognitiveLoad} load</span>
                            </span>
                            {task.estimatedHours !== undefined && task.estimatedHours > 0 && (
                              <span
                                title={`Estimated Effort: ${task.estimatedHours} hours`}
                                className="inline-flex items-center gap-0.5 tabular-nums font-semibold text-[var(--text-primary)]"
                              >
                                <Clock className="h-2.5 w-2.5 text-[var(--text-muted)]" />
                                <span>{task.estimatedHours}h</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right-aligned Inline Assign Action */}
                      <div className="shrink-0 pt-0.5">
                        {assignee ? (
                          <button
                            type="button"
                            onClick={() => canAssignTask && onOpenAssignmentModal(task)}
                            title={canAssignTask ? 'Click to reassign or adjust estimates' : `Assigned to ${assignee.name}`}
                            className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                              canAssignTask
                                ? 'text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer'
                                : 'text-[var(--text-primary)] cursor-default'
                            }`}
                            style={{ minHeight: 'auto' }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-[#1d4ed8] dark:bg-blue-400 shrink-0" />
                            <span className="truncate max-w-[95px]">
                              {assigneeIds.length > 1 ? `${assignee.name} +${assigneeIds.length - 1}` : assignee.name}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenAssignmentModal(task)}
                            title={canAssignTask ? 'Assign task to matching discipline member' : 'Unassigned in pipeline'}
                            className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                              canAssignTask
                                ? 'bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25'
                                : 'text-[var(--text-secondary)]'
                            }`}
                            style={{ minHeight: 'auto' }}
                          >
                            <UserX className="h-3 w-3" />
                            <span>{canAssignTask ? 'Assign' : 'Unassigned'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
