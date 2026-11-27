import { Task, TaskDisciplineMetadata } from '../types';

export function isValidHttpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function foldLegacyDisciplineMetadata(task?: Task | null): TaskDisciplineMetadata {
  if (!task) return {};
  const raw = (task.disciplineMetadata || {}) as Record<string, any>;
  const attachments = Array.isArray(task.attachments)
    ? task.attachments.filter((a): a is string => typeof a === 'string' && Boolean(a.trim())).map(a => a.trim())
    : [];

  const isDesign = task.team === 'design' || (Boolean(raw.assetType || raw.dimensions || raw.format || raw.quantity) && !raw.contentType);
  if (isDesign) {
    const extra: string[] = [];
    if (typeof raw.dimensions === 'string' && raw.dimensions.trim()) extra.push(`Dimensions: ${raw.dimensions.trim()}`);
    if (typeof raw.format === 'string' && raw.format.trim()) extra.push(`Deliverable Format: ${raw.format.trim()}`);
    if (raw.quantity !== undefined && raw.quantity !== null && String(raw.quantity).trim()) extra.push(`Quantity: ${String(raw.quantity).trim()}`);
    const baseSpec = typeof raw.designSpecifications === 'string' ? raw.designSpecifications.trim() : '';
    const designSpecifications = extra.length > 0 ? (baseSpec ? `${baseSpec}\n\n${extra.join('\n')}` : extra.join('\n')) : (baseSpec || undefined);
    const existingRefs = Array.isArray(raw.brandAssetsReferences) ? raw.brandAssetsReferences : [];
    const brandAssetsReferences = Array.from(new Set([...existingRefs, ...attachments]));
    return {
      assetType: typeof raw.assetType === 'string' ? raw.assetType : undefined,
      designSpecifications,
      brandAssetsReferences: brandAssetsReferences.length > 0 ? brandAssetsReferences : undefined,
    };
  }

  const extra: string[] = [];
  const extraRefs: string[] = [];
  if (typeof raw.deliverable === 'string' && raw.deliverable.trim()) extra.push(`Deliverable Format: ${raw.deliverable.trim()}`);
  if (raw.wordCount !== undefined && raw.wordCount !== null && String(raw.wordCount).trim()) extra.push(`Word Count Target: ${String(raw.wordCount).trim()}`);
  if (typeof raw.relevantRequirements === 'string' && raw.relevantRequirements.trim()) extra.push(raw.relevantRequirements.trim());
  if (typeof raw.brief === 'string' && raw.brief.trim()) {
    const b = raw.brief.trim();
    if (/^https?:\/\/\S+/i.test(b)) extraRefs.push(b);
    else extra.push(`Outline: ${b}`);
  }
  const baseSpec = typeof raw.contentSpecifications === 'string' ? raw.contentSpecifications.trim() : '';
  const contentSpecifications = extra.length > 0 ? (baseSpec ? `${baseSpec}\n\n${extra.join('\n')}` : extra.join('\n')) : (baseSpec || undefined);
  const existingRefs = Array.isArray(raw.sourceContentReferences) ? raw.sourceContentReferences : [];
  const sourceContentReferences = Array.from(new Set([...existingRefs, ...extraRefs, ...attachments]));

  return {
    contentType: typeof raw.contentType === 'string' ? raw.contentType : undefined,
    contentSpecifications,
    sourceContentReferences: sourceContentReferences.length > 0 ? sourceContentReferences : undefined,
  };
}

/** Content or asset type shown on a task card. */
export function getTaskTypeLabel(task: Task): string {
  return task.disciplineMetadata?.contentType || task.disciplineMetadata?.assetType || '';
}
