import { DialogPanel } from '../ui/DialogPanel';
import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { useDashboard } from '../../context/DashboardContext';
import { Role, TaskDisciplineMetadata } from '../../types';
import { getLastDayOfMonth } from '../../utils/workload';
import {
  X,
  FileText,
  Palette,
  Video as VideoIcon,
  Layout,
  Search,
  Plus,
  AlertCircle,
  Link as LinkIcon,
  Sparkles,
} from 'lucide-react';

interface DisciplineTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDiscipline?: Role;
}

const DISCIPLINE_TABS: Array<{ role: Role; label: string; icon: React.FC<{ className?: string }> }> = [
  { role: 'content', label: 'Content', icon: FileText },
  { role: 'design', label: 'Design', icon: Palette },
  { role: 'video', label: 'Video', icon: VideoIcon },
  { role: 'ui_ux', label: 'UI/UX', icon: Layout },
  { role: 'research', label: 'Research', icon: Search },
];

export const DisciplineTaskModal: React.FC<DisciplineTaskModalProps> = ({
  isOpen,
  onClose,
  initialDiscipline = 'content',
}) => {
  const {
    tasks,
    activeRoleTab,
    createTask,
    canCreatePipelineTask,
  } = useDashboard();

  const [selectedDiscipline, setSelectedDiscipline] = useState<Role>(() => {
    if (['content', 'design', 'video', 'ui_ux', 'research'].includes(initialDiscipline)) {
      return initialDiscipline;
    }
    if (['content', 'design', 'video', 'ui_ux', 'research'].includes(activeRoleTab)) {
      return activeRoleTab;
    }
    return 'content';
  });

  useEffect(() => {
    if (isOpen) {
      if (['content', 'design', 'video', 'ui_ux', 'research'].includes(initialDiscipline)) {
        setSelectedDiscipline(initialDiscipline);
      } else if (['content', 'design', 'video', 'ui_ux', 'research'].includes(activeRoleTab)) {
        setSelectedDiscipline(activeRoleTab);
      }
    }
  }, [isOpen, initialDiscipline, activeRoleTab]);

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

  // Video Discipline Fields
  const [videoType, setVideoType] = useState('Social Reel / Short');
  const [duration, setDuration] = useState('30s');
  const [aspectRatio, setAspectRatio] = useState('9:16 (Vertical)');
  const [videoDeliverables, setVideoDeliverables] = useState('4K MP4 + Thumbnail');
  const [productionRequirements, setProductionRequirements] = useState('');

  // UI/UX Discipline Fields
  const [designType, setDesignType] = useState('Web Application');
  const [platform, setPlatform] = useState('Web Desktop');
  const [screens, setScreens] = useState('1');
  const [userFlows, setUserFlows] = useState('');
  const [prototypeRequirements, setPrototypeRequirements] = useState('Clickable Figma Prototype');

  // Research Discipline Fields
  const [researchType, setResearchType] = useState('Competitive Benchmarking');
  const [objectives, setObjectives] = useState('');
  const [scope, setScope] = useState('');
  const [methodology, setMethodology] = useState('Secondary / Desk Research');
  const [expectedOutputs, setExpectedOutputs] = useState('Executive Summary Deck (PDF)');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    setTitle('');
    setDescription('');
    setClient('');
    setProject('');
    setPriority('medium');
    setDueDate('');
    setAttachments([]);
    setNewAttachmentUrl('');
    setIsAddingAttachment(false);

    // Content
    setContentType('Blog Post');
    setDeliverable('Google Doc Draft');
    setBrief('');
    setWordCount('');
    setRelevantRequirements('');

    // Design
    setAssetType('Social Media Banner');
    setDimensions('1080x1080');
    setFormat('Figma');
    setQuantity('1');
    setDesignSpecifications('');

    // Video
    setVideoType('Social Reel / Short');
    setDuration('30s');
    setAspectRatio('9:16 (Vertical)');
    setVideoDeliverables('4K MP4 + Thumbnail');
    setProductionRequirements('');

    // UI/UX
    setDesignType('Web Application');
    setPlatform('Web Desktop');
    setScreens('1');
    setUserFlows('');
    setPrototypeRequirements('Clickable Figma Prototype');

    // Research
    setResearchType('Competitive Benchmarking');
    setObjectives('');
    setScope('');
    setMethodology('Secondary / Desk Research');
    setExpectedOutputs('Executive Summary Deck (PDF)');

    setSubmitError(null);
  };

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

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

  const setQuickDate = (daysFromNow: number | null, isEndOfMonth: boolean = false) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    if (!canCreatePipelineTask) {
      setSubmitError('Only Accounts team members and authorized special roles can create tasks in team pipelines.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    // Build discipline-specific metadata
    const disciplineMetadata: TaskDisciplineMetadata = {};

    if (selectedDiscipline === 'content') {
      disciplineMetadata.contentType = contentType.trim() || undefined;
      disciplineMetadata.deliverable = deliverable.trim() || undefined;
      disciplineMetadata.brief = brief.trim() || undefined;
      disciplineMetadata.wordCount = wordCount ? parseInt(wordCount, 10) : undefined;
      disciplineMetadata.relevantRequirements = relevantRequirements.trim() || undefined;
    } else if (selectedDiscipline === 'design') {
      disciplineMetadata.assetType = assetType.trim() || undefined;
      disciplineMetadata.dimensions = dimensions.trim() || undefined;
      disciplineMetadata.format = format.trim() || undefined;
      disciplineMetadata.quantity = quantity ? parseInt(quantity, 10) : undefined;
      disciplineMetadata.designSpecifications = designSpecifications.trim() || undefined;
    } else if (selectedDiscipline === 'video') {
      disciplineMetadata.videoType = videoType.trim() || undefined;
      disciplineMetadata.duration = duration.trim() || undefined;
      disciplineMetadata.aspectRatio = aspectRatio.trim() || undefined;
      disciplineMetadata.deliverables = videoDeliverables.trim() || undefined;
      disciplineMetadata.productionRequirements = productionRequirements.trim() || undefined;
    } else if (selectedDiscipline === 'ui_ux') {
      disciplineMetadata.designType = designType.trim() || undefined;
      disciplineMetadata.platform = platform.trim() || undefined;
      disciplineMetadata.screens = screens ? parseInt(screens, 10) : undefined;
      disciplineMetadata.userFlows = userFlows.trim() || undefined;
      disciplineMetadata.prototypeRequirements = prototypeRequirements.trim() || undefined;
    } else if (selectedDiscipline === 'research') {
      disciplineMetadata.researchType = researchType.trim() || undefined;
      disciplineMetadata.objectives = objectives.trim() || undefined;
      disciplineMetadata.scope = scope.trim() || undefined;
      disciplineMetadata.methodology = methodology.trim() || undefined;
      disciplineMetadata.expectedOutputs = expectedOutputs.trim() || undefined;
    }

    try {
      // Newly created tasks enter the team's shared pipeline as Unassigned (userId: undefined)
      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        team: selectedDiscipline,
        status: 'pipeline',
        userId: undefined, // Enters as Unassigned
        cognitiveLoad: 'medium', // Default; to be estimated by Creative Director on assignment
        dueDate: dueDate.trim() || undefined,
        client: client.trim() || undefined,
        project: project.trim() || undefined,
        priority,
        attachments: attachments.length > 0 ? attachments : undefined,
        disciplineMetadata,
      });

      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message || 'Failed to create task in pipeline');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/60 ">
        <DialogPanel aria-label="Create team task" onClose={onClose} busy={isSubmitting}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 bg-neutral-50/50 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Create Team Pipeline Task
                </h3>
              </div>
            </div>
            <button aria-label="Close dialog"
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Discipline Switcher Tabs */}
          <div className="flex items-center gap-1.5 px-6 pt-3.5 pb-2 border-b border-[var(--border)] overflow-x-auto bg-neutral-50/30 dark:bg-white/[0.01]">
            {DISCIPLINE_TABS.map(tab => {
              const Icon = tab.icon;
              const isSelected = selectedDiscipline === tab.role;
              return (
                <button
                  key={tab.role}
                  type="button"
                  onClick={() => setSelectedDiscipline(tab.role)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {submitError && (
              <div className="rounded-xl border border-red-500/20 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Shared Section: Task Basics */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-1">
                  Task Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={`e.g. ${
                    selectedDiscipline === 'content'
                      ? 'Q4 Tech Trends In-Depth Blog Post'
                      : selectedDiscipline === 'design'
                      ? 'Product Launch Key Visuals & Banner Pack'
                      : selectedDiscipline === 'video'
                      ? 'Interactive Product Demo Walkthrough (60s)'
                      : selectedDiscipline === 'ui_ux'
                      ? 'Design System Navigation & Checkout Flow'
                      : 'AI Enterprise Tooling Competitive Matrix'
                  }`}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-1"
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
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-none" id="disciplinetaskmodal-field-2"
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
                    placeholder="e.g. Acme Corp, FinTech Global"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-3"
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
                    placeholder="e.g. Q4 Rebrand, Global Launch"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-4"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-5"
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
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-6"
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
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 border border-[var(--border)] text-xs text-neutral-700 /80 max-w-full"
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

            {/* Divider */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[var(--surface)] px-3 font-semibold text-[var(--text-secondary)] uppercase tracking-wider text-[11px]">
                  {selectedDiscipline.toUpperCase()} Specifications
                </span>
              </div>
            </div>

            {/* Discipline-Specific Fields */}
            {selectedDiscipline === 'content' && (
              <div className="space-y-3.5 rounded-xl border border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10 p-4">
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
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-7"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-8"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-9"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-10"
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
                    className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-none" id="disciplinetaskmodal-field-11"
                  />
                </div>
              </div>
            )}

            {selectedDiscipline === 'design' && (
              <div className="space-y-3.5 rounded-xl border border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10 p-4">
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
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-12"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-13"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-14"
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
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-15"
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
                    className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-none" id="disciplinetaskmodal-field-16"
                  />
                </div>
              </div>
            )}

            {selectedDiscipline === 'video' && (
              <div className="space-y-3.5 rounded-xl border border-violet-500/20 bg-violet-50/30 dark:bg-violet-950/10 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-17">
                      Video Type
                    </label>
                    <input
                      type="text"
                      list="video-type-options"
                      value={videoType}
                      onChange={e => setVideoType(e.target.value)}
                      placeholder="e.g. Explainer, Reel / Short"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-17"
                    />
                    <datalist id="video-type-options">
                      <option value="Social Reel / Short (Vertical)" />
                      <option value="Product Demo Walkthrough" />
                      <option value="Animated Explainer Video" />
                      <option value="Motion Graphics Teaser" />
                      <option value="Corporate Brand Film" />
                      <option value="Customer Testimonial Cut" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-18">
                      Expected Duration
                    </label>
                    <input
                      type="text"
                      list="video-dur-options"
                      value={duration}
                      onChange={e => setDuration(e.target.value)}
                      placeholder="e.g. 15s, 30s, 60s, 2-3 mins"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-18"
                    />
                    <datalist id="video-dur-options">
                      <option value="15s" />
                      <option value="30s" />
                      <option value="60s" />
                      <option value="90s" />
                      <option value="2-3 minutes" />
                      <option value="5+ minutes" />
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-19">
                      Aspect Ratio
                    </label>
                    <input
                      type="text"
                      list="video-aspect-options"
                      value={aspectRatio}
                      onChange={e => setAspectRatio(e.target.value)}
                      placeholder="e.g. 9:16 (Vertical), 16:9 (Landscape)"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-19"
                    />
                    <datalist id="video-aspect-options">
                      <option value="9:16 (Vertical / Reels / TikTok)" />
                      <option value="16:9 (Landscape / YouTube)" />
                      <option value="1:1 (Square / Feed)" />
                      <option value="4:5 (Social Portrait)" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-20">
                      Deliverables
                    </label>
                    <input
                      type="text"
                      list="video-deliv-options"
                      value={videoDeliverables}
                      onChange={e => setVideoDeliverables(e.target.value)}
                      placeholder="e.g. 4K MP4, ProRes, Project Files"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-20"
                    />
                    <datalist id="video-deliv-options">
                      <option value="4K MP4 + High-Res Thumbnail" />
                      <option value="1080p MP4 (Web Optimized)" />
                      <option value="Apple ProRes 422 Master" />
                      <option value="Premiere / After Effects Project Archive" />
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-21">
                    Production Requirements & Script Notes
                  </label>
                  <textarea
                    rows={2}
                    value={productionRequirements}
                    onChange={e => setProductionRequirements(e.target.value)}
                    placeholder="Voiceover specs, music track style, closed captioning (.srt), branding overlays..."
                    className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-none" id="disciplinetaskmodal-field-21"
                  />
                </div>
              </div>
            )}

            {selectedDiscipline === 'ui_ux' && (
              <div className="space-y-3.5 rounded-xl border border-cyan-500/20 bg-cyan-50/30 dark:bg-cyan-950/10 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-22">
                      Design Type
                    </label>
                    <input
                      type="text"
                      list="ui-type-options"
                      value={designType}
                      onChange={e => setDesignType(e.target.value)}
                      placeholder="e.g. Web App, Mobile App, Landing Page"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-22"
                    />
                    <datalist id="ui-type-options">
                      <option value="Web Application" />
                      <option value="Mobile App (iOS / Android)" />
                      <option value="Marketing Landing Page" />
                      <option value="Design System & Component Library" />
                      <option value="Executive Dashboard" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-23">
                      Platform Target
                    </label>
                    <input
                      type="text"
                      list="ui-platform-options"
                      value={platform}
                      onChange={e => setPlatform(e.target.value)}
                      placeholder="e.g. Web Desktop, iOS Native, Responsive"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-23"
                    />
                    <datalist id="ui-platform-options">
                      <option value="Web Desktop (1440px)" />
                      <option value="Mobile iOS (iPhone 15 Pro)" />
                      <option value="Mobile Android" />
                      <option value="Responsive Multi-Device" />
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-24">
                      Estimated Screen Count
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={screens}
                      onChange={e => setScreens(e.target.value)}
                      placeholder="e.g. 3, 8, 15"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-24"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-25">
                      Prototype Deliverable
                    </label>
                    <input
                      type="text"
                      list="ui-proto-options"
                      value={prototypeRequirements}
                      onChange={e => setPrototypeRequirements(e.target.value)}
                      placeholder="e.g. Clickable Figma, Wireframes"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-25"
                    />
                    <datalist id="ui-proto-options">
                      <option value="Clickable Figma Prototype" />
                      <option value="High-Fidelity Wireframes" />
                      <option value="Component States & Micro-interactions" />
                      <option value="Developer Handoff Tokens & Specs" />
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-26">
                    User Flows & Key Journey Details
                  </label>
                  <textarea
                    rows={2}
                    value={userFlows}
                    onChange={e => setUserFlows(e.target.value)}
                    placeholder="Step-by-step user paths, decision trees, edge cases, error states..."
                    className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-none" id="disciplinetaskmodal-field-26"
                  />
                </div>
              </div>
            )}

            {selectedDiscipline === 'research' && (
              <div className="space-y-3.5 rounded-xl border border-teal-500/20 bg-teal-50/30 dark:bg-teal-950/10 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-27">
                      Research Type
                    </label>
                    <input
                      type="text"
                      list="research-type-options"
                      value={researchType}
                      onChange={e => setResearchType(e.target.value)}
                      placeholder="e.g. Competitive Analysis, User Interviews"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-27"
                    />
                    <datalist id="research-type-options">
                      <option value="Competitive Benchmarking" />
                      <option value="Secondary / Desk Research" />
                      <option value="User Interview Synthesis" />
                      <option value="Market Landscape Analysis" />
                      <option value="Heuristic Usability Audit" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-28">
                      Methodology
                    </label>
                    <input
                      type="text"
                      list="research-method-options"
                      value={methodology}
                      onChange={e => setMethodology(e.target.value)}
                      placeholder="e.g. Qualitative, Quantitative Survey"
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-28"
                    />
                    <datalist id="research-method-options">
                      <option value="Secondary / Desk Research" />
                      <option value="Qualitative User Interviews" />
                      <option value="Competitive Feature Matrix" />
                      <option value="Quantitative Survey Synthesis" />
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-29">
                      Objectives & Hypotheses
                    </label>
                    <textarea
                      rows={2}
                      value={objectives}
                      onChange={e => setObjectives(e.target.value)}
                      placeholder="Primary questions to answer, assumptions to validate..."
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-none" id="disciplinetaskmodal-field-29"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-30">
                      Scope & Target Cohorts
                    </label>
                    <textarea
                      rows={2}
                      value={scope}
                      onChange={e => setScope(e.target.value)}
                      placeholder="Target demographic, competitor list, market geography..."
                      className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none resize-none" id="disciplinetaskmodal-field-30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-white/80 mb-1" htmlFor="disciplinetaskmodal-field-31">
                    Expected Outputs & Artifacts
                  </label>
                  <input
                    type="text"
                    value={expectedOutputs}
                    onChange={e => setExpectedOutputs(e.target.value)}
                    placeholder="e.g. Executive Summary Deck (PDF), Raw Matrix Sheet"
                    className="w-full rounded-xl border border-[var(--border)] bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none" id="disciplinetaskmodal-field-31"
                  />
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              <span className="text-[11px] text-[var(--text-secondary)]">
                Created into <span className="font-semibold text-neutral-800 dark:text-white capitalize">{selectedDiscipline} Pipeline</span> as Unassigned.
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
                  disabled={!title.trim() || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-40"
                >
                  {isSubmitting ? 'Creating...' : 'Create Pipeline Task'}
                </button>
              </div>
            </div>
          </form>
        </DialogPanel>
      </div>
    </AnimatePresence>
  );
};

