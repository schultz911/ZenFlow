import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Task, User, CognitiveLoad } from '../types';
import { getCognitiveLoadLabel } from '../utils/workload';
import { useDashboard } from '../context/DashboardContext';
import {
  Plus,
  Repeat,
  Edit2,
  Trash2,
  X,
  CopyPlus,
} from 'lucide-react';

interface RetainerSwimlaneProps {
  user: User;
  tasks: Task[];
  onQuickAdd: (
    userId: string,
    title: string,
    cognitiveLoad: CognitiveLoad,
    clickupDetails?: {
      clickupFolderId?: string;
      clickupFolderName?: string;
      clickupListId?: string;
      clickupListName?: string;
      clickupSpaceId?: string;
    }
  ) => Promise<void>;
  onEditTask: (task: Task) => void;
  onUpdateTitle?: (taskId: string, newTitle: string) => void;
  onDeleteTask: (taskId: string) => void;
  onCreateSubtask: (task: Task) => void;
}

const RetainerSwimlaneComponent: React.FC<RetainerSwimlaneProps> = ({
  user,
  tasks,
  onQuickAdd,
  onEditTask,
  onUpdateTitle,
  onDeleteTask,
  onCreateSubtask,
}) => {
  const {
    isClickupConnected,
    isZensciencesUser,
    selectedClickupSpaceId,
    clickupFoldersAndLists,
  } = useDashboard();

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLoad, setNewLoad] = useState<CognitiveLoad>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ClickUp destination selection state for quick-added retainer tasks
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');

  const folders = useMemo(() => {
    return Array.isArray(clickupFoldersAndLists?.folders) ? clickupFoldersAndLists.folders : [];
  }, [clickupFoldersAndLists]);

  const folderlessLists = useMemo(() => {
    return Array.isArray(clickupFoldersAndLists?.folderlessLists) ? clickupFoldersAndLists.folderlessLists : [];
  }, [clickupFoldersAndLists]);

  const availableLists = useMemo(() => {
    if (selectedFolderId) {
      const folder = folders.find(f => f && f.id === selectedFolderId);
      return Array.isArray(folder?.lists) ? folder.lists : [];
    }
    return folderlessLists;
  }, [selectedFolderId, folders, folderlessLists]);

  // Synchronize default selected list when lists load or change
  useEffect(() => {
    if (!isClickupConnected || !isZensciencesUser) return;
    if (selectedListId && availableLists.some(l => l.id === selectedListId)) return;

    if (availableLists.length > 0) {
      setSelectedListId(availableLists[0].id);
    } else if (folderlessLists.length > 0) {
      setSelectedFolderId('');
      setSelectedListId(folderlessLists[0].id);
    } else if (folders.length > 0 && Array.isArray(folders[0].lists) && folders[0].lists.length > 0) {
      setSelectedFolderId(folders[0].id);
      setSelectedListId(folders[0].lists[0].id);
    }
  }, [isClickupConnected, isZensciencesUser, availableLists, folderlessLists, folders, selectedListId]);

  // Inline title editing state for a retainer task
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const quickAddCardRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Click outside to dismiss quick add in retainer
  useEffect(() => {
    if (!isAdding) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        (quickAddCardRef.current && quickAddCardRef.current.contains(target)) ||
        (toggleBtnRef.current && toggleBtnRef.current.contains(target))
      ) {
        return;
      }
      setIsAdding(false);
      setNewTitle('');
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isAdding]);

  const handleCommitAdd = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let clickupDetails: {
        clickupFolderId?: string;
        clickupFolderName?: string;
        clickupListId?: string;
        clickupListName?: string;
        clickupSpaceId?: string;
      } | undefined;

      if (isClickupConnected && isZensciencesUser && selectedListId) {
        const folder = folders.find(f => f && f.id === selectedFolderId);
        const list = availableLists.find(l => l && l.id === selectedListId);
        clickupDetails = {
          clickupFolderId: selectedFolderId || undefined,
          clickupFolderName: folder?.name,
          clickupListId: selectedListId,
          clickupListName: list?.name,
          clickupSpaceId: selectedClickupSpaceId || undefined,
        };
      }

      await onQuickAdd(user.id, trimmed, newLoad, clickupDetails);
      setNewTitle('');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative rounded-xl border border-neutral-200/80 dark:border-white/5 bg-neutral-100/60 dark:bg-[#111111] p-2.5 sm:p-3 transition-all h-full flex flex-col"
    >
      {/* Ongoing Header */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Repeat className="h-3 w-3" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 dark:text-white/70 shrink-0">
            Ongoing
          </span>
          <span className="rounded-full bg-neutral-200/80 dark:bg-white/10 px-2 py-0.2 text-[10px] font-semibold text-neutral-600 dark:text-white/50 shrink-0">
            {tasks.length}
          </span>
          <span className="hidden sm:inline-block text-[10px] text-neutral-400 dark:text-white/30 truncate">
            No deadline · Zero workload · In Progress on ClickUp
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            ref={toggleBtnRef}
            type="button"
            onClick={() => {
              setIsAdding(prev => !prev);
              setNewTitle('');
              setNewLoad('medium');
            }}
            title={isAdding ? 'Cancel adding task' : 'Add ongoing task'}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              isAdding
                ? 'bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-white'
                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            }`}
          >
            {isAdding ? (
              <>
                <X className="h-3 w-3 shrink-0" />
                <span>Cancel</span>
              </>
            ) : (
              <>
                <Plus className="h-3 w-3 shrink-0" />
                <span>Add to Ongoing</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Inline Quick Add into Retainer */}
      {isAdding && (
        <motion.div
          ref={quickAddCardRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="mb-2.5 rounded-xl border border-emerald-500/50 bg-white dark:bg-[#1A1A1A] p-2.5 shadow-sm space-y-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCommitAdd();
              } else if (e.key === 'Escape') {
                setIsAdding(false);
              }
            }}
            placeholder="Ongoing task name... (Enter to save, Esc to cancel)"
            className="w-full rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#121212] px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-emerald-500 focus:outline-none"
          />

          {/* ClickUp Destination Selection for Retainer parent task */}
          {isClickupConnected && isZensciencesUser && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/30 text-[10px]">
              <span className="font-semibold text-purple-700 dark:text-purple-300 shrink-0">
                ClickUp:
              </span>
              {folders.length > 0 && (
                <select
                  value={selectedFolderId}
                  onChange={e => {
                    setSelectedFolderId(e.target.value);
                    setSelectedListId('');
                  }}
                  className="rounded border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-[#141414] px-1.5 py-0.5 text-[10px] text-neutral-800 dark:text-neutral-200 max-w-[130px] truncate"
                  title="ClickUp Folder"
                >
                  <option value="">Space (Folderless)</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={selectedListId}
                onChange={e => setSelectedListId(e.target.value)}
                className="rounded border border-purple-200 dark:border-purple-800/40 bg-white dark:bg-[#141414] px-1.5 py-0.5 text-[10px] text-neutral-800 dark:text-neutral-200 max-w-[150px] truncate"
                title="ClickUp List destination for parent task"
              >
                <option value="">Select ClickUp List...</option>
                {availableLists.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(['low', 'medium', 'high'] as const).map(load => (
                <button
                  key={load}
                  type="button"
                  onClick={() => setNewLoad(load)}
                  className={`rounded px-2 py-0.5 text-[9px] font-medium border capitalize transition-all cursor-pointer ${
                    newLoad === load
                      ? load === 'high'
                        ? 'bg-red-500/15 border-red-500/40 text-red-500 font-semibold'
                        : load === 'medium'
                        ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-600 dark:text-yellow-400 font-semibold'
                        : 'bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400 font-semibold'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
                  }`}
                >
                  {load} load
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!newTitle.trim() || isSubmitting}
                onClick={handleCommitAdd}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-[10px] font-semibold text-white shadow-xs transition-colors cursor-pointer disabled:opacity-40"
              >
                Add Ongoing
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Horizontally Scrollable Retainer Cards Container */}
      <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-0.5 scroll-smooth min-h-[58px]">
        {tasks.length === 0 && !isAdding ? (
          <div
            onClick={() => setIsAdding(true)}
            className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300/80 dark:border-white/10 text-neutral-400 dark:text-white/30 hover:border-emerald-400 dark:hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors px-4 py-2"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">
              No ongoing tasks · Click to add ongoing client work
            </span>
          </div>
        ) : (
          tasks.map(task => {
            const isEditingThis = editingTaskId === task.id;
            const cognitiveLabel = getCognitiveLoadLabel(task.cognitiveLoad, user.role);

            return (
              <motion.div
                key={task.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="group relative flex items-start gap-2 shrink-0 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A] px-2.5 py-1.5 shadow-2xs hover:shadow-md hover:border-emerald-400/50 dark:hover:border-emerald-500/30 transition-all select-none w-48 sm:w-52 max-w-[220px]"
              >
                {/* Fixed Retainer Indicator */}
                <div
                  title="Ongoing task"
                  className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                >
                  <Repeat className="h-3 w-3" />
                </div>

                {/* Task Title & Metadata */}
                <div className="min-w-0 flex-1">
                  {isEditingThis ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        autoFocus
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = editingTitle.trim();
                            if (trimmed && onUpdateTitle) {
                              onUpdateTitle(task.id, trimmed);
                            }
                            setEditingTaskId(null);
                          } else if (e.key === 'Escape') {
                            setEditingTaskId(null);
                          }
                        }}
                        onBlur={() => {
                          const trimmed = editingTitle.trim();
                          if (trimmed && onUpdateTitle) {
                            onUpdateTitle(task.id, trimmed);
                          }
                          setEditingTaskId(null);
                        }}
                        className="w-full rounded border border-emerald-500 bg-white dark:bg-[#121212] px-1 py-0.5 text-xs text-neutral-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  ) : (
                    <h5
                      onClick={e => {
                        e.stopPropagation();
                        setEditingTaskId(task.id);
                        setEditingTitle(task.title);
                      }}
                      title={task.title}
                      className="text-xs font-medium text-neutral-900 dark:text-white break-words whitespace-normal hover:text-emerald-600 dark:hover:text-emerald-400 cursor-text leading-tight"
                    >
                      {task.title}
                    </h5>
                  )}

                  <div className="flex items-center gap-1.5 mt-0.5">
                    {/* Cognitive Load Indicator */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          task.cognitiveLoad === 'high'
                            ? 'bg-red-500'
                            : task.cognitiveLoad === 'medium'
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                      />
                      <span
                        title={`Cognitive Load: ${cognitiveLabel}`}
                        className="text-[9px] text-neutral-500 dark:text-white/40 capitalize"
                      >
                        {task.cognitiveLoad}
                      </span>
                    </div>

                    {/* ClickUp List Badge */}
                    {task.clickupListName && (
                      <span
                        title={`ClickUp List: ${task.clickupListName}`}
                        className="inline-flex items-center gap-1 text-[8.5px] px-1 py-0.2 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40 font-medium truncate max-w-[85px]"
                      >
                        <span className="h-1 w-1 rounded-full bg-purple-500 shrink-0" />
                        <span className="truncate">{task.clickupListName}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick actions on hover */}
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onCreateSubtask(task);
                    }}
                    title="Create subtask from this ongoing task"
                    className="rounded p-1 text-neutral-400 hover:text-emerald-600 dark:text-white/40 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors cursor-pointer"
                  >
                    <CopyPlus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onEditTask(task);
                    }}
                    title="Open ongoing task details"
                    className="rounded p-1 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteTask(task.id);
                    }}
                    title="Delete ongoing task"
                    className="rounded p-1 text-neutral-400 hover:text-red-500 dark:text-white/40 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

function areRetainerPropsEqual(prev: RetainerSwimlaneProps, next: RetainerSwimlaneProps): boolean {
  if (prev.user !== next.user) return false;
  if (prev.onQuickAdd !== next.onQuickAdd) return false;
  if (prev.onEditTask !== next.onEditTask) return false;
  if (prev.onUpdateTitle !== next.onUpdateTitle) return false;
  if (prev.onDeleteTask !== next.onDeleteTask) return false;
  if (prev.onCreateSubtask !== next.onCreateSubtask) return false;

  const prevTasks = prev.tasks;
  const nextTasks = next.tasks;
  if (prevTasks === nextTasks) return true;
  if (prevTasks.length !== nextTasks.length) return false;
  for (let i = 0; i < prevTasks.length; i++) {
    if (prevTasks[i] !== nextTasks[i]) return false;
  }
  return true;
}

export const RetainerSwimlane = React.memo(RetainerSwimlaneComponent, areRetainerPropsEqual);
RetainerSwimlane.displayName = 'RetainerSwimlane';
