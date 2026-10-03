import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Task, User } from '../types';
import { useDashboard } from '../context/DashboardContext';
import { Folder, ListPlus, FolderPlus, ChevronRight, Check, Plus, AlertCircle, Loader2 } from 'lucide-react';

interface UnassignedListRibbonProps {
  tasks: Task[];
  users: User[];
  onTaskClick: (task: Task) => void;
}

export const UnassignedListRibbon: React.FC<UnassignedListRibbonProps> = React.memo(({
  tasks,
  users,
  onTaskClick,
}) => {
  const {
    isZensciencesUser,
    isClickupConnected,
    setShowClickupPrompt,
    selectedClickupSpaceId,
    clickupFoldersAndLists,
    createClickupList,
    assignTaskClickupList,
  } = useDashboard();

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  // Safe folders and folderless lists
  const folders = useMemo(() => clickupFoldersAndLists?.folders || [], [clickupFoldersAndLists]);
  const folderlessLists = useMemo(() => clickupFoldersAndLists?.folderlessLists || [], [clickupFoldersAndLists]);

  // Tasks lacking ClickUp list assignment, excluding done/archived
  const unassignedTasks = useMemo(() => {
    return tasks.filter(t => !t.clickupListId && t.status !== 'done' && t.status !== 'archived');
  }, [tasks]);

  // List Assignment Flyout State
  const [activeFlyoutTaskId, setActiveFlyoutTaskId] = useState<string | null>(null);
  const [flyoutPosition, setFlyoutPosition] = useState<{ top: number; left: number } | null>(null);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [selectedFolderForNewList, setSelectedFolderForNewList] = useState<string>('');
  const [isSubmittingNewList, setIsSubmittingNewList] = useState(false);
  const [newListError, setNewListError] = useState<string | null>(null);

  const flyoutMenuRef = useRef<HTMLDivElement>(null);
  const activeTriggerRef = useRef<HTMLElement | null>(null);

  const closeFlyout = useCallback(() => {
    setActiveFlyoutTaskId(null);
    setFlyoutPosition(null);
    activeTriggerRef.current = null;
    setIsCreatingList(false);
    setNewListName('');
    setNewListError(null);
  }, []);

  const openFlyout = useCallback((taskId: string, element: HTMLElement) => {
    if (!isClickupConnected) {
      setShowClickupPrompt(true);
      return;
    }
    activeTriggerRef.current = element;
    const rect = element.getBoundingClientRect();
    const popupHeight = 320;
    const popupWidth = 280;
    const openAbove = rect.top >= popupHeight + 10;
    const top = openAbove ? rect.top - popupHeight - 4 : rect.bottom + 4;
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - popupWidth - 10));
    setFlyoutPosition({ top, left });
    setActiveFlyoutTaskId(taskId);
    setIsCreatingList(false);
    setNewListName('');
    setNewListError(null);
  }, [isClickupConnected, setShowClickupPrompt]);

  // Dismiss on outside click
  useEffect(() => {
    if (!activeFlyoutTaskId) return;
    const handleOutside = (e: MouseEvent) => {
      if (flyoutMenuRef.current && !flyoutMenuRef.current.contains(e.target as Node)) {
        closeFlyout();
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [activeFlyoutTaskId, closeFlyout]);

  const handleSelectList = async (listId: string, listName: string, folderId?: string, folderName?: string) => {
    if (!activeFlyoutTaskId) return;
    try {
      await assignTaskClickupList(activeFlyoutTaskId, listId, listName, folderId, folderName);
      closeFlyout();
    } catch (err) {
      console.warn('Failed to assign task list:', err);
    }
  };

  const handleCreateAndAssignList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFlyoutTaskId || !newListName.trim()) return;
    setIsSubmittingNewList(true);
    setNewListError(null);
    try {
      const created = await createClickupList(
        newListName.trim(),
        selectedClickupSpaceId,
        selectedFolderForNewList || undefined
      );
      if (created) {
        const folder = folders.find(f => f.id === selectedFolderForNewList);
        await assignTaskClickupList(
          activeFlyoutTaskId,
          created.id,
          created.name,
          folder?.id,
          folder?.name
        );
        closeFlyout();
      } else {
        setNewListError('Failed to create list in ClickUp');
      }
    } catch (err: any) {
      setNewListError(err.message || 'Error creating list');
    } finally {
      setIsSubmittingNewList(false);
    }
  };

  // If not zensciences user or no unassigned tasks, don't display
  if (!isZensciencesUser || unassignedTasks.length === 0) {
    return null;
  }

  const activeTask = tasks.find(t => t.id === activeFlyoutTaskId);

  return (
    <div className="relative w-full rounded-xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/20 backdrop-blur-md px-3.5 py-2 overflow-hidden shadow-sm transition-all duration-300">
      <div className="flex items-center gap-3">
        {/* Leading badge */}
        <div className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-semibold">
          <ListPlus className="w-3.5 h-3.5" />
          <span>Unassigned ClickUp Lists</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-[10px] font-bold">
            {unassignedTasks.length}
          </span>
        </div>

        {/* Scrollable list of task chips */}
        <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {unassignedTasks.map(task => {
            const assignee = userMap.get(task.userId);
            return (
              <div
                key={task.id}
                className="group flex items-center gap-2 shrink-0 px-2.5 py-1 rounded-lg bg-white/70 dark:bg-zinc-800/70 hover:bg-white dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 shadow-xs hover:shadow-sm transition-all text-xs"
              >
                <button
                  type="button"
                  onClick={() => onTaskClick(task)}
                  className="font-medium text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 max-w-[150px] truncate text-left"
                  title={task.title}
                >
                  {task.title}
                </button>

                {assignee && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700/80 text-zinc-600 dark:text-zinc-400">
                    {assignee.name.split(' ')[0]}
                  </span>
                )}

                <button
                  type="button"
                  onClick={e => openFlyout(task.id, e.currentTarget)}
                  className="px-1.5 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-semibold flex items-center gap-1 border border-purple-500/20 hover:border-purple-500/40 transition-colors"
                >
                  <span>Select List</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Popover Flyout for List Selection / Creation */}
      {activeFlyoutTaskId && flyoutPosition && createPortal(
        <div
          ref={flyoutMenuRef}
          style={{ top: `${flyoutPosition.top}px`, left: `${flyoutPosition.left}px` }}
          className="fixed z-50 w-72 max-h-96 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl p-3 text-xs text-zinc-800 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Assign ClickUp Destination</p>
              <p className="text-[10px] text-zinc-500 truncate max-w-[200px]">{activeTask?.title}</p>
            </div>
            <button
              onClick={() => setIsCreatingList(!isCreatingList)}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-purple-600 dark:text-purple-400"
              title="Create new list"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Create new list form */}
          {isCreatingList ? (
            <form onSubmit={handleCreateAndAssignList} className="space-y-2 mb-3 p-2 bg-purple-500/5 rounded-lg border border-purple-500/20">
              <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">Create New ClickUp List</p>
              <input
                type="text"
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder="List name..."
                autoFocus
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {folders.length > 0 && (
                <select
                  value={selectedFolderForNewList}
                  onChange={e => setSelectedFolderForNewList(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                >
                  <option value="">Space (Folderless)</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>Folder: {f.name}</option>
                  ))}
                </select>
              )}
              {newListError && (
                <p className="text-[10px] text-red-500">{newListError}</p>
              )}
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsCreatingList(false)}
                  className="px-2 py-1 rounded text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewList || !newListName.trim()}
                  className="px-2.5 py-1 rounded bg-purple-600 text-white font-medium text-[10px] hover:bg-purple-700 flex items-center gap-1 disabled:opacity-50"
                >
                  {isSubmittingNewList && <Loader2 className="w-3 h-3 animate-spin" />}
                  Create & Assign
                </button>
              </div>
            </form>
          ) : null}

          {/* List existing folders and lists */}
          <div className="space-y-2">
            {/* Folders and lists */}
            {folders.map(folder => (
              <div key={folder.id} className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1 py-0.5">
                  <Folder className="w-3 h-3" />
                  <span className="truncate">{folder.name}</span>
                </div>
                {folder.lists?.map(list => (
                  <button
                    key={list.id}
                    onClick={() => handleSelectList(list.id, list.name, folder.id, folder.name)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between group transition-colors"
                  >
                    <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium">{list.name}</span>
                    <Check className="w-3 h-3 text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            ))}

            {/* Folderless lists */}
            {folderlessLists.length > 0 && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1 py-0.5">
                  <FolderPlus className="w-3 h-3" />
                  <span>Folderless Lists</span>
                </div>
                {folderlessLists.map(list => (
                  <button
                    key={list.id}
                    onClick={() => handleSelectList(list.id, list.name)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between group transition-colors"
                  >
                    <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium">{list.name}</span>
                    <Check className="w-3 h-3 text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}

            {folders.length === 0 && folderlessLists.length === 0 && (
              <div className="text-center py-4 text-zinc-400 dark:text-zinc-500">
                <AlertCircle className="w-5 h-5 mx-auto mb-1 opacity-50" />
                <p>No lists found in this space.</p>
                <button
                  onClick={() => setIsCreatingList(true)}
                  className="mt-2 text-purple-600 dark:text-purple-400 hover:underline font-medium text-[11px]"
                >
                  + Create your first list
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

UnassignedListRibbon.displayName = 'UnassignedListRibbon';
