import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { Task, CognitiveLoad, TaskStatus } from '../types';
import { getTaskBillableMs, formatBillableDetailed, getLastDayOfMonth } from '../utils/workload';
import { X, Calendar, Brain, Trash2, History, Clock, ArrowRight, CheckCircle2, UserCheck, PlusCircle, Timer, ChevronDown, Check, CopyPlus, CornerDownRight } from 'lucide-react';

function formatActivityTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '< 1m';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0) return `${days}d ${remHours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(ms / (1000 * 60));
  return `${Math.max(1, minutes)}m`;
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskToEdit?: Task | null;
  defaultUserId?: string;
  defaultStatus?: TaskStatus;
  onAdjustBillableHours?: (task: Task) => void;
  onDuplicateTask?: (task: Task) => void;
}

interface SpaceDropdownRowProps {
  space: { id: string; name: string };
  folderListStr: string;
  fullText: string;
  isSelected: boolean;
  onSelect: () => void;
}

const SpaceDropdownRow: React.FC<SpaceDropdownRowProps> = ({
  space,
  folderListStr,
  fullText,
  isSelected,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [overflowDistance, setOverflowDistance] = useState(0);

  const measureOverflow = () => {
    if (containerRef.current && textRef.current) {
      const diff = Math.ceil(textRef.current.offsetWidth - containerRef.current.clientWidth);
      setOverflowDistance(diff > 4 ? diff : 0);
    }
  };

  useEffect(() => {
    measureOverflow();
  }, [fullText]);

  const totalDuration = useMemo(() => {
    if (overflowDistance <= 0) return 0;
    return Math.max(3.5, Math.min(10, overflowDistance / 25 + 2));
  }, [overflowDistance]);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => {
        measureOverflow();
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      className={`group w-full max-w-full px-2.5 py-1.5 text-xs cursor-pointer flex items-center justify-between transition-colors ${
        isSelected
          ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium'
          : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5'
      }`}
    >
      <div
        ref={containerRef}
        className="flex-1 min-w-0 overflow-hidden no-scrollbar py-0.5 text-left"
        title={fullText}
      >
        <div
          ref={textRef}
          style={
            isHovered && overflowDistance > 0
              ? ({
                  '--scroll-dist': `-${overflowDistance}px`,
                  animation: `auto-scroll-hover ${totalDuration}s ease-in-out infinite`,
                } as React.CSSProperties)
              : {
                  transform: 'translateX(0)',
                  transition: 'transform 0.3s ease-out',
                }
          }
          className="inline-block whitespace-nowrap"
        >
          <span className="font-medium">{space.name}</span>
          {folderListStr && (
            <span className="text-neutral-500 dark:text-white/45 ml-1.5 font-normal">
              | {folderListStr}
            </span>
          )}
        </div>
      </div>
      {isSelected && (
        <Check className="h-3.5 w-3.5 shrink-0 ml-2 text-purple-600 dark:text-purple-400" />
      )}
    </div>
  );
};

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  taskToEdit,
  defaultUserId,
  defaultStatus = 'todo',
  onAdjustBillableHours,
  onDuplicateTask,
}) => {
  const {
    tasks,
    users,
    currentUser,
    createTask,
    updateTask,
    deleteTask,
    isZensciencesUser,
    isClickupConnected,
    selectedClickupSpaceId,
    setSelectedClickupSpaceId,
    clickupSpaces,
    clickupFoldersAndLists,
    spaceFoldersMap,
    createClickupList,
    canEditUserTasks,
    clickupCustomFieldOptions,
    clickupTaskTypeFieldId: ctxClickupTaskTypeFieldId,
    isSuperadmin,
    isCreativeDirector,
  } = useDashboard();

  const canDuplicate = Boolean(isSuperadmin || isCreativeDirector);

  // Delegated subtasks (if this task is a parent task with child subtasks)
  const delegatedSubtasks = useMemo(() => {
    if (!taskToEdit) return [];
    return tasks.filter(t => t.parentTaskId === taskToEdit.id);
  }, [tasks, taskToEdit]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [userId, setUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [cognitiveLoad, setCognitiveLoad] = useState<CognitiveLoad>('medium');
  const [status, setStatus] = useState<TaskStatus>('todo');

  // ClickUp Task Type custom field state
  const [clickupTaskType, setClickupTaskType] = useState<string>('');
  const [clickupTaskTypeId, setClickupTaskTypeId] = useState<string>('');
  const [clickupTaskTypeFieldId, setClickupTaskTypeFieldId] = useState<string>('');

  // ClickUp folder and list destination state
  const [clickupFolderId, setClickupFolderId] = useState<string>('');
  const [clickupListId, setClickupListId] = useState<string>('');
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isSubmittingNewList, setIsSubmittingNewList] = useState(false);
  const [newListError, setNewListError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isSpaceDropdownOpen, setIsSpaceDropdownOpen] = useState(false);
  const spaceDropdownRef = useRef<HTMLDivElement>(null);

  const canEdit = useMemo(() => {
    if (!taskToEdit) return true;
    return canEditUserTasks(taskToEdit.userId);
  }, [taskToEdit, canEditUserTasks]);

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.title);
      setDescription(taskToEdit.description || '');
      setUserId(taskToEdit.userId);
      setDueDate(taskToEdit.dueDate || '');
      setCognitiveLoad(taskToEdit.cognitiveLoad);
      setStatus(taskToEdit.status);
      setClickupFolderId(taskToEdit.clickupFolderId || '');
      setClickupListId(taskToEdit.clickupListId || '');
      setClickupTaskType(taskToEdit.clickupTaskType || '');
      setClickupTaskTypeId(taskToEdit.clickupTaskTypeId || '');
      setClickupTaskTypeFieldId(taskToEdit.clickupTaskTypeFieldId || ctxClickupTaskTypeFieldId || '');
    } else {
      setTitle('');
      setDescription('');
      const defaultUser = defaultUserId || currentUser?.id || users[0]?.id || '';
      setUserId(defaultUser);
      setDueDate('');
      setCognitiveLoad('medium');
      setStatus(defaultStatus);
      setClickupFolderId('');
      setClickupListId('');

      // If user has a role, match default task type if options available
      const userObj = users.find(u => u.id === defaultUser);
      const roleName = userObj?.role === 'content' ? 'Content & Copy' : 'Design';
      const matchedOption = clickupCustomFieldOptions?.find(
        o => o.name.toLowerCase() === roleName.toLowerCase()
      );
      if (matchedOption) {
        setClickupTaskType(matchedOption.name);
        setClickupTaskTypeId(matchedOption.id);
      } else {
        setClickupTaskType('');
        setClickupTaskTypeId('');
      }
      setClickupTaskTypeFieldId(ctxClickupTaskTypeFieldId || '');
    }
    setShowConfirmDelete(false);
    setIsCreatingList(false);
    setNewListName('');
    setNewListError(null);
    setIsSpaceDropdownOpen(false);
  }, [
    taskToEdit,
    defaultUserId,
    defaultStatus,
    currentUser,
    users,
    isOpen,
    ctxClickupTaskTypeFieldId,
    clickupCustomFieldOptions,
  ]);

  // Derived effective task type options (ClickUp dropdown custom fields with fallback)
  const effectiveTaskTypeOptions = useMemo(() => {
    let list =
      clickupCustomFieldOptions && clickupCustomFieldOptions.length > 0
        ? [...clickupCustomFieldOptions]
        : [
            { id: 'content', name: 'Content & Copy' },
            { id: 'design', name: 'Design' },
          ];
    if (
      clickupTaskType &&
      !list.some(
        o => o.name.toLowerCase() === clickupTaskType.toLowerCase() || o.id === clickupTaskTypeId
      )
    ) {
      list.unshift({ id: clickupTaskTypeId || clickupTaskType, name: clickupTaskType });
    }
    return list;
  }, [clickupCustomFieldOptions, clickupTaskType, clickupTaskTypeId]);

  const activities = useMemo(() => {
    return taskToEdit?.activityLog || [];
  }, [taskToEdit]);

  const cycleMetrics = useMemo(() => {
    if (!taskToEdit) return null;
    const startMs = taskToEdit.createdAt ? new Date(taskToEdit.createdAt).getTime() : 0;
    const endMs = taskToEdit.completedAt
      ? new Date(taskToEdit.completedAt).getTime()
      : (taskToEdit.status === 'done' ? Date.now() : Date.now());

    const totalLeadTimeMs = startMs > 0 ? Math.max(0, endMs - startMs) : 0;

    // Time in current status: find latest activity that changed status or created task
    const statusChangeAct = activities.find(a => a.action === 'status_change' || a.action === 'created');
    const statusStartMs = statusChangeAct ? new Date(statusChangeAct.timestamp).getTime() : startMs;
    const currentStatusMs = statusStartMs > 0 ? Math.max(0, Date.now() - statusStartMs) : 0;

    const billableMs = getTaskBillableMs(taskToEdit);
    const billableDetailedStr = formatBillableDetailed(billableMs);

    return {
      isDone: taskToEdit.status === 'done',
      totalLeadTimeStr: totalLeadTimeMs > 0 ? formatDuration(totalLeadTimeMs) : '< 1m',
      currentStatusStr: currentStatusMs > 0 ? formatDuration(currentStatusMs) : '< 1m',
      billableDetailedStr,
      revisionCount: activities.length,
    };
  }, [taskToEdit, activities]);

  // Available lists for the selected folder
  const availableLists = useMemo(() => {
    const folders = clickupFoldersAndLists?.folders || [];
    const folderlessLists = clickupFoldersAndLists?.folderlessLists || [];
    if (clickupFolderId) {
      const folder = folders.find(f => f.id === clickupFolderId);
      return folder?.lists || [];
    }
    return folderlessLists;
  }, [clickupFolderId, clickupFoldersAndLists]);

  // Click outside and Escape key handler for Space dropdown
  useEffect(() => {
    if (!isSpaceDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (spaceDropdownRef.current && !spaceDropdownRef.current.contains(e.target as Node)) {
        setIsSpaceDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSpaceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSpaceDropdownOpen]);

  // Currently selected space display label
  const selectedSpaceInfo = useMemo(() => {
    if (!selectedClickupSpaceId) return null;
    const s = clickupSpaces.find(space => space.id === selectedClickupSpaceId);
    if (!s) return null;
    const folders =
      spaceFoldersMap[s.id] ||
      (s.id === selectedClickupSpaceId ? clickupFoldersAndLists?.folders?.map(f => f.name) : undefined);
    const folderListStr =
      folders && folders.length > 0
        ? `(${folders.join(', ')})`
        : folders
        ? '(Folderless)'
        : '';
    return {
      name: s.name,
      folderListStr,
      fullText: folderListStr ? `${s.name} | ${folderListStr}` : s.name,
    };
  }, [clickupSpaces, selectedClickupSpaceId, spaceFoldersMap, clickupFoldersAndLists]);

  if (!isOpen) return null;

  const selectedUser = users.find(u => u.id === userId);
  const role = selectedUser?.role || 'content';

  // Quick due dates helper
  const setQuickDate = (daysFromNow: number | null) => {
    if (daysFromNow === null) {
      setDueDate('');
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDueDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleCreateNewList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setIsSubmittingNewList(true);
    setNewListError(null);
    try {
      const created = await createClickupList(
        newListName.trim(),
        selectedClickupSpaceId,
        clickupFolderId || undefined
      );
      if (created) {
        setClickupListId(created.id);
        setIsCreatingList(false);
        setNewListName('');
      } else {
        setNewListError('Failed to create list');
      }
    } catch (err: any) {
      setNewListError(err.message || 'Error creating list');
    } finally {
      setIsSubmittingNewList(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isDeadlineRequired = status !== 'pipeline';
    if (!title.trim() || !userId || (isDeadlineRequired && !dueDate.trim()) || !canEdit) return;

    setIsSubmitting(true);
    const finalDueDate = status === 'pipeline' ? undefined : (dueDate.trim() || undefined);

    // Resolve folder and list names
    let folderName: string | undefined;
    let listName: string | undefined;
    const folders = clickupFoldersAndLists?.folders || [];
    const folderlessLists = clickupFoldersAndLists?.folderlessLists || [];
    if (clickupFolderId) {
      const f = folders.find(fold => fold.id === clickupFolderId);
      folderName = f?.name;
      const l = f?.lists?.find(lst => lst.id === clickupListId);
      listName = l?.name;
    } else if (clickupListId) {
      const l = folderlessLists.find(lst => lst.id === clickupListId);
      listName = l?.name;
    }

    try {
      if (taskToEdit) {
        await updateTask(taskToEdit.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          userId,
          dueDate: finalDueDate,
          cognitiveLoad,
          status,
          clickupFolderId: clickupFolderId || undefined,
          clickupFolderName: folderName,
          clickupListId: clickupListId || undefined,
          clickupListName: listName,
          clickupSpaceId: selectedClickupSpaceId || undefined,
          clickupTaskType: clickupTaskType || undefined,
          clickupTaskTypeId: clickupTaskTypeId || undefined,
          clickupTaskTypeFieldId: clickupTaskTypeFieldId || ctxClickupTaskTypeFieldId || undefined,
        });
      } else {
        await createTask({
          userId,
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate: finalDueDate,
          cognitiveLoad,
          status,
          clickupFolderId: clickupFolderId || undefined,
          clickupFolderName: folderName,
          clickupListId: clickupListId || undefined,
          clickupListName: listName,
          clickupSpaceId: selectedClickupSpaceId || undefined,
          clickupTaskType: clickupTaskType || undefined,
          clickupTaskTypeId: clickupTaskTypeId || undefined,
          clickupTaskTypeFieldId: clickupTaskTypeFieldId || ctxClickupTaskTypeFieldId || undefined,
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!taskToEdit || !canEdit) return;
    setIsSubmitting(true);
    try {
      await deleteTask(taskToEdit.id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isSubmittingNewList) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, isSubmittingNewList, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSubmitting && !isSubmittingNewList) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            id="task-modal"
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-6 shadow-2xl transition-all text-neutral-900 dark:text-white"
          >
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-3.5">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
            {taskToEdit ? 'Edit Task' : 'Create New Task'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Subtask Breadcrumb if editing a delegated subtask */}
          {taskToEdit?.isSubtask && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-500/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              <CornerDownRight className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="truncate">
                <span className="font-semibold text-neutral-900 dark:text-white">Subtask of: </span>
                <span className="font-medium">{taskToEdit.parentTaskTitle || 'Parent Task'}</span>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 ml-1.5">(Independent workflow)</span>
              </div>
            </div>
          )}

          {/* Delegated Subtasks list if parent task has subtasks */}
          {delegatedSubtasks.length > 0 && (
            <div className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50 dark:bg-[#1A1A1A] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <CornerDownRight className="h-3.5 w-3.5 text-blue-500" />
                  <span>Delegated Subtasks ({delegatedSubtasks.length})</span>
                </span>
                <span className="text-[10px] text-neutral-400 dark:text-white/40">
                  Independent on team boards
                </span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {delegatedSubtasks.map(st => {
                  const assignee = users.find(u => u.id === st.userId);
                  return (
                    <div
                      key={st.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-black/30 border border-neutral-200/60 dark:border-white/5 px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white bg-gradient-to-br ${
                            assignee?.avatarColor || 'from-blue-600 to-indigo-600'
                          }`}
                        >
                          {assignee?.name.charAt(0).toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                          {assignee?.name || 'Unassigned'}
                        </span>
                        <span className="text-neutral-400 dark:text-white/40 truncate">
                          — {st.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold capitalize px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 shrink-0">
                        {st.status.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Task Name & Task Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Task Name <span className="text-red-500">*</span>
              </label>
              <input
                id="task-title-input"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Redesign navigation menu for mobile screens"
                className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                required
                autoFocus
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Task Type
              </label>
              <div className="relative">
                <select
                  id="task-type-select"
                  value={clickupTaskTypeId || clickupTaskType}
                  onChange={e => {
                    const val = e.target.value;
                    const opt = effectiveTaskTypeOptions.find(o => o.id === val || o.name === val);
                    if (opt) {
                      setClickupTaskTypeId(opt.id);
                      setClickupTaskType(opt.name);
                    } else {
                      setClickupTaskTypeId(val);
                      setClickupTaskType(val);
                    }
                  }}
                  className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 pl-3 pr-8 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-0 transition-colors cursor-pointer hover:border-neutral-400 dark:hover:border-white/20"
                >
                  <option value="">Select Type...</option>
                  {effectiveTaskTypeOptions.map(opt => (
                    <option key={opt.id} value={opt.id} className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">
                      {opt.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
              </div>
            </div>
          </div>

          {/* Row: Assignee & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Assignee */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Assignee
              </label>
              <div className="relative">
                <select
                  id="task-assignee-select"
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 pl-3 pr-8 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-0 transition-colors cursor-pointer hover:border-neutral-400 dark:hover:border-white/20"
                >
                  {users.length === 0 ? (
                    <option value="" disabled>
                      No members yet — please add a member first
                    </option>
                  ) : (
                    users.map(u => (
                      <option key={u.id} value={u.id} className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">
                        {u.name} ({u.role === 'content' ? 'Content' : 'Design'})
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
              </div>
              {users.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-500 dark:text-amber-400">
                  Please add at least one member before assigning tasks.
                </p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Status
              </label>
              <div className="relative">
                <select
                  id="task-status-select"
                  value={status}
                  onChange={e => setStatus(e.target.value as TaskStatus)}
                  className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 pl-3 pr-8 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-0 transition-colors capitalize cursor-pointer hover:border-neutral-400 dark:hover:border-white/20"
                >
                  <option value="pipeline" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">Pipeline (Backlog)</option>
                  <option value="todo" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">To Do</option>
                  <option value="in_progress" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">In Progress</option>
                  <option value="in_review" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">In Review</option>
                  <option value="done" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">Done</option>
                  <option value="archived" className="bg-white dark:bg-[#141414] text-neutral-900 dark:text-white">Archived</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
              </div>
            </div>
          </div>

          {/* Cognitive Load Picker with role-specific definitions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
                <span>Cognitive Load</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="cognitive-load-low"
                onClick={() => setCognitiveLoad('low')}
                className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                  cognitiveLoad === 'low'
                    ? 'border-green-500/50 bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-400 ring-1 ring-green-500/30'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] text-neutral-600 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-xs font-semibold">Low</span>
                </div>
                <span className="text-[10px] text-neutral-500 dark:text-white/50 mt-1 leading-tight">
                  {role === 'content' ? 'Content Writing' : 'Adaptive Design'}
                </span>
              </button>

              <button
                type="button"
                id="cognitive-load-medium"
                onClick={() => setCognitiveLoad('medium')}
                className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                  cognitiveLoad === 'medium'
                    ? 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-500/30'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] text-neutral-600 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="text-xs font-semibold">Medium</span>
                </div>
                <span className="text-[10px] text-neutral-500 dark:text-white/50 mt-1 leading-tight">
                  {role === 'content' ? 'Creative Concept' : 'Conceptual Design'}
                </span>
              </button>

              <button
                type="button"
                id="cognitive-load-high"
                onClick={() => setCognitiveLoad('high')}
                className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                  cognitiveLoad === 'high'
                    ? 'border-red-500/50 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 ring-1 ring-red-500/30'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] text-neutral-600 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-xs font-semibold">High</span>
                </div>
                <span className="text-[10px] text-neutral-500 dark:text-white/50 mt-1 leading-tight">
                  {role === 'content' ? 'Strategy & Planning' : 'Identity Design'}
                </span>
              </button>
            </div>
          </div>

          {/* Due Date (Mandatory for active workflow lanes) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
                <span>Due Date</span>
                {status !== 'pipeline' && (
                  <span className="text-red-500 font-semibold text-[11px] normal-case ml-0.5">
                    * (Required)
                  </span>
                )}
              </label>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setQuickDate(0)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(1)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(3)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  +3d
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(7)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  +1w
                </button>
                <button
                  type="button"
                  onClick={() => setDueDate(getLastDayOfMonth())}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:text-white/40 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  End of month
                </button>
                {status === 'pipeline' && dueDate && (
                  <button
                    type="button"
                    onClick={() => setQuickDate(null)}
                    className="rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <input
              id="task-due-date-input"
              type="date"
              required={status !== 'pipeline'}
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className={`w-full rounded-xl border bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white focus:outline-none transition-colors ${
                status !== 'pipeline' && !dueDate
                  ? 'border-amber-400 dark:border-amber-500/50 focus:border-amber-500'
                  : 'border-neutral-300 dark:border-white/10 focus:border-blue-500'
              }`}
            />
            {status !== 'pipeline' && !dueDate && (
              <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                A deadline is required to add tasks directly into active workflow lanes.
              </p>
            )}
          </div>

          {/* ClickUp Destination (Folder & List) - for @zensciences.com users */}
          {isZensciencesUser && isClickupConnected && (
            <div className="rounded-xl border border-purple-500/25 bg-purple-50/30 dark:bg-purple-950/20 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <span>ClickUp Destination</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreatingList(!isCreatingList)}
                  className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline font-semibold"
                >
                  {isCreatingList ? 'Select Existing List' : '+ Create New List'}
                </button>
              </div>

              {/* Space Selection with folders against each space name */}
              <div>
                <label className="block text-[10px] uppercase font-semibold text-neutral-500 dark:text-white/40 mb-1">
                  Space
                </label>
                <div className="relative" ref={spaceDropdownRef}>
                  <button
                    type="button"
                    disabled={clickupSpaces.length === 0}
                    onClick={() => setIsSpaceDropdownOpen(prev => !prev)}
                    className={`w-full flex items-center justify-between rounded-xl border bg-white dark:bg-[#141414] py-1.5 pl-2.5 pr-2.5 text-xs text-neutral-900 dark:text-white transition-colors disabled:opacity-50 ${
                      isSpaceDropdownOpen
                        ? 'border-purple-500 ring-1 ring-purple-500/20'
                        : 'border-neutral-300 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/20'
                    }`}
                  >
                    <span className="truncate text-left flex-1 min-w-0 mr-1.5" title={selectedSpaceInfo?.fullText}>
                      {selectedSpaceInfo
                        ? selectedSpaceInfo.fullText
                        : clickupSpaces.length === 0
                        ? 'No spaces available'
                        : 'Select Space'}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-white/40 transition-transform duration-200 ${
                        isSpaceDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isSpaceDropdownOpen && clickupSpaces.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 w-full max-w-full z-50 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] shadow-xl py-1 max-h-60 overflow-y-auto overflow-x-hidden">
                      {clickupSpaces.map(s => {
                        const folders =
                          spaceFoldersMap[s.id] ||
                          (s.id === selectedClickupSpaceId
                            ? clickupFoldersAndLists?.folders?.map(f => f.name)
                            : undefined);
                        const folderListStr =
                          folders && folders.length > 0
                            ? `(${folders.join(', ')})`
                            : folders
                            ? '(Folderless)'
                            : '';
                        const fullText = folderListStr ? `${s.name} | ${folderListStr}` : s.name;
                        const isSelected = s.id === selectedClickupSpaceId;

                        return (
                          <SpaceDropdownRow
                            key={s.id}
                            space={s}
                            folderListStr={folderListStr}
                            fullText={fullText}
                            isSelected={isSelected}
                            onSelect={() => {
                              setSelectedClickupSpaceId(s.id, s.name);
                              setClickupFolderId('');
                              setClickupListId('');
                              setIsSpaceDropdownOpen(false);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {isCreatingList ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    placeholder="Enter new ClickUp list name..."
                    className="w-full rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-[#141414] py-1.5 px-3 text-xs text-neutral-900 dark:text-white"
                  />
                  {newListError && <p className="text-[10px] text-red-500">{newListError}</p>}
                  <button
                    type="button"
                    onClick={handleCreateNewList}
                    disabled={isSubmittingNewList || !newListName.trim()}
                    className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                  >
                    {isSubmittingNewList ? 'Creating...' : 'Create and Select'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Folder Selection */}
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-neutral-500 dark:text-white/40 mb-1">
                      Folder
                    </label>
                    <div className="relative">
                      <select
                        value={clickupFolderId}
                        onChange={e => {
                          setClickupFolderId(e.target.value);
                          setClickupListId('');
                        }}
                        className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-1.5 pl-2.5 pr-8 text-xs text-neutral-900 dark:text-white"
                      >
                        <option value="">Space (Folderless)</option>
                        {(clickupFoldersAndLists?.folders || []).map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
                    </div>
                  </div>

                  {/* List Selection */}
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-neutral-500 dark:text-white/40 mb-1">
                      List
                    </label>
                    <div className="relative">
                      <select
                        value={clickupListId}
                        onChange={e => setClickupListId(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-1.5 pl-2.5 pr-8 text-xs text-neutral-900 dark:text-white"
                      >
                        <option value="">Select a list...</option>
                        {availableLists.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!canEdit && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
              Read-only view: You only have permission to edit tasks on your assigned board or swimlane.
            </div>
          )}

          {/* Context (if any) - moved to end */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Context (if any)
            </label>
            <textarea
              id="task-description-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Key requirements, scope, or delivery specifications..."
              rows={2}
              className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-none transition-colors"
            />
          </div>

          {/* Micro Activity Audit Trail & Cycle Time */}
          {taskToEdit && (
            <div className="pt-3 border-t border-neutral-100 dark:border-white/5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/40">
                  <History className="h-3.5 w-3.5 text-blue-500" />
                  <span>Activity & Cycle Time</span>
                </div>
                {cycleMetrics && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-neutral-400 dark:text-white/40">
                    <span className="flex items-center gap-1 bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-neutral-200/50 dark:border-white/5">
                      <Clock className="h-3 w-3 text-neutral-500 dark:text-white/50" />
                      {cycleMetrics.isDone ? 'Completed in:' : 'Lead time:'} <strong className="text-neutral-700 dark:text-white/80">{cycleMetrics.totalLeadTimeStr}</strong>
                    </span>
                    <span className="bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-neutral-200/50 dark:border-white/5">
                      In status: <strong className="text-neutral-700 dark:text-white/80">{cycleMetrics.currentStatusStr}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onAdjustBillableHours?.(taskToEdit)}
                      title="Click to manually correct billable hours"
                      className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-500/25 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-400 transition-all cursor-pointer group"
                    >
                      <Timer className="h-3 w-3 text-blue-500 group-hover:scale-110 transition-transform" />
                      <span>Billable:</span>
                      <strong className="text-blue-700 dark:text-blue-300 underline decoration-blue-300 dark:decoration-blue-500 underline-offset-2">
                        {cycleMetrics.billableDetailedStr}
                      </strong>
                    </button>
                  </div>
                )}
              </div>

              {activities.length === 0 ? (
                <div className="rounded-xl border border-neutral-200/70 dark:border-white/5 bg-neutral-50 dark:bg-[#121212] p-3 text-center text-[11px] text-neutral-400 dark:text-white/30">
                  Created {formatActivityTime(taskToEdit.createdAt || '')} • No modifications recorded yet
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-neutral-200/70 dark:border-white/5 bg-neutral-50 dark:bg-[#121212] p-2.5 space-y-2 text-xs divide-y divide-neutral-100 dark:divide-white/5">
                  {activities.map(act => {
                    let IconComponent = Clock;
                    let iconBg = 'text-neutral-500 bg-neutral-200/60 dark:bg-white/10';

                    if (act.action === 'created') {
                      IconComponent = PlusCircle;
                      iconBg = 'text-blue-500 bg-blue-100 dark:bg-blue-500/10';
                    } else if (act.action === 'status_change') {
                      IconComponent = act.to === 'done' ? CheckCircle2 : ArrowRight;
                      iconBg = act.to === 'done'
                        ? 'text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10'
                        : 'text-amber-500 bg-amber-100 dark:bg-amber-500/10';
                    } else if (act.action === 'reassigned') {
                      IconComponent = UserCheck;
                      iconBg = 'text-purple-500 bg-purple-100 dark:bg-purple-500/10';
                    } else if (act.action === 'rescheduled') {
                      IconComponent = Calendar;
                      iconBg = 'text-sky-500 bg-sky-100 dark:bg-sky-500/10';
                    } else if (act.action === 'billable_adjusted') {
                      IconComponent = Timer;
                      iconBg = 'text-indigo-500 bg-indigo-100 dark:bg-indigo-500/10';
                    }

                    return (
                      <div key={act.id} className="pt-1.5 first:pt-0 flex items-start gap-2.5">
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
                          <IconComponent className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 leading-snug">
                            {act.details || (
                              act.action === 'status_change'
                                ? `Moved to ${act.to?.replace('_', ' ')}`
                                : act.action === 'reassigned'
                                ? `Assigned to ${act.to}`
                                : act.action === 'rescheduled'
                                ? `Due date: ${act.to}`
                                : act.action === 'billable_adjusted'
                                ? `Billable hours adjusted to ${act.to}`
                                : 'Task created'
                            )}
                          </p>
                          <span className="text-[10px] text-neutral-400 dark:text-white/30">
                            {formatActivityTime(act.timestamp)}
                            {act.actorName ? ` • by ${act.actorName}` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-white/5">
            {taskToEdit ? (
              <div>
                {showConfirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-red-500 font-medium">Confirm?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isSubmitting}
                      className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(false)}
                      className="rounded-xl border border-neutral-300 dark:border-white/10 px-2.5 py-1.5 text-xs text-neutral-600 dark:text-white/40 hover:text-neutral-900 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(true)}
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 p-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Task</span>
                    </button>
                    {canDuplicate && onDuplicateTask && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onDuplicateTask(taskToEdit);
                        }}
                        className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 p-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors cursor-pointer"
                        title="Create and assign subtask on another board"
                      >
                        <CopyPlus className="h-3.5 w-3.5" />
                        <span>Create subtask</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#141414] px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-white/50 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="task-submit-button"
                disabled={isSubmitting || !title.trim() || !userId || (status !== 'pipeline' && !dueDate.trim())}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/20 hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {taskToEdit ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
