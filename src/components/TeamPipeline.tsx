import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useAuth, useWorkspace } from '../context/DashboardContext';
import { Task, User, RoleFilter } from '../types';
import { formatDateOnly, getCognitiveLoadLabel, getDaysRemaining, getTaskAssigneeIds } from '../utils/workload';
import { isValidHttpUrl } from '../utils/taskMetadata';
import { handleRovingMenuKeyDown, useAnchoredPopover } from '../hooks/useAnchoredPopover';
import {
  Inbox,
  Plus,
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
  Flag,
  MoreHorizontal,
} from 'lucide-react';

interface TeamPipelineProps {
  roleFilter: RoleFilter;
  tasks: Task[];
  users: User[];
  globalSearch?: string;
  unassignedClusterOnly?: boolean;
  onToggleUnassignedCluster?: () => void;
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
  globalSearch = '',
  unassignedClusterOnly = false,
  onToggleUnassignedCluster,
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

  const [filterMode, setFilterMode] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [isDragOver, setIsDragOver] = useState(false);
  const [mobileMenuTask, setMobileMenuTask] = useState<Task | null>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuPopRef = useRef<HTMLDivElement>(null);
  const userToggledCollapseRef = useRef(false);
  const canManagePipeline = canAssignTask || canCreatePipelineTask;
  const closeMobileMenu = useCallback(() => setMobileMenuTask(null), []);
  const { position: mobileMenuPos } = useAnchoredPopover({
    isOpen: Boolean(mobileMenuTask && canManagePipeline),
    triggerRef: mobileMenuTriggerRef,
    popoverRef: mobileMenuPopRef,
    onClose: closeMobileMenu,
    align: 'right',
    gap: 4,
    fallbackWidth: 168,
    fallbackHeight: 96,
    dismissOnOutOfView: true,
  });

