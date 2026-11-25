import { DialogPanel } from '../ui/DialogPanel';
import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { useDashboard } from '../../context/DashboardContext';
import { RoleFilter, TaskDisciplineMetadata } from '../../types';
import { getLastDayOfMonth } from '../../utils/workload';
import {
  X,
  FileText,
  Palette,
  Plus,
  AlertCircle,
  Link as LinkIcon,
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
  const {
    tasks,
    activeRoleTab,
    createPipelineBundle,
    canCreatePipelineTask,
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
  } = useDashboard();

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

  // Shared Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [client, setClient] = useState('');
  const [project, setProject] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [isAddingAttachment, setIsAddingAttachment] = useState(false);

  // Content Discipline Fields
  const [contentType, setContentType] = useState('Blog Post');
  const [deliverable, setDeliverable] = useState('Google Doc Draft');
  const [brief, setBrief] = useState('');
  const [wordCount, setWordCount] = useState('');
  const [relevantRequirements, setRelevantRequirements] = useState('');

  // Design Discipline Fields
  const [assetType, setAssetType] = useState('Social Media Banner');
  const [dimensions, setDimensions] = useState('1080x1080');
  const [format, setFormat] = useState('Figma');
  const [quantity, setQuantity] = useState('1');
  const [designSpecifications, setDesignSpecifications] = useState('');

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
    setClient('');
    setProject('');
    setPriority('medium');
    setDueDate('');
    setAttachments([]);
    setNewAttachmentUrl('');
    setIsAddingAttachment(false);

    setContentType('Blog Post');
    setDeliverable('Google Doc Draft');
    setBrief('');
    setWordCount('');
    setRelevantRequirements('');

    setAssetType('Social Media Banner');
    setDimensions('1080x1080');
    setFormat('Figma');
    setQuantity('1');
    setDesignSpecifications('');

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

  const handleAddAttachment = () => {
    const trimmed = newAttachmentUrl.trim();
    if (!trimmed) return;
    setAttachments(prev => [...prev, trimmed]);
    setNewAttachmentUrl('');
    setIsAddingAttachment(false);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
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

    setIsSubmitting(true);
    setSubmitError(null);

    const contentMeta: TaskDisciplineMetadata | undefined = needsContent
      ? {
          contentType: contentType.trim() || undefined,
          deliverable: deliverable.trim() || undefined,
          brief: brief.trim() || undefined,
          wordCount: wordCount ? parseInt(wordCount, 10) : undefined,
          relevantRequirements: relevantRequirements.trim() || undefined,
        }
      : undefined;

    const designMeta: TaskDisciplineMetadata | undefined = needsDesign
      ? {
          assetType: assetType.trim() || undefined,
          dimensions: dimensions.trim() || undefined,
          format: format.trim() || undefined,
          quantity: quantity ? parseInt(quantity, 10) : undefined,
          designSpecifications: designSpecifications.trim() || undefined,
        }
      : undefined;

    try {
      await createPipelineBundle({
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate.trim() || undefined,
        client: client.trim() || undefined,
        project: project.trim() || undefined,
        priority,
        attachments: attachments.length > 0 ? attachments : undefined,
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
                <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-2">
                  Description / Brief Overview
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Summarize the core requirements, goals, and context for this task..."
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-none"
                  id="disciplinetaskmodal-field-2"
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

              {/* Attachments & Reference Links */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-white/80" htmlFor="disciplinetaskmodal-field-6">
                    Attachments & Reference Links
                  </label>
                  {!isAddingAttachment && (
                    <button
                      type="button"
                      onClick={() => setIsAddingAttachment(true)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Link</span>
                    </button>
                  )}
                </div>

                {isAddingAttachment && (
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="url"
                      value={newAttachmentUrl}
                      onChange={e => setNewAttachmentUrl(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAttachment();
                        }
                      }}
                      placeholder="Paste link (Google Drive, Figma, Notion, Miro...)"
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-6"
                    />
                    <button
                      type="button"
                      onClick={handleAddAttachment}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingAttachment(false);
                        setNewAttachmentUrl('');
                      }}
                      className="px-2 py-1.5 rounded-xl border border-[var(--border)] text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 border border-[var(--border)] text-xs text-neutral-700 dark:text-white/80 max-w-full"
                      >
                        <LinkIcon className="h-3 w-3 text-blue-500 shrink-0" />
                        <span className="truncate max-w-[260px]">{att}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400 ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Content Discipline Fields */}
            {needsContent && (
              <div className="space-y-3.5 rounded-xl border border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Content Subtask Specifications</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-7">
                      Content Type
                    </label>
                    <input
                      type="text"
                      list="content-type-options"
                      value={contentType}
                      onChange={e => setContentType(e.target.value)}
                      placeholder="e.g. Blog Post, Case Study, Whitepaper"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-7"
                    />
                    <datalist id="content-type-options">
                      <option value="Blog Post" />
                      <option value="Website Copy" />
                      <option value="Case Study" />
                      <option value="Whitepaper" />
                      <option value="Social Media Pack" />
                      <option value="Email Newsletter" />
                      <option value="Video Script" />
                      <option value="Press Release" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-8">
                      Deliverable Format
                    </label>
                    <input
                      type="text"
                      list="content-deliverable-options"
                      value={deliverable}
                      onChange={e => setDeliverable(e.target.value)}
                      placeholder="e.g. Google Doc Draft, Notion Page"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-8"
                    />
                    <datalist id="content-deliverable-options">
                      <option value="Google Doc Draft" />
                      <option value="Notion Brief & Copy" />
                      <option value="Markdown File" />
                      <option value="Copy Deck Spreadsheet" />
                      <option value="PDF Document" />
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-9">
                      Brief / Outline URL
                    </label>
                    <input
                      type="text"
                      value={brief}
                      onChange={e => setBrief(e.target.value)}
                      placeholder="Link to document brief or outline..."
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-9"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-10">
                      Word Count Target
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={wordCount}
                      onChange={e => setWordCount(e.target.value)}
                      placeholder="e.g. 800, 1500"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-11">
                    Relevant Requirements & Guidelines
                  </label>
                  <textarea
                    rows={2}
                    value={relevantRequirements}
                    onChange={e => setRelevantRequirements(e.target.value)}
                    placeholder="Keywords, target persona, tone of voice, call to action requirements..."
                    className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-none"
                    id="disciplinetaskmodal-field-11"
                  />
                </div>
              </div>
            )}

            {/* Design Discipline Fields */}
            {needsDesign && (
              <div className="space-y-3.5 rounded-xl border border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                  <Palette className="h-3.5 w-3.5" />
                  <span>Design Subtask Specifications</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-12">
                      Asset Type
                    </label>
                    <input
                      type="text"
                      list="design-asset-options"
                      value={assetType}
                      onChange={e => setAssetType(e.target.value)}
                      placeholder="e.g. Social Banner, Infographic"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-12"
                    />
                    <datalist id="design-asset-options">
                      <option value="Social Media Banner" />
                      <option value="Infographic" />
                      <option value="Presentation Deck" />
                      <option value="Brand Identity / Logo" />
                      <option value="Ad Creative Pack" />
                      <option value="Print / Packaging" />
                      <option value="Vector Illustration" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-13">
                      Dimensions / Aspect Ratio
                    </label>
                    <input
                      type="text"
                      list="design-dim-options"
                      value={dimensions}
                      onChange={e => setDimensions(e.target.value)}
                      placeholder="e.g. 1080x1080, 1920x1080, A4"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-13"
                    />
                    <datalist id="design-dim-options">
                      <option value="1080x1080 (Square 1:1)" />
                      <option value="1920x1080 (Landscape 16:9)" />
                      <option value="1080x1920 (Story/Reel 9:16)" />
                      <option value="1200x628 (Facebook/LinkedIn Ad)" />
                      <option value="A4 Print (210x297mm)" />
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-14">
                      Deliverable Format
                    </label>
                    <input
                      type="text"
                      list="design-format-options"
                      value={format}
                      onChange={e => setFormat(e.target.value)}
                      placeholder="e.g. Figma, PSD, AI, PNG, SVG, PDF"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-14"
                    />
                    <datalist id="design-format-options">
                      <option value="Figma Source + PNG Export" />
                      <option value="Adobe Illustrator (.ai) + SVG" />
                      <option value="Adobe Photoshop (.psd)" />
                      <option value="High-Res PDF (Print Ready)" />
                      <option value="PNG / JPEG Pack" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-15">
                      Quantity of Assets
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      placeholder="e.g. 1, 3, 5"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      id="disciplinetaskmodal-field-15"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-16">
                    Design Specifications & Brand Notes
                  </label>
                  <textarea
                    rows={2}
                    value={designSpecifications}
                    onChange={e => setDesignSpecifications(e.target.value)}
                    placeholder="Color palette, font pairings, visual reference links, bleed/margins..."
                    className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-none"
                    id="disciplinetaskmodal-field-16"
                  />
                </div>
              </div>
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
