import { DialogPanel } from '../ui/DialogPanel';
import { ContentSpecFields, DesignSpecFields } from '../forms/DisciplineSpecFields';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { useAuth, useBoardUi, useClickUp, useWorkspace } from '../../context/DashboardContext';
import { RoleFilter, TaskDisciplineMetadata } from '../../types';
import { isValidHttpUrl } from '../../utils/taskMetadata';
import { DateQuickPresets } from '../ui/DateQuickPresets';
import { PrioritySelector } from '../ui/PrioritySelector';
import { useDiscardGuard } from '../../hooks/useDiscardGuard';
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
  onCreated: (title: string) => void;
  initialDiscipline?: RoleFilter;
}

export const DisciplineTaskModal: React.FC<DisciplineTaskModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialDiscipline = 'all',
}) => {
  const { canCreatePipelineTask } = useAuth();
  const { activeRoleTab, activeBoardId } = useBoardUi();
  const { tasks, creativeDirectors, createPipelineBundle } = useWorkspace();
  const defaultOwningCluster = creativeDirectors.some(user => user.id === activeBoardId) ? activeBoardId : '';
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
  const [activeTab, setActiveTab] = useState<'brief' | 'specs'>('brief');
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
  const [owningClusterId, setOwningClusterId] = useState('');
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

    setOwningClusterId(defaultOwningCluster);
    setTitle('');
    setDescription('');
    setBrandGuidelines('');
    setClient('');
    setProject('');
    lastAutoClientRef.current = '';
    lastAutoProjectRef.current = '';
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

  const isDirty = isOpen && Boolean(
    title.trim() ||
    description.trim() ||
    brandGuidelines.trim() ||
    client.trim() ||
    project.trim() ||
    dueDate.trim() ||
    priority !== 'medium' ||
    contentSpecifications.trim() ||
    designSpecifications.trim() ||
    sourceContentReferences.length > 0 ||
    brandAssetsReferences.length > 0
  );
  const { showDiscardConfirm, requestClose, confirmDiscard, resetDiscardConfirm } = useDiscardGuard(
    isDirty,
    isSubmitting,
    onClose
  );

  useEffect(() => {
    if (isOpen) {
      resetForm();
      resetDiscardConfirm();
    }
  }, [isOpen, resetDiscardConfirm]);

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

  const lastAutoClientRef = useRef('');
  const lastAutoProjectRef = useRef('');

  const handleSpaceChange = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setSelectedFolderId('');
    setSelectedListId('');
    setClickupActionError(null);
    const sp = clickupSpaces.find(s => s.id === spaceId);
    if (sp) {
      if (!client.trim() || client === lastAutoClientRef.current) {
        setClient(sp.name);
        lastAutoClientRef.current = sp.name;
      }
      if (!project.trim() || project === lastAutoProjectRef.current) {
        setProject('');
        lastAutoProjectRef.current = '';
      }
    }
  };

  const handleFolderChange = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedListId('');
    setClickupActionError(null);
    const folder = availableFolders.find(f => f.id === folderId);
    const nextClient = folder ? folder.name : (selectedSpace?.name || '');
    if (nextClient && (!client.trim() || client === lastAutoClientRef.current)) {
      setClient(nextClient);
      lastAutoClientRef.current = nextClient;
    }
    if (!project.trim() || project === lastAutoProjectRef.current) {
      setProject('');
      lastAutoProjectRef.current = '';
    }
  };

  const handleListChange = (listId: string) => {
    setSelectedListId(listId);
    setClickupActionError(null);
    const list = availableLists.find(l => l.id === listId);
    if (list) {
      if (!project.trim() || project === lastAutoProjectRef.current) {
        setProject(list.name);
        lastAutoProjectRef.current = list.name;
      }
      if (!client.trim() || client === lastAutoClientRef.current) {
        const nextClient = selectedFolder?.name || selectedSpace?.name || '';
        setClient(nextClient);
        lastAutoClientRef.current = nextClient;
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
  const formBodyRef = useRef<HTMLDivElement>(null);
  const formContentRef = useRef<HTMLDivElement>(null);
  const [hasMoreFields, setHasMoreFields] = useState(false);

  const updateScrollCue = () => {
    const body = formBodyRef.current;
    setHasMoreFields(Boolean(body && body.scrollHeight - body.clientHeight - body.scrollTop > 1));
  };

  useEffect(() => {
    const body = formBodyRef.current;
    const content = formContentRef.current;
    if (!isOpen || !body || !content) return;
    const observer = new ResizeObserver(updateScrollCue);
    observer.observe(body);
    observer.observe(content);
    return () => observer.disconnect();
  }, [isOpen]);
  useEffect(() => { if (!isOpen) creationId.current = undefined; }, [isOpen]);

  useEffect(() => {
    if (submitError) {
      formBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [submitError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!title.trim()) {
      setSubmitError('Deliverable title is required.');
      document.getElementById('disciplinetaskmodal-field-1')?.focus();
      return;
    }

    if (!creativeDirectors.some(user => user.id === owningClusterId)) {
      setSubmitError('Choose a cluster before creating a brief. An administrator must create a Creative Director cluster if none exists.');
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
        owningClusterId,
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

      onCreated(title.trim());
      onClose();
    } catch (err: any) {
      const reason = err instanceof Error ? ` ${err.message}` : '';
      setSubmitError(`Couldn’t create brief.${reason} Your details are still here. Try again.`);
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
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <DialogPanel
          aria-labelledby="new-brief-title"
          onClose={requestClose}
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
                <h2 id="new-brief-title" className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                  New Brief
                </h2>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  Creates a parent task and unassigned discipline subtasks.
                </p>
              </div>
            </div>
            <button
              aria-label="Close dialog"
              type="button"
              onClick={requestClose}
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
                  aria-pressed={needsContent}
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
                  aria-pressed={needsDesign}
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

            {/* 2-Tab Navigation: Brief & Routing vs Discipline Specs */}
            <div role="tablist" aria-label="Brief sections" onKeyDown={event => {
              const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
              const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
              if (index < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              tabs[next].focus();
              tabs[next].click();
            }} className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--surface-muted)] px-5">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'brief'}
                tabIndex={activeTab === 'brief' ? 0 : -1}
                onClick={() => setActiveTab('brief')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'brief'
                    ? 'border-[var(--accent)] text-[#1d4ed8] dark:text-blue-400'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Brief &amp; Routing
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'specs'}
                tabIndex={activeTab === 'specs' ? 0 : -1}
                disabled={!needsContent && !needsDesign}
                onClick={() => setActiveTab('specs')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeTab === 'specs'
                    ? 'border-[var(--accent)] text-[#1d4ed8] dark:text-blue-400'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Discipline Specs{selectedDisciplines.length > 0 ? ` (${selectedDisciplines.length})` : ''}
              </button>
            </div>
          </div>

          {/* Scrollable Form Body */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div ref={formBodyRef} onScroll={updateScrollCue} className="flex-1 overflow-y-auto">
              <div ref={formContentRef} className="p-5 space-y-5">
              {showDiscardConfirm && (
                <div role="alertdialog" aria-label="Discard unsaved brief" className="callout callout-warning space-y-2">
                  <p className="text-xs font-semibold">Discard unsaved brief?</p>
                  <p className="text-[11px] opacity-90">
                    You have unsubmitted brief details that will be lost if you close now.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" autoFocus onClick={resetDiscardConfirm} className="button-secondary">
                      Keep Editing
                    </button>
                    <button type="button" onClick={confirmDiscard} className="button-danger-outline">
                      Discard
                    </button>
                  </div>
                </div>
              )}
              {submitError && (
                <div role="alert" className="callout callout-danger flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {activeTab === 'brief' && (
                <>
              {/* Shared Section: Task Basics FIRST */}
              <div className="space-y-4">
                <div>
                  <label className="field-label" htmlFor="brief-owning-cluster">Cluster <span className="text-red-600">*</span></label>
                  <select id="brief-owning-cluster" data-autofocus={!defaultOwningCluster ? '' : undefined} className="field-control" required value={owningClusterId} onChange={event => setOwningClusterId(event.target.value)}>
                    <option value="">{creativeDirectors.length ? 'Select a cluster' : 'No cluster available'}</option>
                    {creativeDirectors.map(user => <option key={user.id} value={user.id}>{user.name}’s Team</option>)}
                  </select>
                  {creativeDirectors.length === 0 && <p className="text-xs text-[var(--text-secondary)] mt-1">Ask an administrator to create a Creative Director cluster before creating a brief.</p>}
                </div>
                <div>
                  <label className="field-label" htmlFor="disciplinetaskmodal-field-1">
                    Deliverable Title <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <input
                    data-autofocus={defaultOwningCluster ? '' : undefined}
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
                      placeholder={selectedSpace ? 'Auto-filled from Space or custom' : 'e.g. Acme Corp'}
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
                      placeholder={selectedList ? 'Auto-filled from List or custom' : 'e.g. Q4 Product Launch'}
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
                  <PrioritySelector
                    value={priority}
                    onChange={setPriority}
                    labelId="disciplinetaskmodal-priority-label"
                  />

                  <div>
                    <label className="field-label" htmlFor="disciplinetaskmodal-field-5">
                      Target Deadline
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="field-control tabular-nums cursor-pointer"
                      id="disciplinetaskmodal-field-5"
                    />
                    <DateQuickPresets
                      value={dueDate}
                      onSelectDate={setDueDate}
                      allowClear
                      className="mt-1.5"
                    />
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
                            <label htmlFor="disciplinetaskmodal-clickup-space" className="field-label !mb-0">
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
                                id="disciplinetaskmodal-clickup-space"
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
                              <label htmlFor="disciplinetaskmodal-clickup-folder" className="field-label">
                                Folder (Optional)
                              </label>
                              <div className="relative">
                                <select
                                  id="disciplinetaskmodal-clickup-folder"
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
                                <label htmlFor="disciplinetaskmodal-clickup-list" className="field-label !mb-0 flex items-center gap-1.5">
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
                                    id="disciplinetaskmodal-clickup-list"
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
                            <label htmlFor="disciplinetaskmodal-clickup-type" className="field-label flex items-center gap-1.5">
                              <span>ClickUp Type Custom Field</span>
                              {isLoadingTaskTypes && <Loader2 className="h-3 w-3 animate-spin text-[#1d4ed8] dark:text-blue-400" />}
                            </label>
                            <div className="relative">
                              <select
                                id="disciplinetaskmodal-clickup-type"
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
                </>
              )}

              {activeTab === 'specs' && (
                <>
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
                </>
              )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="dialog-footer !justify-between flex-wrap">
              <div className="text-xs text-[var(--text-secondary)]">
                <p className="min-h-[1lh] font-semibold">{hasMoreFields && 'More fields below'}</p>
                <span>
                  {!canCreatePipelineTask
                    ? 'Your role cannot create Pipeline briefs.'
                    : creativeDirectors.length === 0
                    ? 'An administrator must create a cluster first.'
                    : !owningClusterId
                    ? 'Select a cluster to create this brief.'
                    : !title.trim()
                    ? 'Enter a deliverable title to create this brief.'
                    : selectedDisciplines.length === 2
                    ? 'Creates brief with Content & Design deliverables in Pipeline.'
                    : selectedDisciplines.length === 1
                    ? `Creates ${selectedDisciplines[0]} brief deliverable in Pipeline.`
                    : 'Select at least one requirement type.'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={requestClose}
                  className="button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !canCreatePipelineTask || selectedDisciplines.length === 0 || !owningClusterId || !title.trim()}
                  className="button-primary"
                >
                  {isSubmitting
                    ? 'Creating...'
                    : 'Create Brief'}
                </button>
              </div>
            </div>
          </form>
        </DialogPanel>
      </div>
    </AnimatePresence>
  );
};