  useEffect(() => {
    if (!mobileMenuTask) return;
    const focusTimer = window.setTimeout(() => {
      const firstItem = mobileMenuPopRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
      firstItem?.focus({ preventScroll: true });
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setMobileMenuTask(null);
        return;
      }
      handleRovingMenuKeyDown(e, mobileMenuPopRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileMenuTask]);

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
    return Array.from(map.values()).sort((a, b) => {
      const aHasDue = Boolean(a.dueDate);
      const bHasDue = Boolean(b.dueDate);
      if (aHasDue && bHasDue) {
        const cmp = a.dueDate!.localeCompare(b.dueDate!);
        if (cmp !== 0) return cmp;
      } else if (aHasDue !== bHasDue) {
        return aHasDue ? -1 : 1;
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [tasks, roleFilter, userMap]);

  const totalCount = pipelineTasks.length;
  const unassignedCount = useMemo(() => {
    return pipelineTasks.filter(t => getTaskAssigneeIds(t).length === 0).length;
  }, [pipelineTasks]);
  const assignedCount = totalCount - unassignedCount;

  const [isCollapsed, setIsCollapsed] = useState(() =>
    unassignedCount === 0 && !canCreatePipelineTask
  );

  useEffect(() => {
    if (userToggledCollapseRef.current) return;
    setIsCollapsed(unassignedCount === 0 && !canCreatePipelineTask);
  }, [unassignedCount, canCreatePipelineTask]);

  useEffect(() => {
    if (globalSearch.trim()) {
      setIsCollapsed(false);
      setFilterMode('all');
    }
  }, [globalSearch]);

  const handleToggleCollapse = () => {
    userToggledCollapseRef.current = true;
    setIsCollapsed(prev => !prev);
  };

  const displayedTasks = useMemo(() => {
    let result = unassignedClusterOnly ? pipelineTasks.filter(t => !t.owningClusterId) : pipelineTasks;

    if (filterMode === 'unassigned') {
      result = result.filter(t => getTaskAssigneeIds(t).length === 0);
    } else if (filterMode === 'assigned') {
      result = result.filter(t => getTaskAssigneeIds(t).length > 0);
    }


    return result;
  }, [pipelineTasks, filterMode, globalSearch, userMap, unassignedClusterOnly]);

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
      {/* Top Ruled Ledger Band (click bar anywhere outside buttons to toggle) */}
      <div
        onClick={e => {
          if ((e.target as HTMLElement).closest('button, a, input, select')) return;
          handleToggleCollapse();
        }}
        title={isCollapsed ? `Click bar to expand ${pipelineHeading}` : `Click bar to collapse ${pipelineHeading}`}
        className={`ledger-band flex items-center justify-between gap-2 px-3.5 py-2.5 sm:px-5 cursor-pointer select-none ${isCollapsed ? 'border-b-transparent' : ''}`}
      >
        <div className="flex items-center gap-x-2 gap-y-0.5 sm:gap-2.5 min-w-0 flex-wrap">
          <DisciplineIcon aria-hidden="true" className="h-4 w-4 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
          <h2 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
            {pipelineHeading}
          </h2>
          <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
            {totalCount} total
          </span>
          {unassignedCount > 0 && (
            <>
              <span aria-hidden="true" className="hidden sm:inline text-[var(--text-muted)] text-xs">·</span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums whitespace-nowrap">
                {unassignedCount} unassigned
              </span>
            </>
          )}
        </div>

        {/* Create Brief, Inline md+ Filter Tabs & Collapse Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {!isCollapsed && (
            <div className="hidden md:flex items-center rounded-[7px] bg-[var(--surface-subtle)] p-0.5 border border-[var(--border)] text-[11px] font-semibold">
              <button
                type="button"
                aria-pressed={filterMode === 'all'}
                title="Show all deliverables in pipeline"
                onClick={() => setFilterMode('all')}
                className={`min-h-0 px-2.5 py-1 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
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
                title="Filter to unassigned deliverables"
                onClick={() => setFilterMode('unassigned')}
                className={`min-h-0 px-2.5 py-1 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
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
                title="Filter to assigned deliverables waiting in pipeline"
                onClick={() => setFilterMode('assigned')}
                className={`min-h-0 px-2.5 py-1 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
                  filterMode === 'assigned'
                    ? 'bg-[var(--surface)] text-[#1d4ed8] dark:text-blue-400 border border-[var(--border)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                Assigned ({assignedCount})
              </button>
            </div>
          )}

          {canCreatePipelineTask ? (
            <button
              type="button"
              onClick={onOpenCreateModal}
              title="Create a new multi-discipline Content or Design pipeline brief (Shortcut: n)"
              className="button-primary mobile-tap-control whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Brief</span>
            </button>
          ) : (
            <div
              title="Task creation is restricted to Accounts team members and authorized leadership"
              className="flex items-center gap-1.5 rounded-[7px] border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--surface)] whitespace-nowrap"
            >
              <Shield className="h-3 w-3" />
              <span>View-Only</span>
            </div>
          )}

          <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-controls="team-pipeline-body"
            onClick={handleToggleCollapse}
            title={isCollapsed ? 'Expand pipeline' : 'Collapse pipeline'}
            aria-label={isCollapsed ? 'Expand pipeline' : 'Collapse pipeline'}
            className="icon-button border border-[var(--border)] bg-[var(--surface)] shrink-0"
          >
            {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Swimlane-Style Cards Strip */}
      {!isCollapsed && (
        <div id="team-pipeline-body" className="bg-[var(--surface)]">
          <div className="md:hidden px-3 sm:px-5 pt-2.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center rounded-[7px] bg-[var(--surface-subtle)] p-0.5 border border-[var(--border)] text-[11px] font-semibold">
              <button
                type="button"
                aria-pressed={filterMode === 'all'}
                title="Show all deliverables in pipeline"
                onClick={() => setFilterMode('all')}
                className={`mobile-tap-control px-2.5 py-1 sm:min-h-0 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
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
                title="Filter to unassigned deliverables"
                onClick={() => setFilterMode('unassigned')}
                className={`mobile-tap-control px-2.5 py-1 sm:min-h-0 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
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
                title="Filter to assigned deliverables waiting in pipeline"
                onClick={() => setFilterMode('assigned')}
                className={`mobile-tap-control px-2.5 py-1 sm:min-h-0 rounded-[5px] transition-colors cursor-pointer tabular-nums ${
                  filterMode === 'assigned'
                    ? 'bg-[var(--surface)] text-[#1d4ed8] dark:text-blue-400 border border-[var(--border)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                Assigned ({assignedCount})
              </button>
            </div>
          </div>
          {onToggleUnassignedCluster && <div className="px-3 sm:px-5 pt-2"><button type="button" className="button-secondary text-xs" aria-pressed={unassignedClusterOnly} onClick={onToggleUnassignedCluster}>{unassignedClusterOnly ? 'Showing unassigned clusters' : 'Unassigned cluster only'}</button></div>}
          {displayedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
              <Inbox className="h-4 w-4 text-[var(--text-muted)] mb-1.5" />
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {globalSearch.trim() || filterMode !== 'all' || unassignedClusterOnly
                  ? 'No matching tasks in pipeline'
                  : `${pipelineHeading} is currently empty`}
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mt-0.5">
                {globalSearch.trim() || filterMode !== 'all' || unassignedClusterOnly
                  ? 'Try clearing the workspace search or changing the filter mode.'
                  : canCreatePipelineTask
                  ? 'Create deliverables using New Brief to generate Content or Design pipeline tasks.'
                  : 'Unscheduled deliverables created by Accounts will appear here.'}
              </p>
              {canCreatePipelineTask && !globalSearch.trim() && filterMode === 'all' && (
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="button-primary mt-2.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Brief</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-stretch gap-2.5 overflow-x-auto p-3 snap-x snap-mandatory scroll-pl-3">
              {displayedTasks.map(task => {
                const taskDiscipline = task.team === 'design' ? 'design' : 'content';
                const assigneeIds = getTaskAssigneeIds(task);
                const assignee = assigneeIds[0] ? userMap.get(assigneeIds[0]) : null;
                const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, taskDiscipline);
                const metadata = task.disciplineMetadata;
                const dueDays = getDaysRemaining(task.dueDate);
                const showParentBreadcrumb = Boolean(
                  task.isSubtask &&
                  task.parentTaskTitle &&
                  !task.title.toLowerCase().startsWith(task.parentTaskTitle.trim().toLowerCase())
                );
                const disciplineLabel = taskDiscipline === 'design' ? 'Design' : 'Content';
                const showDisciplineMeta = !task.title.toLowerCase().includes(taskDiscipline);
                const assetDetail = metadata?.contentType || metadata?.assetType;
                const priorityLabel = task.priority
                  ? `${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} priority`
                  : undefined;

                return (
                  <motion.div
                    key={task.id}
                    layout="position"
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    draggable={canManagePipeline}
                    onDragStartCapture={canManagePipeline ? (e: React.DragEvent) => {
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
                    } : undefined}
                    onDragEndCapture={canManagePipeline ? () => onDragTaskEnd?.() : undefined}
                    className={`task-card group relative shrink-0 w-[290px] sm:w-[300px] snap-start flex flex-col justify-between p-2.5 select-none ${
                      canManagePipeline ? 'sm:cursor-grab sm:active:cursor-grabbing' : ''
                    }`}
                  >
                    <div>
                      {/* Top Row: Grip · Cognitive Load + Card Actions · Estimate */}
                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap text-[11px]">
                          {canManagePipeline && (
                            <GripVertical
                              aria-hidden="true"
                              className="hidden sm:block h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0 -ml-1"
                            />
                          )}
                          <span
                            title={`Cognitive Load: ${cognitiveLabel}`}
                            className="inline-flex items-center gap-1 font-semibold capitalize"
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                task.cognitiveLoad === 'high'
                                  ? 'bg-red-600 dark:bg-red-400'
                                  : task.cognitiveLoad === 'medium'
                                  ? 'bg-amber-600 dark:bg-amber-400'
                                  : 'bg-emerald-600 dark:bg-emerald-400'
                              }`}
                            />
                            <span
                              className={
                                task.cognitiveLoad === 'high'
                                  ? 'text-red-700 dark:text-red-400'
                                  : task.cognitiveLoad === 'medium'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-[var(--text-secondary)]'
                              }
                            >
                              {task.cognitiveLoad} load
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {canManagePipeline && (
                            <>
                              <div className="hidden sm:flex items-center card-actions [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 transition-opacity gap-0.5">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    onEditTask(task);
                                  }}
                                  title="Edit brief details"
                                  aria-label={`Edit ${task.title}`}
                                  className="inline-flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
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
                                  aria-label={`Delete ${task.title}`}
                                  className="inline-flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>

                              <button
                                ref={mobileMenuTask?.id === task.id ? mobileMenuTriggerRef : undefined}
                                type="button"
                                aria-haspopup="menu"
                                aria-expanded={mobileMenuTask?.id === task.id}
                                aria-label={`Actions for ${task.title}`}
                                title={`Actions for ${task.title}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  mobileMenuTriggerRef.current = e.currentTarget;
                                  setMobileMenuTask(prev => (prev?.id === task.id ? null : task));
                                }}
                                className="sm:hidden mobile-tap-square -my-2 inline-flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </>
                          )}

                          {task.estimatedHours !== undefined && task.estimatedHours > 0 && (
                            <span
                              title={`Estimated Effort: ${task.estimatedHours} hours`}
                              className="text-[11px] tabular-nums font-medium text-[var(--text-muted)] shrink-0"
                            >
                              {task.estimatedHours}h
                            </span>
                          )}
                        </div>
                      </div>

                      {showParentBreadcrumb && (
                        <div
                          className="mb-1 flex items-center gap-1 text-[11px] text-[#1d4ed8] dark:text-blue-400 font-medium truncate"
                          title={`Parent deliverable: ${task.parentTaskTitle}`}
                        >
                          <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{task.parentTaskTitle}</span>
                        </div>
                      )}

                      {(task.client || task.project || showDisciplineMeta || assetDetail) && (
                        <div className="mb-0.5 flex items-center gap-1 text-[11px] text-[var(--text-secondary)] truncate">
                          {task.client && (
                            <span className="font-semibold text-[var(--text-primary)] truncate">
                              {task.client}
                            </span>
                          )}
                          {task.client && task.project && <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>}
                          {task.project && <span className="truncate">{task.project}</span>}
                          {(task.client || task.project) && showDisciplineMeta && (
                            <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
                          )}
                          {showDisciplineMeta && (
                            <span className="shrink-0 font-medium">{disciplineLabel}</span>
                          )}
                          {assetDetail && assetDetail.toLowerCase() !== taskDiscipline && (
                            <>
                              {(task.client || task.project || showDisciplineMeta) && (
                                <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
                              )}
                              <span className="truncate">{assetDetail}</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Title opens modal immediately (0ms delay) */}
                      <h3 className="text-[13px] font-semibold leading-snug">
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          title="Click to inspect brief details"
                          className="mobile-tap-control sm:min-h-0 w-full text-left cursor-pointer rounded px-1 -mx-1 py-0.5 text-[var(--text-primary)] hover:text-[#1d4ed8] dark:hover:text-blue-400 hover:bg-[var(--surface-subtle)] transition-colors line-clamp-2"
                        >
                          {task.title}
                        </button>
                      </h3>

                      {/* Optional External Brief Link (matches Swimlane TaskCard link row) */}
                      {task.brandGuidelines && isValidHttpUrl(task.brandGuidelines) && (
                        <div className="mt-1.5 flex items-center gap-2.5 text-[11px]">
                          <a
                            href={task.brandGuidelines}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title={`Open Brand Guidelines: ${task.brandGuidelines}`}
                            className="mobile-tap-control sm:min-h-0 inline-flex items-center gap-0.5 font-medium text-[#1d4ed8] dark:text-blue-400 hover:underline"
                          >
                            <Link2 className="h-2.5 w-2.5 shrink-0" />
                            <span>Brand Guidelines</span>
                            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Deadline, Priority Flag & Assign CTA */}
                    <div className="mt-2 pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          title={task.dueDate ? `Target Deadline: ${formatDateOnly(task.dueDate)}` : 'No deadline set'}
                          className={`inline-flex items-center gap-1 text-[11px] leading-none tabular-nums ${
                            dueDays !== null && dueDays < 0
                              ? 'font-bold text-red-600 dark:text-red-400'
                              : dueDays !== null && dueDays === 0
                              ? 'font-semibold text-amber-700 dark:text-amber-400'
                              : 'font-medium text-[var(--text-secondary)]'
                          }`}
                        >
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{task.dueDate ? formatDateOnly(task.dueDate) : 'No deadline'}</span>
                        </span>

                        {task.priority && priorityLabel && (
                          <span
                            title={priorityLabel}
                            className={`inline-flex items-center gap-0.5 leading-none shrink-0 text-[11px] font-semibold capitalize ${
                              task.priority === 'high'
                                ? 'text-red-600 dark:text-red-400'
                                : task.priority === 'medium'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            <Flag
                              aria-hidden="true"
                              className={`h-3 w-3 shrink-0 ${
                                task.priority === 'high'
                                  ? 'fill-red-500/20'
                                  : task.priority === 'medium'
                                  ? 'fill-amber-500/20'
                                  : ''
                              }`}
                            />
                            <span>{task.priority === 'medium' ? 'Med' : task.priority}</span>
                          </span>
                        )}
                      </div>

                      {assignee ? (
                        <button
                          type="button"
                          onClick={() => canAssignTask && onOpenAssignmentModal(task)}
                          title={canAssignTask ? 'Click to reassign, adjust estimate, or move to To Do' : `Assigned to ${assignee.name}`}
                          className={`mobile-tap-control sm:min-h-0 flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                            canAssignTask
                              ? 'text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer'
                              : 'text-[var(--text-primary)] cursor-default'
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#1d4ed8] dark:bg-blue-400 shrink-0" />
                          <span className="truncate max-w-[100px]">
                            {assigneeIds.length > 1 ? `${assignee.name} +${assigneeIds.length - 1}` : assignee.name}
                          </span>
                        </button>
                      ) : canAssignTask ? (
                        <button
                          type="button"
                          onClick={() => onOpenAssignmentModal(task)}
                          title="Assign member and move straight into To Do"
                          className="mobile-tap-control sm:min-h-0 inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25"
                        >
                          <UserX className="h-3 w-3" />
                          <span>Assign</span>
                        </button>
                      ) : (
                        <span
                          title="Unassigned in pipeline (view-only)"
                          className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
                        >
                          <UserX className="h-3 w-3" />
                          <span>Unassigned</span>
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {mobileMenuTask && canManagePipeline && createPortal(
        <div
          ref={mobileMenuPopRef}
          role="menu"
          aria-label={`Actions for ${mobileMenuTask.title}`}
          style={
            mobileMenuPos
              ? { top: `${mobileMenuPos.top}px`, left: `${mobileMenuPos.left}px` }
              : { top: 0, left: 0, visibility: 'hidden' }
          }
          onClick={e => e.stopPropagation()}
          className="menu-surface fixed z-50 w-44 rounded-[9px] border border-[var(--border)] p-1 text-[var(--text-primary)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = mobileMenuTask;
              setMobileMenuTask(null);
              onEditTask(target);
            }}
            className="menu-item cursor-pointer"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit Brief</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = mobileMenuTask;
              setMobileMenuTask(null);
              onDeleteTask(target);
            }}
            className="menu-item cursor-pointer text-red-600 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Brief</span>
          </button>
        </div>,
        document.body
      )}
    </section>
  );
};
