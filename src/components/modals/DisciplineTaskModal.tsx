import { DialogPanel } from '../ui/DialogPanel';
import { ContentSpecFields, DesignSpecFields } from '../forms/DisciplineSpecFields';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { useAuth, useBoardUi, useClickUp, useWorkspace } from '../../context/DashboardContext';
import { RoleFilter, TaskDisciplineMetadata } from '../../types';
import { isValidHttpUrl } from '../../utils/taskMetadata';
import { DateQuickPresets } from '../ui/DateQuickPresets';
import {
  X,
  FileText,
  Palette,
  Plus,
  AlertCircle,
  FilePlus2,
  Check,
  FolderKanban,
  Loader2,
  ChevronDown,
  ChevronUp,
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
  const [showClickupDestination, setShowClickupDestination] = useState(false);

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
      setNeedsDesign(false);
    }
    setShowClickupDestination(false);

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
    if (isSubmitting) return;
    if (!title.trim()) {
      setSubmitError('Deliverable title is required.');
      document.getElementById('disciplinetaskmodal-field-1')?.focus();
      return;
    }

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
      <div
        className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        onClick={e => {
          if (e.target === e.currentTarget && !isSubmitting) onClose();
        }}
      >
        <DialogPanel
          aria-label="Create pipeline requirement"
          onClose={onClose}
          busy={isSubmitting}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-2xl max-h-[92vh] my-auto flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="dialog-header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                <FilePlus2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  New Pipeline Brief
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)] truncate">
                  Creates a parent deliverable and unassigned discipline subtasks.
                </p>
              </div>
            </div>
            <button
              aria-label="Close dialog"
              type="button"
              onClick={onClose}
              className="icon-button shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Requirement Type Bar */}
          <div className="px-5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Requirement Type
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNeedsContent(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-[7px] text-xs font-semibold border transition-colors cursor-pointer ${
                    needsContent
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                      : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border ${
                      needsContent
                        ? 'border-white bg-white text-[#1d4ed8]'
                        : 'border-[var(--text-muted)]'
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
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-[7px] text-xs font-semibold border transition-colors cursor-pointer ${
                    needsDesign
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                      : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border ${
                      needsDesign
                        ? 'border-white bg-white text-[#1d4ed8]'
                        : 'border-[var(--text-muted)]'
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
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {submitError && (
                <div role="alert" className="callout callout-danger flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Shared Section: Task Basics FIRST */}
              <div className="space-y-4">
                <div>
                  <label className="field-label" htmlFor="disciplinetaskmodal-field-1">
                    Parent Deliverable Title <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Q4 Product Launch Campaign Pack"
                    className="field-control"
                    id="disciplinetaskmodal-field-1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="field-label !mb-0" htmlFor="disciplinetaskmodal-field-2">
                      Brief
                    </label>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Shared &amp; linked to parent task
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Detailed campaign brief, objectives, audience, messaging, and context..."
                    className="field-control resize-y"
                    id="disciplinetaskmodal-field-2"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="field-label !mb-0" htmlFor="disciplinetaskmodal-brand-guidelines">
                      Brand Guidelines Link
                    </label>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Shared &amp; linked to parent task
                    </span>
                  </div>
                  <input
                    type="url"
                    value={brandGuidelines}
                    onChange={e => setBrandGuidelines(e.target.value)}
                    placeholder="https://... (Brand book, Notion, Google Drive, Figma)"
                    className="field-control"
                    id="disciplinetaskmodal-brand-guidelines"
                  />
                </div>

                {/* Account / Client & Project */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="field-label" htmlFor="disciplinetaskmodal-field-3">
                      Account / Client
                    </label>
                    <input
                      type="text"
                      list="discipline-client-options"
                      value={client}
                      onChange={e => setClient(e.target.value)}
                      placeholder="Auto-filled from Space/Folder or custom"
                      className="field-control"
                      id="disciplinetaskmodal-field-3"
                    />
                    <datalist id="discipline-client-options">
                      {existingClients.map(c => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="disciplinetaskmodal-field-4">
                      Project / Campaign
                    </label>
                    <input
                      type="text"
                      list="discipline-project-options"
                      value={project}
                      onChange={e => setProject(e.target.value)}
                      placeholder="Auto-filled from List or custom"
                      className="field-control"
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
                    <label className="field-label">
                      Priority
                    </label>
                    <div className="flex items-center gap-1.5">
                      {(['low', 'medium', 'high'] as const).map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-[7px] py-1.5 text-xs font-semibold capitalize border transition-colors cursor-pointer ${
                            priority === p
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              p === 'high'
                                ? 'bg-red-600 dark:bg-red-400'
                                : p === 'medium'
                                ? 'bg-amber-600 dark:bg-amber-400'
                                : 'bg-emerald-600 dark:bg-emerald-400'
                            }`}
                          />
                          <span>{p}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <label className="field-label !mb-0" htmlFor="disciplinetaskmodal-field-5">
                        Target Deadline
                      </label>
                      <DateQuickPresets
                        value={dueDate}
                        onSelectDate={setDueDate}
                        allowClear
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        className="field-control flex-1 min-w-0 tabular-nums cursor-pointer"
                        id="disciplinetaskmodal-field-5"
                      />
                      {dueDate && (
                        <button
                          type="button"
                          onClick={() => setDueDate('')}
                          title="Clear deadline"
                          aria-label="Clear deadline"
                          className="icon-button border border-[var(--border)] bg-[var(--surface)] shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapsible ClickUp Destination Section */}
              <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowClickupDestination(prev => !prev)}
                  aria-expanded={showClickupDestination}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderKanban className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                      ClickUp Destination (Optional)
                    </span>
                    {selectedSpace && (
                      <span className="text-[11px] text-[#1d4ed8] dark:text-blue-400 font-medium truncate">
                        · {selectedSpace.name}{selectedList ? ` / ${selectedList.name}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isClickupConnected && (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium hidden sm:inline">
                        Not connected
                      </span>
                    )}
                    {showClickupDestination ? (
                      <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    )}
                  </div>
                </button>

                {showClickupDestination && (clickupActionError || isClickupConnected ? (
                  <div className="p-3.5 border-t border-[var(--border-subtle)] space-y-3">
                    {clickupActionError && (
                      <div role="alert" className="callout callout-danger text-[11px]">
                        {clickupActionError}
                      </div>
                    )}

                    {isClickupConnected && (
                      <div className="space-y-3">
                        {/* Space Selector + Inline Creator */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="field-label !mb-0">
                              ClickUp Space
                            </label>
                            {!isCreatingSpace && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreatingSpace(true);
                                  setClickupActionError(null);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer"
                                style={{ minHeight: 'auto' }}
                              >
                                <Plus className="h-3 w-3" />
                                <span>New Space</span>
                              </button>
                            )}
                          </div>

                          {isCreatingSpace ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={newSpaceName}
                                onChange={e => setNewSpaceName(e.target.value)}
                                placeholder="New ClickUp Space name (e.g. Acme Corp)"
                                disabled={isSubmittingSpace}
                                className="field-control flex-1"
                              />
                              <button
                                type="button"
                                onClick={handleCreateSpace}
                                disabled={!newSpaceName.trim() || isSubmittingSpace}
                                className="button-primary shrink-0"
                              >
                                {isSubmittingSpace ? 'Creating...' : 'Create'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreatingSpace(false);
                                  setNewSpaceName('');
                                }}
                                className="button-secondary shrink-0"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="relative">
                              <select
                                value={selectedSpaceId}
                                onChange={e => handleSpaceChange(e.target.value)}
                                className="field-control pr-8 cursor-pointer"
                              >
                                <option value="">-- Select ClickUp Space (Optional) --</option>
                                {clickupSpaces.map(sp => (
                                  <option key={sp.id} value={sp.id}>
                                    {sp.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                            </div>
                          )}
                        </div>

                        {/* Folder & List Selectors */}
                        {selectedSpaceId && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="field-label">
                                Folder (Optional)
                              </label>
                              <div className="relative">
                                <select
                                  value={selectedFolderId}
                                  onChange={e => handleFolderChange(e.target.value)}
                                  disabled={isLoadingLists}
                                  className="field-control pr-8 cursor-pointer"
                                >
                                  <option value="">Folderless Lists (Direct)</option>
                                  {availableFolders.map(folder => (
                                    <option key={folder.id} value={folder.id}>
                                      {folder.name}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="field-label !mb-0 flex items-center gap-1.5">
                                  <span>ClickUp List</span>
                                  {isLoadingLists && <Loader2 className="h-3 w-3 animate-spin text-[#1d4ed8] dark:text-blue-400" />}
                                </label>
                                {!isCreatingList && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsCreatingList(true);
                                      setClickupActionError(null);
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer"
                                    style={{ minHeight: 'auto' }}
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
                                    className="field-control flex-1 min-w-0"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleCreateList}
                                    disabled={!newListName.trim() || isSubmittingList}
                                    className="button-primary shrink-0"
                                  >
                                    {isSubmittingList ? '...' : 'Add'}
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Cancel new list"
                                    onClick={() => {
                                      setIsCreatingList(false);
                                      setNewListName('');
                                    }}
                                    className="icon-button border border-[var(--border)] bg-[var(--surface)] shrink-0"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="relative">
                                  <select
                                    value={selectedListId}
                                    onChange={e => handleListChange(e.target.value)}
                                    disabled={isLoadingLists}
                                    className="field-control pr-8 cursor-pointer"
                                  >
                                    <option value="">-- Select List --</option>
                                    {availableLists.map(list => (
                                      <option key={list.id} value={list.id}>
                                        {list.name}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ClickUp Custom Task Type Field */}
                        {selectedListId && (clickupCustomFieldOptions.length > 0 || isLoadingTaskTypes) && (
                          <div>
                            <label className="field-label flex items-center gap-1.5">
                              <span>ClickUp Type Custom Field</span>
                              {isLoadingTaskTypes && <Loader2 className="h-3 w-3 animate-spin text-[#1d4ed8] dark:text-blue-400" />}
                            </label>
                            <div className="relative">
                              <select
                                value={selectedTaskTypeId}
                                onChange={e => setSelectedTaskTypeId(e.target.value)}
                                disabled={isLoadingTaskTypes}
                                className="field-control pr-8 cursor-pointer"
                              >
                                <option value="">-- None --</option>
                                {clickupCustomFieldOptions.map(opt => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="px-3.5 py-2.5 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                    Connect ClickUp in Database &amp; Compliance settings to route deliverables directly into ClickUp Spaces &amp; Lists.
                  </p>
                ))}
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
            </div>

            {/* Footer Buttons */}
            <div className="dialog-footer !justify-between flex-wrap">
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
                  className="button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !canCreatePipelineTask}
                  className="button-primary"
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
