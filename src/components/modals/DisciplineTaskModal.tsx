import { DialogPanel } from '../ui/DialogPanel';
import { ContentSpecFields, DesignSpecFields } from '../forms/DisciplineSpecFields';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { useAuth, useBoardUi, useClickUp, useWorkspace } from '../../context/DashboardContext';
import { RoleFilter, TaskDisciplineMetadata } from '../../types';
import { getLastDayOfMonth } from '../../utils/workload';
import { isValidHttpUrl } from '../../utils/taskMetadata';
import {
  X,
  FileText,
  Palette,
  Plus,
  AlertCircle,
  Sparkles,
  Check,
  FolderKanban,
  Loader2,
} from 'lucide-react';

interface DisciplineTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDiscipline?: RoleFilter;
}

export const DisciplineTaskModal: React.FC<DisciplineTaskModalProps> = ({
  isOpen,
  onClose,
  initialDiscipline = 'all',
}) => {
  const { canCreatePipelineTask } = useAuth();
  const { activeRoleTab } = useBoardUi();
  const { tasks, createPipelineBundle } = useWorkspace();
  const {
    isClickupConnected,
    clickupSpaces,
    spaceFoldersAndListsMap,
    getFoldersAndListsForSpace,
    createClickupSpace,
    createClickupList,
    clickupCustomFieldOptions,
    clickupTaskTypeFieldId,
    isLoadingTaskTypes,
    fetchClickupCustomFields,
  } = useClickUp();

  const [needsContent, setNeedsContent] = useState(true);
  const [needsDesign, setNeedsDesign] = useState(false);

  // ClickUp Space / Folder / List state
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedTaskTypeId, setSelectedTaskTypeId] = useState('');

  // Inline ClickUp Space & List creators
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [isSubmittingSpace, setIsSubmittingSpace] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isSubmittingList, setIsSubmittingList] = useState(false);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [clickupActionError, setClickupActionError] = useState<string | null>(null);

  // Shared Fields (linked to parent task)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [brandGuidelines, setBrandGuidelines] = useState('');
  const [client, setClient] = useState('');
  const [project, setProject] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');

  // Content Discipline Fields
  const [contentType, setContentType] = useState('Blog Post');
  const [contentSpecifications, setContentSpecifications] = useState('');
  const [sourceContentReferences, setSourceContentReferences] = useState<string[]>([]);

  // Design Discipline Fields
  const [assetType, setAssetType] = useState('Social Media Banner');
  const [designSpecifications, setDesignSpecifications] = useState('');
  const [brandAssetsReferences, setBrandAssetsReferences] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Selected ClickUp hierarchy objects
  const selectedSpace = useMemo(
    () => clickupSpaces.find(s => s.id === selectedSpaceId) || null,
    [clickupSpaces, selectedSpaceId]
  );

  const spaceHierarchy = selectedSpaceId ? spaceFoldersAndListsMap[selectedSpaceId] : undefined;
  const availableFolders = spaceHierarchy?.folders || [];
  const selectedFolder = useMemo(
    () => availableFolders.find(f => f.id === selectedFolderId) || null,
    [availableFolders, selectedFolderId]
  );

  const availableLists = useMemo(() => {
    if (!spaceHierarchy) return [];
    if (selectedFolder) {
      return selectedFolder.lists || [];
    }
    return spaceHierarchy.folderlessLists || [];
  }, [spaceHierarchy, selectedFolder]);

  const selectedList = useMemo(
    () => availableLists.find(l => l.id === selectedListId) || null,
    [availableLists, selectedListId]
  );

  const selectedTaskTypeOption = useMemo(
    () => clickupCustomFieldOptions.find(o => o.id === selectedTaskTypeId) || null,
    [clickupCustomFieldOptions, selectedTaskTypeId]
  );

  // Autocomplete suggestions from existing tasks
  const existingClients = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t && t.client && t.client.trim()) set.add(t.client.trim());
    }
    return Array.from(set).sort();
  }, [tasks]);

  const existingProjects = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t && t.project && t.project.trim()) set.add(t.project.trim());
    }
    return Array.from(set).sort();
  }, [tasks]);

  const resetForm = () => {
    const defaultRole = initialDiscipline !== 'all' ? initialDiscipline : activeRoleTab;
    if (defaultRole === 'design') {
      setNeedsContent(false);
      setNeedsDesign(true);
    } else {
      setNeedsContent(true);
      setNeedsDesign(defaultRole === 'all');
    }

    setSelectedSpaceId('');
    setSelectedFolderId('');
    setSelectedListId('');
    setSelectedTaskTypeId('');
    setIsCreatingSpace(false);
    setNewSpaceName('');
    setIsCreatingList(false);
    setNewListName('');
    setClickupActionError(null);

    setTitle('');
    setDescription('');
    setBrandGuidelines('');
    setClient('');
    setProject('');
    setPriority('medium');
    setDueDate('');

    setContentType('Blog Post');
    setContentSpecifications('');
    setSourceContentReferences([]);

    setAssetType('Social Media Banner');
    setDesignSpecifications('');
    setBrandAssetsReferences([]);

    setSubmitError(null);
  };

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  // Fetch folders & lists whenever a ClickUp Space is selected
  useEffect(() => {
    if (!isOpen || !isClickupConnected || !selectedSpaceId) return;
    let cancelled = false;
    setIsLoadingLists(true);
    getFoldersAndListsForSpace(selectedSpaceId)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingLists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isClickupConnected, selectedSpaceId, getFoldersAndListsForSpace]);

  // Fetch ClickUp custom fields when list/space/folder changes
  useEffect(() => {
    if (!isOpen || !isClickupConnected || !selectedListId) return;
    fetchClickupCustomFields({
      listId: selectedListId,
      spaceId: selectedSpaceId || undefined,
      folderId: selectedFolderId || undefined,
    }).catch(() => {});
  }, [isOpen, isClickupConnected, selectedListId, selectedSpaceId, selectedFolderId, fetchClickupCustomFields]);

  const handleSpaceChange = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setSelectedFolderId('');
    setSelectedListId('');
    setClickupActionError(null);
    const sp = clickupSpaces.find(s => s.id === spaceId);
    if (sp) {
      setClient(sp.name);
      setProject('');
    }
  };

  const handleFolderChange = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedListId('');
    setClickupActionError(null);
    const folder = availableFolders.find(f => f.id === folderId);
    if (folder) {
      setClient(folder.name);
    } else if (selectedSpace) {
      setClient(selectedSpace.name);
    }
    setProject('');
  };

  const handleListChange = (listId: string) => {
    setSelectedListId(listId);
    setClickupActionError(null);
    const list = availableLists.find(l => l.id === listId);
    if (list) {
      setProject(list.name);
      if (!client.trim()) {
        setClient(selectedFolder?.name || selectedSpace?.name || '');
      }
    }
  };

  const handleCreateSpace = async () => {
    const trimmed = newSpaceName.trim();
    if (!trimmed || isSubmittingSpace) return;
    setIsSubmittingSpace(true);
    setClickupActionError(null);
    try {
      const created = await createClickupSpace(trimmed);
      if (created) {
        setSelectedSpaceId(created.id);
        setSelectedFolderId('');
        setSelectedListId('');
        setClient(created.name);
        setProject('');
        setNewSpaceName('');
        setIsCreatingSpace(false);
      }
    } catch (err: any) {
      setClickupActionError(err?.message || 'Failed to create ClickUp space');
    } finally {
      setIsSubmittingSpace(false);
    }
  };

  const handleCreateList = async () => {
    const trimmed = newListName.trim();
    if (!trimmed || !selectedSpaceId || isSubmittingList) return;
    setIsSubmittingList(true);
    setClickupActionError(null);
    try {
      const created = await createClickupList(
        trimmed,
        selectedSpaceId,
        selectedFolderId || undefined
      );
      if (created) {
        await getFoldersAndListsForSpace(selectedSpaceId);
        setSelectedListId(created.id);
        setProject(created.name);
        if (!client.trim()) {
          setClient(selectedFolder?.name || selectedSpace?.name || '');
        }
        setNewListName('');
        setIsCreatingList(false);
      }
    } catch (err: any) {
      setClickupActionError(err?.message || 'Failed to create ClickUp list');
    } finally {
      setIsSubmittingList(false);
    }
  };

  const setQuickDate = (daysFromNow: number | null, isEndOfMonth = false) => {
    if (daysFromNow === null && !isEndOfMonth) {
      setDueDate('');
      return;
    }
    if (isEndOfMonth) {
      setDueDate(getLastDayOfMonth());
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + (daysFromNow || 0));
    setDueDate(d.toISOString().split('T')[0]);
  };

  const selectedDisciplines = useMemo(() => {
    const list: Array<'content' | 'design'> = [];
    if (needsContent) list.push('content');
    if (needsDesign) list.push('design');
    return list;
  }, [needsContent, needsDesign]);

  const creationId = useRef<string | undefined>(undefined);
  useEffect(() => { if (!isOpen) creationId.current = undefined; }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    if (!canCreatePipelineTask) {
      setSubmitError('Only Accounts team members and authorized special roles can create tasks in team pipelines.');
      return;
    }

    if (selectedDisciplines.length === 0) {
      setSubmitError('Select at least one requirement: Content, Design, or both.');
      return;
    }

    const trimmedBrandGuidelines = brandGuidelines.trim();
    if (trimmedBrandGuidelines && !isValidHttpUrl(trimmedBrandGuidelines)) {
      setSubmitError('Brand Guidelines must be a valid URL starting with http:// or https://.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const contentMeta: TaskDisciplineMetadata | undefined = needsContent
      ? {
          contentType: contentType.trim() || undefined,
          contentSpecifications: contentSpecifications.trim() || undefined,
          sourceContentReferences: sourceContentReferences.length > 0 ? sourceContentReferences : undefined,
        }
      : undefined;

    const designMeta: TaskDisciplineMetadata | undefined = needsDesign
      ? {
          assetType: assetType.trim() || undefined,
          designSpecifications: designSpecifications.trim() || undefined,
          brandAssetsReferences: brandAssetsReferences.length > 0 ? brandAssetsReferences : undefined,
        }
      : undefined;

    try {
      creationId.current ??= crypto.randomUUID();
      await createPipelineBundle({
        requestId: creationId.current,
        title: title.trim(),
        description: description.trim() || undefined,
        brandGuidelines: trimmedBrandGuidelines || undefined,
        dueDate: dueDate.trim() || undefined,
        client: client.trim() || undefined,
        project: project.trim() || undefined,
        priority,
        disciplines: selectedDisciplines,
        disciplineSpecs: {
          content: contentMeta,
          design: designMeta,
        },
        clickupSpaceId: selectedSpaceId || undefined,
        clickupSpaceName: selectedSpace?.name || undefined,
        clickupFolderId: selectedFolderId || undefined,
        clickupFolderName: selectedFolder?.name || undefined,
        clickupListId: selectedListId || undefined,
        clickupListName: selectedList?.name || undefined,
        clickupTaskType: selectedTaskTypeOption?.name || undefined,
        clickupTaskTypeId: selectedTaskTypeOption?.id || undefined,
        clickupTaskTypeFieldId: selectedTaskTypeOption ? (clickupTaskTypeFieldId || undefined) : undefined,
      });

      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message || 'Failed to create pipeline task(s)');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60">
        <DialogPanel
          aria-label="Create pipeline requirement"
          onClose={onClose}
          busy={isSubmitting}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 bg-neutral-50/50 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Add Pipeline Deliverable
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Creates a parent ClickUp deliverable and subtask(s) for selected disciplines.
                </p>
              </div>
            </div>
            <button
              aria-label="Close dialog"
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Requirement Type Checkboxes */}
          <div className="px-6 py-3 border-b border-[var(--border)] bg-neutral-50/30 dark:bg-white/[0.01]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Requirement Type
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNeedsContent(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    needsContent
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'border-[var(--border)] bg-[var(--surface-muted)] text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                      needsContent
                        ? 'border-white bg-white text-blue-600'
                        : 'border-neutral-400 dark:border-white/30'
                    }`}
                  >
                    {needsContent && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </span>
                  <FileText className="h-3.5 w-3.5" />
                  <span>Content</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNeedsDesign(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    needsDesign
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'border-[var(--border)] bg-[var(--surface-muted)] text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                      needsDesign
                        ? 'border-white bg-white text-indigo-600'
                        : 'border-neutral-400 dark:border-white/30'
                    }`}
                  >
                    {needsDesign && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </span>
                  <Palette className="h-3.5 w-3.5" />
                  <span>Design</span>
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {submitError && (
              <div className="rounded-xl border border-red-500/20 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* ClickUp Destination Section */}
            <div className="rounded-xl border border-purple-500/20 bg-purple-50/30 dark:bg-purple-950/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                    ClickUp Destination
                  </span>
                </div>
                {!isClickupConnected && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Connect ClickUp in Settings to sync spaces & lists
                  </span>
                )}
              </div>

              {clickupActionError && (
                <div className="rounded-lg border border-red-500/20 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
                  {clickupActionError}
                </div>
              )}

              {isClickupConnected && (
                <div className="space-y-3">
                  {/* Space Selector + Inline Creator */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-neutral-700 dark:text-white/80">
                        ClickUp Space
                      </label>
                      {!isCreatingSpace && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingSpace(true);
                            setClickupActionError(null);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          <span>New Space</span>
                        </button>
                      )}
                    </div>

                    {isCreatingSpace ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newSpaceName}
                          onChange={e => setNewSpaceName(e.target.value)}
                          placeholder="New ClickUp Space name (e.g. Acme Corp)"
                          disabled={isSubmittingSpace}
                          className="flex-1 rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-purple-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCreateSpace}
                          disabled={!newSpaceName.trim() || isSubmittingSpace}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500 disabled:opacity-50"
                        >
                          {isSubmittingSpace ? 'Creating...' : 'Create'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingSpace(false);
                            setNewSpaceName('');
                          }}
                          className="px-2.5 py-1.5 rounded-xl border border-[var(--border)] text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <select
                        value={selectedSpaceId}
                        onChange={e => handleSpaceChange(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">-- Select ClickUp Space (Optional) --</option>
                        {clickupSpaces.map(sp => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Folder & List Selectors */}
                  {selectedSpaceId && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1">
                          Folder (Optional)
                        </label>
                        <select
                          value={selectedFolderId}
                          onChange={e => handleFolderChange(e.target.value)}
                          disabled={isLoadingLists}
                          className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
                        >
                          <option value="">Folderless Lists (Direct)</option>
                          {availableFolders.map(folder => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-neutral-700 dark:text-white/80 flex items-center gap-1.5">
                            <span>ClickUp List</span>
                            {isLoadingLists && <Loader2 className="h-3 w-3 animate-spin text-purple-500" />}
                          </label>
                          {!isCreatingList && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsCreatingList(true);
                                setClickupActionError(null);
                              }}
                              className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              <span>New List</span>
                            </button>
                          )}
                        </div>

                        {isCreatingList ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={newListName}
                              onChange={e => setNewListName(e.target.value)}
                              placeholder="New List name"
                              disabled={isSubmittingList}
                              className="flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-purple-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleCreateList}
                              disabled={!newListName.trim() || isSubmittingList}
                              className="px-2.5 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500 disabled:opacity-50 shrink-0"
                            >
                              {isSubmittingList ? '...' : 'Add'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsCreatingList(false);
                                setNewListName('');
                              }}
                              className="px-2 py-1.5 rounded-xl border border-[var(--border)] text-xs text-neutral-500 shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <select
                            value={selectedListId}
                            onChange={e => handleListChange(e.target.value)}
                            disabled={isLoadingLists}
                            className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
                          >
                            <option value="">-- Select List --</option>
                            {availableLists.map(list => (
                              <option key={list.id} value={list.id}>
                                {list.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ClickUp Custom Task Type Field */}
                  {selectedListId && (clickupCustomFieldOptions.length > 0 || isLoadingTaskTypes) && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1">
                        <span>ClickUp Type Custom Field</span>
                        {isLoadingTaskTypes && <Loader2 className="h-3 w-3 animate-spin text-purple-500" />}
                      </label>
                      <select
                        value={selectedTaskTypeId}
                        onChange={e => setSelectedTaskTypeId(e.target.value)}
                        disabled={isLoadingTaskTypes}
                        className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">-- None --</option>
                        {clickupCustomFieldOptions.map(opt => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Shared Section: Task Basics */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-1">
                  Parent Deliverable Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Q4 Product Launch Campaign Pack"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                  id="disciplinetaskmodal-field-1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-white/80" htmlFor="disciplinetaskmodal-field-2">
                    Brief
                  </label>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Shared &amp; linked to parent task
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Detailed campaign brief, objectives, audience, messaging, and context..."
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-y"
                  id="disciplinetaskmodal-field-2"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-white/80" htmlFor="disciplinetaskmodal-brand-guidelines">
                    Brand Guidelines Link
                  </label>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Shared &amp; linked to parent task
                  </span>
                </div>
                <input
                  type="url"
                  value={brandGuidelines}
                  onChange={e => setBrandGuidelines(e.target.value)}
                  placeholder="https://... (Brand book, Notion, Google Drive, Figma)"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                  id="disciplinetaskmodal-brand-guidelines"
                />
              </div>

              {/* Account / Client & Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-3">
                    Account / Client
                  </label>
                  <input
                    type="text"
                    list="discipline-client-options"
                    value={client}
                    onChange={e => setClient(e.target.value)}
                    placeholder="Auto-filled from Space/Folder or custom"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                    id="disciplinetaskmodal-field-3"
                  />
                  <datalist id="discipline-client-options">
                    {existingClients.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-4">
                    Project / Campaign
                  </label>
                  <input
                    type="text"
                    list="discipline-project-options"
                    value={project}
                    onChange={e => setProject(e.target.value)}
                    placeholder="Auto-filled from List or custom"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
                    id="disciplinetaskmodal-field-4"
                  />
                  <datalist id="discipline-project-options">
                    {existingProjects.map(p => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Priority & Deadline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1">
                    Priority
                  </label>
                  <div className="flex items-center gap-1.5">
                    {(['low', 'medium', 'high'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`flex-1 rounded-xl py-1.5 text-xs font-semibold capitalize border transition-all cursor-pointer ${
                          priority === p
                            ? p === 'high'
                              ? 'bg-red-500/15 border-red-500 text-red-600 dark:text-red-400'
                              : p === 'medium'
                              ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                            : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-white/80" htmlFor="disciplinetaskmodal-field-5">
                      Target Deadline (Optional)
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQuickDate(1)}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Tomorrow
                      </button>
                      <span className="text-[11px] text-neutral-300 dark:text-white/20">·</span>
                      <button
                        type="button"
                        onClick={() => setQuickDate(7)}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        1W
                      </button>
                      <span className="text-[11px] text-neutral-300 dark:text-white/20">·</span>
                      <button
                        type="button"
                        onClick={() => setQuickDate(null, true)}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        End Month
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-5"
                    />
                    {dueDate && (
                      <button
                        type="button"
                        onClick={() => setDueDate('')}
                        title="Clear deadline"
                        className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white text-[11px]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Content Discipline Fields */}
            {needsContent && (
              <ContentSpecFields
                idPrefix="disciplinetaskmodal"
                contentType={contentType}
                onChangeContentType={setContentType}
                contentSpecifications={contentSpecifications}
                onChangeContentSpecifications={setContentSpecifications}
                sourceContentReferences={sourceContentReferences}
                onChangeSourceContentReferences={setSourceContentReferences}
              />
            )}

            {/* Design Discipline Fields */}
            {needsDesign && (
              <DesignSpecFields
                idPrefix="disciplinetaskmodal"
                assetType={assetType}
                onChangeAssetType={setAssetType}
                designSpecifications={designSpecifications}
                onChangeDesignSpecifications={setDesignSpecifications}
                brandAssetsReferences={brandAssetsReferences}
                onChangeBrandAssetsReferences={setBrandAssetsReferences}
              />
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-[11px] text-[var(--text-secondary)]">
                {selectedDisciplines.length === 2
                  ? 'Creates parent task + Content & Design subtasks in Pipeline.'
                  : selectedDisciplines.length === 1
                  ? `Creates parent task + ${selectedDisciplines[0]} subtask in Pipeline.`
                  : 'Select at least one requirement type.'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold text-neutral-700 dark:text-white/80 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim() || selectedDisciplines.length === 0 || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-40"
                >
                  {isSubmitting
                    ? 'Creating...'
                    : selectedDisciplines.length === 2
                    ? 'Create Both Subtasks'
                    : 'Create Pipeline Task'}
                </button>
              </div>
            </div>
          </form>
        </DialogPanel>
      </div>
    </AnimatePresence>
  );
};
