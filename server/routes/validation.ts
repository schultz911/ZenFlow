import type { RequestHandler } from 'express';
import type { ClickUpService } from '../clickup';
import type { WorkspaceRepository } from '../store';

export const AVATAR_COLORS = [
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-red-500',
  'from-indigo-500 to-blue-500',
];

export function sanitizeString(input: unknown, maxLen = 1000): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '').slice(0, maxLen);
}

export function validateHttpUrl(input: unknown): { value?: string; error?: string } {
  if (input === undefined || input === null) return { value: undefined };
  if (typeof input !== 'string') return { error: 'Link must be a valid URL string' };
  const trimmed = input.trim();
  if (!trimmed) return { value: undefined };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'URL must start with http:// or https://' };
    }
    return { value: trimmed.slice(0, 1000) };
  } catch {
    return { error: `Invalid URL: ${trimmed}` };
  }
}

export function sanitizeUrlList(raw: unknown): { value?: string[]; error?: string } {
  if (!Array.isArray(raw)) return { value: undefined };
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const checked = validateHttpUrl(item);
    if (checked.error) return { error: checked.error };
    if (checked.value && !seen.has(checked.value)) {
      seen.add(checked.value);
      cleaned.push(checked.value);
    }
  }
  return { value: cleaned.length > 0 ? cleaned : undefined };
}

export function sanitizeDisciplineMetadata(raw: unknown): { value?: Record<string, any>; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: undefined };
  const src = raw as Record<string, unknown>;
  const out: Record<string, any> = {};

  if (typeof src.contentType === 'string' && src.contentType.trim()) {
    out.contentType = sanitizeString(src.contentType, 300);
  }
  if (typeof src.contentSpecifications === 'string' && src.contentSpecifications.trim()) {
    out.contentSpecifications = sanitizeString(src.contentSpecifications, 10000);
  }
  if (src.sourceContentReferences !== undefined) {
    const refs = sanitizeUrlList(src.sourceContentReferences);
    if (refs.error) return { error: `Source Content & References: ${refs.error}` };
    if (refs.value) out.sourceContentReferences = refs.value;
  }

  if (typeof src.assetType === 'string' && src.assetType.trim()) {
    out.assetType = sanitizeString(src.assetType, 300);
  }
  if (typeof src.designSpecifications === 'string' && src.designSpecifications.trim()) {
    out.designSpecifications = sanitizeString(src.designSpecifications, 10000);
  }
  if (src.brandAssetsReferences !== undefined) {
    const refs = sanitizeUrlList(src.brandAssetsReferences);
    if (refs.error) return { error: `Brand Assets & References: ${refs.error}` };
    if (refs.value) out.brandAssetsReferences = refs.value;
  }

  return { value: Object.keys(out).length > 0 ? out : undefined };
}

export interface RouteDeps {
  repo: WorkspaceRepository;
  clickup: ClickUpService;
  broadcastEvent: (type: string, payload: any) => void;
  firestoreLimiter: RequestHandler;
  workspaceWrite: (
    handler: (...args: Parameters<RequestHandler>) => unknown,
    options?: { purge?: boolean }
  ) => RequestHandler;
}
