import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { Task, User, Role } from '../types';
import { getCognitiveLoadLabel } from '../utils/workload';
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
  Tag,
  Briefcase,
  FileText,
  Palette,
  Video as VideoIcon,
  Layout,
} from 'lucide-react';

interface TeamPipelineProps {
  team: Role;
  tasks: Task[];
  users: User[];
  onOpenCreateModal: () => void;
  onOpenAssignmentModal: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onMoveTask: (taskId: string, targetUserId: string, newStatus: any) => void;
  onDragTaskStart?: (task: Task) => void;
  onDragTaskEnd?: () => void;
}

const DISCIPLINE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  content: FileText,
  design: Palette,
  video: VideoIcon,
  ui_ux: Layout,
  research: Search,
};

export const TeamPipeline: React.FC<TeamPipelineProps> = ({
  team,
  tasks,
  users,
  onOpenCreateModal,
  onOpenAssignmentModal,
  onEditTask,
  onDeleteTask,
  onMoveTask: _onMoveTask,
  onDragTaskStart,
  onDragTaskEnd,
}) => {
  const {
    canCreatePipelineTask,
    canAssignTask,
    updateTask,
  } = useDashboard();

  const [pipelineSearch, setPipelineSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Inline editing state for task title in pipeline
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Lookup map of users for fast assignee matching
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) {
      map.set(u.id, u);
    }
    return map;
  }, [users]);

  // Centralized team pipeline tasks: status === 'pipeline' AND team === activeTeam (no cross-team duplication)
  const pipelineTasks = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) {
      if (!task || !task.id) continue;
      if (task.status !== 'pipeline') continue;

      const taskTeam = task.team || (task.userId ? userMap.get(task.userId)?.role : undefined);
      if (taskTeam === team) {
        map.set(task.id, task);
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [tasks, team, userMap]);

  // Metrics
  const totalCount = pipelineTasks.length;
  const unassignedCount = useMemo(() => {
    return pipelineTasks.filter(t => !t.userId || t.userId === '').length;
  }, [pipelineTasks]);
  const assignedCount = totalCount - unassignedCount;

  // Filtered tasks for display
  const displayedTasks = useMemo(() => {
    let result = pipelineTasks;

    if (filterMode === 'unassigned') {
      result = result.filter(t => !t.userId || t.userId === '');
    } else if (filterMode === 'assigned') {
      result = result.filter(t => Boolean(t.userId && t.userId !== ''));
    }

    const query = pipelineSearch.trim().toLowerCase();
    if (query) {
      result = result.filter(t => {
        const matchesTitle = t.title.toLowerCase().includes(query);
        const matchesDesc = t.description ? t.description.toLowerCase().includes(query) : false;
        const matchesClient = t.client ? t.client.toLowerCase().includes(query) : false;
        const matchesProject = t.project ? t.project.toLowerCase().includes(query) : false;
        const assignee = t.userId ? userMap.get(t.userId)?.name.toLowerCase() : '';
        const matchesAssignee = assignee ? assignee.includes(query) : false;
        return matchesTitle || matchesDesc || matchesClient || matchesProject || matchesAssignee;
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
          team: team,
        });
      }
    }
  };

  const DisciplineIcon = DISCIPLINE_ICONS[team] || Inbox;
  const teamLabel = team === 'ui_ux' ? 'UI/UX' : team.charAt(0).toUpperCase() + team.slice(1);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`surface mb-5 rounded-2xl border transition-all ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-indigo-500/30'
          : 'border-[var(--border)] bg-[var(--surface)] shadow-sm'
      }`}
    >
      {/* Top Banner: Pipeline Information, Counters, and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 border-b border-[var(--border)] bg-neutral-50/50 dark:bg-white/[0.01]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <DisciplineIcon className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {teamLabel} Team Pipeline
            </h3>
            <span className="rounded-full bg-neutral-200 dark:bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 dark:text-white/60">
              {totalCount} total
            </span>
          </div>
        </div>

        {/* Filter Pills, Search & Create Task Button */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Filter Modes */}
          <div className="flex items-center rounded-xl bg-neutral-100 dark:bg-white/5 p-1 border border-[var(--border)] text-[11px] font-medium">
            <button
              type="button"
              aria-pressed={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-0.5 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-[var(--surface-raised)] text-neutral-900 dark:text-white font-semibold shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'unassigned'}
              onClick={() => setFilterMode('unassigned')}
              className={`px-2.5 py-0.5 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'unassigned'
                  ? 'bg-[var(--surface-raised)] text-amber-600 dark:text-amber-400 font-semibold shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
              }`}
            >
              Unassigned ({unassignedCount})
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'assigned'}
              onClick={() => setFilterMode('assigned')}
              className={`px-2.5 py-0.5 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'assigned'
                  ? 'bg-[var(--surface-raised)] text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
              }`}
            >
              Assigned ({assignedCount})
            </button>
          </div>

          {/* Inline Pipeline Search */}
          <div className="relative">
            <input
              type="text"
              value={pipelineSearch}
              onChange={e => setPipelineSearch(e.target.value)}
              aria-label="Search pipeline"
              placeholder="Search pipeline..."
              className="w-32 sm:w-40 rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-7 pr-2.5 py-1 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-indigo-500 focus:outline-none"
            />
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-neutral-400" />
            {pipelineSearch && (
              <button
                type="button"
                aria-label="Clear pipeline search"
                onClick={() => setPipelineSearch('')}
                className="absolute right-2 top-1 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Add Pipeline Task (Role-Guarded) */}
          {canCreatePipelineTask ? (
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add {teamLabel} Task</span>
            </button>
          ) : (
            <div
              title="Task creation is restricted to Accounts team members and authorized leadership"
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] bg-neutral-100/50 dark:bg-white/[0.02]"
            >
              <Shield className="h-3 w-3" />
              <span>View-Only Pipeline</span>
            </div>
          )}

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(prev => !prev)}
            title={isCollapsed ? 'Expand pipeline' : 'Collapse pipeline'}
            className="rounded-lg p-1 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs"
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Pipeline Cards Ribbon */}
      {!isCollapsed && (
        <div className="p-3 sm:p-4 overflow-x-auto">
          {displayedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 dark:border-white/10 py-8 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/5 text-neutral-400 mb-2">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-neutral-700 dark:text-white/80">
                {pipelineSearch || filterMode !== 'all'
                  ? 'No matching tasks in pipeline'
                  : `${teamLabel} pipeline is currently empty`}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] max-w-sm mt-0.5">
                {pipelineSearch || filterMode !== 'all'
                  ? 'Try clearing the search query or changing the filter mode.'
                  : canCreatePipelineTask
                  ? `Create tasks using the button above. Tasks enter as unassigned for Creative Director review and estimation.`
                  : `Unscheduled deliverables created by Accounts will appear here.`}
              </p>
              {canCreatePipelineTask && !pipelineSearch && filterMode === 'all' && (
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="mt-3 flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First {teamLabel} Task</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 py-1 px-0.5 scroll-smooth min-h-[92px]">
              {displayedTasks.map(task => {
                const isEditingThis = editingTaskId === task.id;
                const assignee = task.userId ? userMap.get(task.userId) : null;
                const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, team);
                const metadata = task.disciplineMetadata;

                return (
                  <motion.div
                    key={task.id}
                    layout="position"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
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
                        userId: task.userId || '',
                        team: task.team || team,
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
                    className="group relative flex flex-col justify-between shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xs hover:shadow-sm hover:border-indigo-400/50 dark:hover:border-indigo-500/30 transition-all select-none cursor-grab active:cursor-grabbing w-64 sm:w-72 min-h-[110px]"
                  >
                    <div>
                      {/* Top Row: Priority & Drag Handle & Actions */}
                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="text-neutral-400 dark:text-white/20 group-hover:text-neutral-700 dark:group-hover:text-white/60 shrink-0">
                            <GripVertical className="h-3.5 w-3.5" />
                          </div>
                          {task.priority && (
                            <span className={`px-1.5 py-0.2 rounded text-[11px] font-semibold uppercase tracking-wider ${
                              task.priority === 'high'
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                : task.priority === 'medium'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {task.priority}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className="text-[11px] text-[var(--text-secondary)] truncate">
                              Due: {task.dueDate}
                            </span>
                          )}
                        </div>

                        {/* Quick hover actions */}
                        <div className="flex items-center card-actions opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onEditTask(task);
                            }}
                            title="Edit task details"
                            className="rounded p-1 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
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
                            className="rounded p-1 text-neutral-400 hover:text-red-500 dark:text-white/40 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Title: inline editable */}
                      {isEditingThis ? (
                        <div className="mb-2" onClick={e => e.stopPropagation()}>
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
                            className="w-full rounded border border-indigo-500 bg-[var(--surface)] px-1.5 py-0.5 text-xs text-neutral-900 dark:text-white focus:outline-none"
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
                          className="text-xs font-semibold text-neutral-900 dark:text-white break-words line-clamp-2 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-text leading-snug mb-1.5"
                        >
                          {task.title}
                        </h4>
                      )}

                      {/* Account & Project Pills */}
                      {(task.client || task.project) && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[var(--text-secondary)] mb-2">
                          {task.client && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-white/5 border border-[var(--border)] truncate max-w-[130px]">
                              <Briefcase className="h-2.5 w-2.5 text-neutral-400" />
                              <span className="truncate">{task.client}</span>
                            </span>
                          )}
                          {task.project && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-white/5 border border-[var(--border)] truncate max-w-[130px]">
                              <Tag className="h-2.5 w-2.5 text-neutral-400" />
                              <span className="truncate">{task.project}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Discipline Metadata Badges */}
                      {metadata && (
                        <div className="flex items-center gap-1 flex-wrap text-[11px] text-neutral-600 dark:text-white/50 mb-2">
                          {metadata.contentType && (
                            <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-300 font-medium">
                              {metadata.contentType}
                            </span>
                          )}
                          {metadata.wordCount && (
                            <span className="px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-white/5 font-medium">
                              {metadata.wordCount} words
                            </span>
                          )}
                          {metadata.assetType && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-medium">
                              {metadata.assetType}
                            </span>
                          )}
                          {metadata.dimensions && (
                            <span className="px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-white/5 font-medium">
                              {metadata.dimensions}
                            </span>
                          )}
                          {metadata.videoType && (
                            <span className="px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-600 dark:text-violet-300 font-medium">
                              {metadata.videoType}
                            </span>
                          )}
                          {metadata.duration && (
                            <span className="px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-white/5 font-medium">
                              {metadata.duration}
                            </span>
                          )}
                          {metadata.designType && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 font-medium">
                              {metadata.designType}
                            </span>
                          )}
                          {metadata.screens && (
                            <span className="px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-white/5 font-medium">
                              {metadata.screens} screens
                            </span>
                          )}
                          {metadata.researchType && (
                            <span className="px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-600 dark:text-teal-300 font-medium">
                              {metadata.researchType}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Assignee + Cognitive Load + Estimated Hours */}
                    <div className="pt-2 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between gap-1.5">
                      {/* Assignee Section */}
                      <div>
                        {assignee ? (
                          <div
                            onClick={() => canAssignTask && onOpenAssignmentModal(task)}
                            title={canAssignTask ? 'Click to reassign or adjust estimates' : `Assigned to ${assignee.name}`}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-colors ${
                              canAssignTask
                                ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 cursor-pointer'
                                : 'bg-neutral-100 dark:bg-white/5 border-[var(--border)] text-neutral-700 dark:text-white/80'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            <span className="truncate max-w-[85px]">{assignee.name}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenAssignmentModal(task)}
                            title={canAssignTask ? 'Assign task to matching discipline member' : 'Unassigned in pipeline'}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                              canAssignTask
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
                                : 'bg-neutral-100 dark:bg-white/5 border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <UserX className="h-3 w-3" />
                            <span>{canAssignTask ? 'Assign' : 'Unassigned'}</span>
                          </button>
                        )}
                      </div>

                      {/* Cognitive Load & Hours Pills */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          title={`Cognitive Load: ${cognitiveLabel}`}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${
                            task.cognitiveLoad === 'high'
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : task.cognitiveLoad === 'medium'
                              ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                              : 'bg-green-500/15 text-green-600 dark:text-green-400'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              task.cognitiveLoad === 'high'
                                ? 'bg-red-500'
                                : task.cognitiveLoad === 'medium'
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                          />
                          <span>{task.cognitiveLoad}</span>
                        </span>

                        {task.estimatedHours !== undefined && task.estimatedHours > 0 && (
                          <span
                            title={`Estimated Effort: ${task.estimatedHours} hours`}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-[11px] font-semibold text-neutral-700 dark:text-white/80"
                          >
                            <Clock className="h-2.5 w-2.5 text-neutral-400" />
                            <span>{task.estimatedHours}h</span>
                          </span>
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
    </div>
  );
};

