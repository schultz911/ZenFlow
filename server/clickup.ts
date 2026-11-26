import { createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { ParentTask, Task, User } from '../src/types';
import { formatBillableHours, getTaskAssigneeIds } from '../src/domain/taskTransitions';
import { canEdit, isSuperadmin } from '../src/domain/permissions';
import { decryptSecret } from './crypto';
import { validSignature } from './security';
import type { WorkspaceRepository } from './store';
import type { WebhookRegistry } from './webhooks';

const SAFE_CLICKUP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function sanitizeClickupId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return SAFE_CLICKUP_ID_RE.test(trimmed) ? encodeURIComponent(trimmed) : null;
}

function isValidWebhookEndpoint(raw: string, req: Request): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:') return true;
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && (isLocalHost || parsed.host === req.get('host'))) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface ClickUpTransportResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}

export type ClickUpTransport = (url: string, init?: RequestInit) => Promise<ClickUpTransportResponse>;

export const ZENFLOW_TO_CLICKUP_STATUS: Record<string, string> = {
  pipeline: 'open',
  retainer: 'in progress',
  todo: 'to do',
  in_progress: 'in progress',
  in_review: 'internal review',
  done: 'client review',
  archived: 'complete',
};

const COGNITIVE_LOAD_ESTIMATES_MS: Record<string, number> = {
  low: 12 * 3600 * 1000,
  medium: 24 * 3600 * 1000,
  high: 36 * 3600 * 1000,
};

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const CLICKUP_CACHE_TTL_MS = 120 * 1000;

export function hashClickupDescription(text: unknown): string {
  if (typeof text !== 'string') return '';
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex');
}

export function buildParentClickupMarkdown(brief?: string, brandGuidelines?: string): string {
  const sections: string[] = [];
  if (brief && brief.trim()) {
    sections.push(`**Brief**\n${brief.trim()}`);
  }
  if (brandGuidelines && brandGuidelines.trim()) {
    sections.push(`**Brand Guidelines**\n${brandGuidelines.trim()}`);
  }
  return sections.join('\n\n');
}

export function buildSubtaskClickupMarkdown(
  team?: string,
  metadata?: Record<string, any>,
  contentDocLink?: string
): string {
  const sections: string[] = [];
  const meta = metadata && typeof metadata === 'object' ? metadata : {};

  if (
    team === 'design' ||
    (Boolean(meta.assetType || meta.designSpecifications || meta.brandAssetsReferences) && team !== 'content')
  ) {
    if (meta.assetType) sections.push(`**Asset Type:** ${meta.assetType}`);
    if (meta.designSpecifications) sections.push(`**Design Specifications**\n${meta.designSpecifications}`);
    if (Array.isArray(meta.brandAssetsReferences) && meta.brandAssetsReferences.length > 0) {
      sections.push(
        `**Brand Assets & References**\n${meta.brandAssetsReferences.map((u: string) => `- ${u}`).join('\n')}`
      );
    }
  } else {
    if (meta.contentType) sections.push(`**Content Type:** ${meta.contentType}`);
    if (meta.contentSpecifications) sections.push(`**Content Specifications**\n${meta.contentSpecifications}`);
    if (Array.isArray(meta.sourceContentReferences) && meta.sourceContentReferences.length > 0) {
      sections.push(
        `**Source Content & References**\n${meta.sourceContentReferences.map((u: string) => `- ${u}`).join('\n')}`
      );
    }
  }

  if (contentDocLink && contentDocLink.trim()) {
    sections.push(`**Content Document Link**\n${contentDocLink.trim()}`);
  }
  return sections.join('\n\n');
}

export interface CreateClickUpServiceDeps {
  repo: WorkspaceRepository;
  webhookRegistry: WebhookRegistry;
  broadcastEvent: (type: string, payload: any) => void;
  transport?: ClickUpTransport;
  sanitizeString?: (input: unknown, maxLen?: number) => string;
}

const defaultSanitize = (input: unknown, maxLen = 1000): string =>
  typeof input === 'string' ? input.trim().replace(/[<>]/g, '').slice(0, maxLen) : '';

export function createClickUpService(deps: CreateClickUpServiceDeps) {
  const { repo, webhookRegistry, broadcastEvent } = deps;
  const transport: ClickUpTransport = deps.transport || ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }));
  const sanitize = deps.sanitizeString || defaultSanitize;

  const MAX_CACHE_ENTRIES = 500;
  const teamIdCache = new Map<string, string>();
  const apiCache = new Map<string, { data: any; expiresAt: number }>();

  const tokenCacheKey = (token: string): string =>
    createHash('sha256').update(token).digest('hex').slice(0, 16);

  let registeredWebhookId: string | null = webhookRegistry.latest()?.id || null;
  let activeWebhookEndpoint: string | null = webhookRegistry.latest()?.endpoint || null;
  let webhookRegistrationInFlight: Promise<void> | null = null;
  let totalEventsCount = 0;
  let lastEventAt: string | undefined;
  let lastEventAction: string | undefined;

  const refreshWebhookPointer = () => {
    const latest = webhookRegistry.latest();
    registeredWebhookId = latest?.id || null;
    activeWebhookEndpoint = latest?.endpoint || null;
  };

  const getFromCache = (key: string): any | null => {
    const entry = apiCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      apiCache.delete(key);
      return null;
    }
    return entry.data;
  };

  const setCache = (key: string, data: any, ttlMs: number = CLICKUP_CACHE_TTL_MS) => {
    const now = Date.now();
    if (apiCache.size >= MAX_CACHE_ENTRIES) {
      for (const [k, v] of apiCache.entries()) {
        if (now > v.expiresAt) apiCache.delete(k);
      }
      if (apiCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = apiCache.keys().next().value;
        if (oldestKey !== undefined) apiCache.delete(oldestKey);
      }
    }
    apiCache.set(key, { data, expiresAt: now + ttlMs });
  };

  const invalidateCache = (prefix?: string) => {
    if (!prefix) {
      apiCache.clear();
      return;
    }
    for (const key of apiCache.keys()) {
      if (key.startsWith(prefix)) apiCache.delete(key);
    }
  };

  const resolveToken = (caller?: User): string => decryptSecret(caller?.clickupApiKey);

  const resolveTeamId = async (token: string): Promise<string | null> => {
    const key = tokenCacheKey(token);
    const cached = teamIdCache.get(key);
    if (cached) return cached;
    try {
      const teamRes = await transport(`${CLICKUP_API}/team`, {
        headers: { Authorization: token },
      });
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        const tid = teamData.teams?.[0]?.id ? String(teamData.teams[0].id) : null;
        if (tid) {
          if (teamIdCache.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = teamIdCache.keys().next().value;
            if (oldestKey !== undefined) teamIdCache.delete(oldestKey);
          }
          teamIdCache.set(key, tid);
        }
        return tid;
      }
    } catch (err) {
      console.warn('[ClickUp] Could not resolve team ID:', err);
    }
    return null;
  };

  const postTimeEntry = async (params: {
    clickupTaskId: string;
    durationMs: number;
    taskUser: User;
    callerUserId?: string;
    callerToken: string;
  }): Promise<boolean> => {
    const { clickupTaskId, durationMs, taskUser, callerUserId, callerToken } = params;
    const safeTaskId = sanitizeClickupId(clickupTaskId);
    if (!safeTaskId) return false;
    const timeMs = Math.round(durationMs);
    if (timeMs < 1000) return true;

    const isOwnBoard = !callerUserId || callerUserId === taskUser.id;
    const boardUserToken = isOwnBoard ? callerToken : '';
    const boardUserClickupId = taskUser.clickupUserId ? parseInt(taskUser.clickupUserId, 10) : undefined;

    if (boardUserToken) {
      const teamId = await resolveTeamId(boardUserToken);
      const safeTeamId = teamId ? sanitizeClickupId(teamId) : null;
      if (safeTeamId) {
        try {
          const timeRes = await transport(`${CLICKUP_API}/team/${safeTeamId}/time_entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: boardUserToken },
            body: JSON.stringify({
              tid: clickupTaskId,
              duration: timeMs,
              start: Date.now() - timeMs,
              stop: Date.now(),
              billable: false,
              ...(boardUserClickupId && !isNaN(boardUserClickupId) ? { assignee: boardUserClickupId } : {}),
            }),
          });
          if (timeRes.ok) return true;
        } catch (err) {
          console.warn('[ClickUp Time Sync] Error via board member team time entries:', err);
        }
      }
      try {
        const timeRes = await transport(`${CLICKUP_API}/task/${safeTaskId}/time`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: boardUserToken },
          body: JSON.stringify({ time: timeMs, start: Date.now() - timeMs, end: Date.now() }),
        });
        if (timeRes.ok) return true;
      } catch (err) {
        console.warn('[ClickUp Time Sync] Error via board member task time endpoint:', err);
      }
    }

    if (callerToken && boardUserClickupId && !isNaN(boardUserClickupId)) {
      const teamId = await resolveTeamId(callerToken);
      const safeTeamId = teamId ? sanitizeClickupId(teamId) : null;
      if (safeTeamId) {
        try {
          const timeRes = await transport(`${CLICKUP_API}/team/${safeTeamId}/time_entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: callerToken },
            body: JSON.stringify({
              tid: clickupTaskId,
              duration: timeMs,
              start: Date.now() - timeMs,
              stop: Date.now(),
              billable: false,
              assignee: boardUserClickupId,
            }),
          });
          if (timeRes.ok) return true;
        } catch (err) {
          console.warn('[ClickUp Time Sync] Exception posting time:', err);
        }
      }
    }

    if (isOwnBoard && callerToken) {
      try {
        const timeRes = await transport(`${CLICKUP_API}/task/${clickupTaskId}/time`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: callerToken },
          body: JSON.stringify({ time: timeMs, start: Date.now() - timeMs, end: Date.now() }),
        });
        if (timeRes.ok) return true;
      } catch (err) {
        console.warn('[ClickUp Time Sync] Error posting time for own board:', err);
      }
    }
    return false;
  };

  const pushSafeDescription = async (params: {
    clickupId: string;
    desiredMarkdown: string;
    lastSyncedHash?: string;
    fallbackLegacyDesc?: string;
    token: string;
    commentHeader: string;
    initialLiveDesc?: string;
    skipConflictComment?: boolean;
  }): Promise<{ hash?: string; synced: boolean }> => {
    const {
      clickupId,
      desiredMarkdown,
      lastSyncedHash,
      fallbackLegacyDesc,
      token,
      commentHeader,
      initialLiveDesc,
      skipConflictComment,
    } = params;
    const safeId = sanitizeClickupId(clickupId);
    if (!safeId || !token) return { hash: lastSyncedHash, synced: false };

    let liveDesc = initialLiveDesc;
    if (liveDesc === undefined) {
      try {
        const getRes = await transport(`${CLICKUP_API}/task/${safeId}`, {
          headers: { Authorization: token },
        });
        if (getRes.ok) {
          const data = await getRes.json();
          liveDesc = typeof data?.description === 'string' ? data.description : '';
        }
      } catch (err) {
        console.warn(`[ClickUp Desc Sync] Failed reading ClickUp task ${clickupId}:`, err);
      }
    }

    if (liveDesc === undefined) {
      return { hash: lastSyncedHash, synced: false };
    }

    const liveHash = hashClickupDescription(liveDesc);
    const desiredHash = hashClickupDescription(desiredMarkdown);
    if (liveHash === desiredHash) {
      return { hash: desiredHash, synced: true };
    }

    const fallbackHash = fallbackLegacyDesc ? hashClickupDescription(fallbackLegacyDesc) : '';
    const isSafeToOverwrite =
      !liveDesc.trim() ||
      (Boolean(lastSyncedHash) && liveHash === lastSyncedHash) ||
      (Boolean(fallbackHash) && liveHash === fallbackHash);

    if (isSafeToOverwrite) {
      try {
        const putRes = await transport(`${CLICKUP_API}/task/${safeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ description: desiredMarkdown }),
        });
        if (putRes.ok) {
          return { hash: desiredHash, synced: true };
        }
      } catch (err) {
        console.warn(`[ClickUp Desc Sync] Failed updating ClickUp description on ${clickupId}:`, err);
      }
      return { hash: lastSyncedHash, synced: false };
    }

    if (!skipConflictComment && desiredMarkdown.trim()) {
      try {
        const comment = await transport(`${CLICKUP_API}/task/${safeId}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({
            comment_text: `[${commentHeader}]\n\n${desiredMarkdown}`,
            notify_all: false,
          }),
        });
        return { hash: lastSyncedHash, synced: comment.ok };
      } catch (err) {
        console.warn(`[ClickUp Desc Sync] Failed posting conflict comment on ${clickupId}:`, err);
        return { hash: lastSyncedHash, synced: false };
      }
    }
    return { hash: lastSyncedHash, synced: true };
  };

  const syncParentDescriptionToClickUp = async (parentTask: ParentTask, token: string): Promise<void> => {
    if (!parentTask.clickupParentTaskId || !token) return;
    const desiredMarkdown = buildParentClickupMarkdown(parentTask.brief, parentTask.brandGuidelines);
    const result = await pushSafeDescription({
      clickupId: parentTask.clickupParentTaskId,
      desiredMarkdown,
      lastSyncedHash: parentTask.lastSyncedClickupDescHash,
      fallbackLegacyDesc: parentTask.brief,
      token,
      commentHeader: 'ZenFlow Brief / Brand Guidelines Update (manual ClickUp edits preserved)',
    });
    if (result.hash && result.hash !== parentTask.lastSyncedClickupDescHash) {
      parentTask.lastSyncedClickupDescHash = result.hash;
      parentTask.updatedAt = new Date().toISOString();
      repo.saveLocal();
      await repo.saveParentTask(parentTask).catch(e => console.error('Firestore parent hash err:', e));
    }
  };

  const syncContentLinkToClickUp = async (task: Task, link: string, explicitToken?: string): Promise<void> => {
    const clickupId = task.clickupTaskId;
    if (!clickupId || !link) return;
    const token = explicitToken;
    if (!token) return;

    try {
      const desiredSubMarkdown = buildSubtaskClickupMarkdown(task.team, task.disciplineMetadata as any, link);
      if (desiredSubMarkdown) {
        const result = await pushSafeDescription({
          clickupId,
          desiredMarkdown: desiredSubMarkdown,
          lastSyncedHash: task.lastSyncedClickupDescHash,
          token,
          commentHeader: 'ZenFlow Subtask Specifications & Content Doc Update',
          skipConflictComment: true,
        });
        if (result.hash && result.hash !== task.lastSyncedClickupDescHash) {
          task.lastSyncedClickupDescHash = result.hash;
          task.updatedAt = new Date().toISOString();
          repo.saveLocal();
          await repo.saveTask(task).catch(e => console.error('Firestore task hash err:', e));
        }
      }

      await transport(`${CLICKUP_API}/task/${clickupId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          comment_text: `Content Deliverable Document: ${link}`,
          notify_all: false,
        }),
      });
    } catch (err) {
      console.warn('[ClickUp Sync] Failed to sync content doc link:', err);
    }
  };

  const syncTaskToClickUp = async (
    task: Task,
    explicitToken?: string,
    userOverride?: User,
    callerUserId?: string,
    includeSpecsSync?: boolean
  ): Promise<boolean> => {
    const store = repo.getStore();
    const assignees = getTaskAssigneeIds(task);
    const assignedUsers = assignees
      .map(uid => store.users.find(u => u.id === uid))
      .filter((u): u is User => Boolean(u));
    const taskUser = userOverride || assignedUsers[0] || store.users.find(u => u.id === task.userId);
    const token = explicitToken;
    if (!token) return false;

    const clickupAssigneeIds = assignedUsers
      .map(u => (u.clickupUserId ? parseInt(u.clickupUserId, 10) : NaN))
      .filter(id => !isNaN(id));

    const clickupStatus = ZENFLOW_TO_CLICKUP_STATUS[task.status] || 'to do';
    const timeEstimateMs = task.estimatedHours !== undefined && Number.isFinite(task.estimatedHours)
      ? Math.round(task.estimatedHours * 3600 * 1000)
      : COGNITIVE_LOAD_ESTIMATES_MS[task.cognitiveLoad] || 24 * 3600 * 1000;

    const safeTaskId = task.clickupTaskId ? sanitizeClickupId(task.clickupTaskId) : null;
    if (safeTaskId) {
      try {
        const updatePayload: any = {
          name: task.title,
          status: clickupStatus,
          time_estimate: timeEstimateMs,
        };
        if (task.dueDate) {
          updatePayload.due_date = new Date(task.dueDate + 'T23:59:59').getTime();
        }
        const res = await transport(`${CLICKUP_API}/task/${safeTaskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify(updatePayload),
        });

        if (!res.ok) return false;
        let liveDesc: string | undefined;
        if (res.ok) {
          try {
            const putData = await res.json();
            if (typeof putData?.description === 'string') {
              liveDesc = putData.description;
            }
          } catch {
            // ignore
          }
        }

        if (clickupAssigneeIds.length > 0) {
          const assigneeResponse = await transport(`${CLICKUP_API}/task/${safeTaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({
              assignees: { add: clickupAssigneeIds, rem: [] },
            }),
          });
          if (!assigneeResponse.ok) return false;
        }

        const hasParentSpecs = Boolean(task.parentTaskId);
        const subMarkdown = buildSubtaskClickupMarkdown(task.team, task.disciplineMetadata as any, task.contentDocLink);
        if (includeSpecsSync || (subMarkdown && !task.lastSyncedClickupDescHash)) {
          const desiredDesc = hasParentSpecs
            ? subMarkdown
            : [buildParentClickupMarkdown(task.description, task.brandGuidelines), subMarkdown].filter(Boolean).join('\n\n');
          if (desiredDesc) {
            const descResult = await pushSafeDescription({
              clickupId: task.clickupTaskId,
              desiredMarkdown: desiredDesc,
              lastSyncedHash: task.lastSyncedClickupDescHash,
              fallbackLegacyDesc: task.description,
              token,
              commentHeader: 'ZenFlow Specifications Update (manual ClickUp edits preserved)',
              initialLiveDesc: liveDesc,
            });
            if (!descResult.synced) return false;
            if (descResult.hash && descResult.hash !== task.lastSyncedClickupDescHash) {
              task.lastSyncedClickupDescHash = descResult.hash;
              task.updatedAt = new Date().toISOString();
              repo.saveLocal();
              await repo.saveTask(task);
            }
          }
        }

        if (task.inProgressDurationMs && task.inProgressDurationMs >= 1000) {
          const trackedMs = Math.round(task.inProgressDurationMs);
          const taskWithSync = task as Task & { lastSyncedClickupTimeMs?: number };
          const alreadySyncedMs = taskWithSync.lastSyncedClickupTimeMs || 0;
          const deltaMs = trackedMs - alreadySyncedMs;
          if (deltaMs >= 1000 && taskUser) {
            const timePosted = await postTimeEntry({
              clickupTaskId: task.clickupTaskId,
              durationMs: deltaMs,
              taskUser,
              callerUserId,
              callerToken: token,
            });
            if (!timePosted) return false;
            taskWithSync.lastSyncedClickupTimeMs = trackedMs;
            repo.saveLocal();
            await repo.saveTask(task);
          }
        }
      } catch (err) {
        console.warn('[ClickUp Auto-Sync] Update error:', err);
        return false;
      }
      return true;
    }

    // Create task in ClickUp
    let targetListId = task.clickupListId ? sanitizeClickupId(task.clickupListId) : null;
    const safeSpaceId = taskUser?.selectedClickupSpaceId ? sanitizeClickupId(taskUser.selectedClickupSpaceId) : null;
    if (!targetListId && safeSpaceId) {
      try {
        const listRes = await transport(`${CLICKUP_API}/space/${safeSpaceId}/list?archived=false`, {
          headers: { Authorization: token },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.lists?.length > 0) {
            targetListId = sanitizeClickupId(String(listData.lists[0].id));
          }
        }
        if (!targetListId) {
          const folderRes = await transport(`${CLICKUP_API}/space/${safeSpaceId}/folder?archived=false`, {
            headers: { Authorization: token },
          });
          if (folderRes.ok) {
            const folderData = await folderRes.json();
            for (const f of folderData.folders || []) {
              if (f.lists?.length > 0) {
                targetListId = sanitizeClickupId(String(f.lists[0].id));
                break;
              }
            }
          }
        }
      } catch {
        // ignore lookup errors
      }
    }

    if (!targetListId || task.clickupCreationPending) return false;

    try {
      const hasParentSpecs = Boolean(task.parentTaskId);
      const subMarkdown = buildSubtaskClickupMarkdown(task.team, task.disciplineMetadata as any, task.contentDocLink);
      const initialDesc = hasParentSpecs
        ? subMarkdown
        : [buildParentClickupMarkdown(task.description, task.brandGuidelines), subMarkdown].filter(Boolean).join('\n\n');

      const createPayload: any = {
        name: task.title,
        description: initialDesc || '',
        status: clickupStatus,
        time_estimate: timeEstimateMs,
      };
      if (task.clickupParentTaskId) {
        createPayload.parent = task.clickupParentTaskId;
      }
      if (clickupAssigneeIds.length > 0) {
        createPayload.assignees = clickupAssigneeIds;
      }
      if (task.dueDate) {
        createPayload.due_date = new Date(task.dueDate + 'T23:59:59').getTime();
      }
      if (task.clickupTaskTypeFieldId && task.clickupTaskTypeId) {
        createPayload.custom_fields = [{ id: task.clickupTaskTypeFieldId, value: task.clickupTaskTypeId }];
      }

      const cRes = await transport(`${CLICKUP_API}/list/${targetListId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(createPayload),
      });

      if (cRes.ok) {
        const cData = await cRes.json();
        if (!sanitizeClickupId(cData.id)) return false;
        task.clickupTaskId = cData.id;
        task.clickupUrl = cData.url;
        task.clickupListId = targetListId;
        if (initialDesc) {
          task.lastSyncedClickupDescHash =
            typeof cData.description === 'string'
              ? hashClickupDescription(cData.description) || hashClickupDescription(initialDesc)
              : hashClickupDescription(initialDesc);
        }
        repo.saveLocal();
        await repo.saveTask(task);
        broadcastEvent('task_updated', task);

        if (task.inProgressDurationMs && task.inProgressDurationMs >= 1000 && taskUser) {
          const trackedMs = Math.round(task.inProgressDurationMs);
          const timePosted = await postTimeEntry({
            clickupTaskId: cData.id,
            durationMs: trackedMs,
            taskUser,
            callerUserId,
            callerToken: token,
          });
          if (!timePosted) return false;
          (task as Task & { lastSyncedClickupTimeMs?: number }).lastSyncedClickupTimeMs = trackedMs;
          repo.saveLocal();
          await repo.saveTask(task);
        }
      }
      return cRes.ok;
    } catch (err) {
      console.warn('[ClickUp Auto-Sync] Creation error:', err);
      return false;
    }
  };

  const createRemoteParentTask = async (params: {
    token: string;
    listId: string;
    title: string;
    markdown: string;
    dueDate?: string;
    taskTypeFieldId?: string;
    taskTypeId?: string;
  }): Promise<{ clickupParentTaskId?: string; clickupUrl?: string; descHash?: string; uncertain?: boolean }> => {
    const { token, listId, title, markdown, dueDate, taskTypeFieldId, taskTypeId } = params;
    const safeListId = sanitizeClickupId(listId);
    if (!token || !safeListId) return {};
    try {
      const parentPayload: Record<string, any> = {
        name: title,
        status: ZENFLOW_TO_CLICKUP_STATUS.pipeline || 'open',
      };
      if (markdown) parentPayload.description = markdown;
      if (dueDate) parentPayload.due_date = new Date(dueDate + 'T23:59:59').getTime();
      if (taskTypeFieldId && taskTypeId) {
        parentPayload.custom_fields = [{ id: taskTypeFieldId, value: taskTypeId }];
      }
      const pRes = await transport(`${CLICKUP_API}/list/${safeListId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(parentPayload),
      });
      if (pRes.ok) {
        const pData = await pRes.json();
        if (!sanitizeClickupId(pData.id)) return { uncertain: true };
        const descHash = markdown
          ? typeof pData.description === 'string'
            ? hashClickupDescription(pData.description) || hashClickupDescription(markdown)
            : hashClickupDescription(markdown)
          : undefined;
        return {
          clickupParentTaskId: pData.id,
          clickupUrl: pData.url,
          descHash,
        };
      }
      console.warn('[ClickUp Bundle] Failed to create parent task:', pRes.status);
      return { uncertain: pRes.status >= 500 || pRes.status === 408 };
    } catch (err) {
      console.warn('[ClickUp Bundle] Parent task error:', err);
      return { uncertain: true };
    }
  };

  const createRemoteSubtask = async (params: {
    token: string;
    listId: string;
    title: string;
    discLabel: string;
    clickupParentTaskId?: string;
    parentClickupUrl?: string;
    markdown: string;
    dueDate?: string;
    taskTypeFieldId?: string;
    taskTypeId?: string;
  }): Promise<{ clickupTaskId?: string; clickupUrl?: string; descHash?: string; uncertain?: boolean }> => {
    const {
      token,
      listId,
      title,
      discLabel,
      clickupParentTaskId,
      parentClickupUrl,
      markdown,
      dueDate,
      taskTypeFieldId,
      taskTypeId,
    } = params;
    const safeListId = sanitizeClickupId(listId);
    if (!token || !safeListId) return { clickupUrl: parentClickupUrl };
    try {
      const subPayload: Record<string, any> = {
        name: `${title} (${discLabel})`,
        status: ZENFLOW_TO_CLICKUP_STATUS.pipeline || 'open',
      };
      if (clickupParentTaskId) subPayload.parent = clickupParentTaskId;
      if (markdown) subPayload.description = markdown;
      if (dueDate) subPayload.due_date = new Date(dueDate + 'T23:59:59').getTime();
      if (taskTypeFieldId && taskTypeId) {
        subPayload.custom_fields = [{ id: taskTypeFieldId, value: taskTypeId }];
      }
      const sRes = await transport(`${CLICKUP_API}/list/${safeListId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(subPayload),
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        if (!sanitizeClickupId(sData.id)) return { uncertain: true };
        const descHash = markdown
          ? typeof sData.description === 'string'
            ? hashClickupDescription(sData.description) || hashClickupDescription(markdown)
            : hashClickupDescription(markdown)
          : undefined;
        return {
          clickupTaskId: sData.id,
          clickupUrl: sData.url || parentClickupUrl,
          descHash,
        };
      }
      console.warn(`[ClickUp Bundle] Failed to create ${discLabel} subtask:`, sRes.status);
      return { uncertain: sRes.status >= 500 || sRes.status === 408 };
    } catch (err) {
      console.warn(`[ClickUp Bundle] ${discLabel} subtask error:`, err);
      return { uncertain: true };
    }
  };

  const processWebhookEvent = async (params: {
    taskId: string;
    eventType: string;
    historyItems: any[];
    rawBody: any;
    ip?: string;
  }): Promise<void> => {
    const { taskId, eventType, historyItems, rawBody, ip } = params;
    totalEventsCount += 1;
    lastEventAt = new Date().toISOString();
    lastEventAction = eventType;
    if (!taskId) {
      repo.appendAuditLog({
        category: 'webhook',
        action: 'clickup_webhook_ping',
        actor: { ip },
        targetId: 'workspace',
        targetType: 'webhook',
        details: `ClickUp webhook event received without task_id: ${eventType}`,
        metadata: { eventType, rawBody },
      });
      return;
    }

    const store = repo.getStore();
    const matchingTasks = store.tasks.filter(t => t.clickupTaskId === taskId);
    if (matchingTasks.length === 0) return;

    const existingTask = matchingTasks[0];
    if (eventType === 'taskDeleted') {
      repo.appendAuditLog({
        category: 'webhook',
        action: 'clickup_task_deleted_preserved',
        actor: { ip },
        targetId: existingTask.id,
        targetType: 'task',
        details: `ClickUp deleted task "${existingTask.title}" (${taskId}), preserved in ZenFlow.`,
        metadata: { clickupTaskId: taskId },
      });
      return;
    }

    let clickupTaskData: any = null;
    const assignees = getTaskAssigneeIds(existingTask);
    const assignedUser = assignees[0] ? store.users.find(u => u.id === assignees[0]) : undefined;
    const token = resolveToken(assignedUser);

    if (token) {
      const safeTaskId = sanitizeClickupId(taskId);
      if (safeTaskId) {
        try {
          const cRes = await transport(`${CLICKUP_API}/task/${safeTaskId}`, {
            headers: { Authorization: token },
          });
          if (cRes.ok) clickupTaskData = await cRes.json();
        } catch (e) {
          console.warn(`[ClickUp Webhook] Could not fetch ClickUp task ${taskId}:`, e);
        }
      }
    }

    let hasDivergence = false;
    let divergenceReason = '';

    const expectedClickupStatus = ZENFLOW_TO_CLICKUP_STATUS[existingTask.status] || 'to do';
    let cuStatusRaw: string | null = null;
    const statusItem = historyItems.find((h: any) => h.field === 'status');
    if (statusItem?.after) {
      cuStatusRaw =
        typeof statusItem.after === 'string'
          ? statusItem.after.toLowerCase().trim()
          : (statusItem.after?.status || '').toLowerCase().trim();
    } else if (clickupTaskData?.status?.status) {
      cuStatusRaw = (clickupTaskData.status.status || '').toLowerCase().trim();
    }
    if (cuStatusRaw && cuStatusRaw !== expectedClickupStatus.toLowerCase()) {
      hasDivergence = true;
      divergenceReason = `Status on ClickUp ("${cuStatusRaw}") differs from ZenFlow ("${existingTask.status}")`;
    }

    const expectedClickupIds = new Set(
      assignees.map(id => store.users.find(u => u.id === id)?.clickupUserId).filter((v): v is string => Boolean(v))
    );
    let cuAssigneeId: string | null = null;
    const assigneeItem = historyItems.find((h: any) => h.field === 'assignee');
    if (assigneeItem?.after) {
      cuAssigneeId =
        typeof assigneeItem.after === 'object'
          ? assigneeItem.after.id
            ? String(assigneeItem.after.id)
            : null
          : String(assigneeItem.after);
    } else if (clickupTaskData?.assignees?.[0]) {
      cuAssigneeId = String(clickupTaskData.assignees[0].id);
    }
    if (expectedClickupIds.size > 0 && cuAssigneeId && !expectedClickupIds.has(cuAssigneeId)) {
      hasDivergence = true;
      divergenceReason = `Assignee on ClickUp (${cuAssigneeId}) differs from ZenFlow assignees`;
    }

    if (existingTask.dueDate && clickupTaskData?.due_date !== undefined) {
      const expectedDueMs = new Date(existingTask.dueDate + 'T23:59:59').getTime();
      const actualDueMs = Number(clickupTaskData.due_date);
      if (!isNaN(actualDueMs) && Math.abs(expectedDueMs - actualDueMs) > 86400000) {
        hasDivergence = true;
        divergenceReason = `Due date on ClickUp differs from ZenFlow (${existingTask.dueDate})`;
      }
    }

    if (hasDivergence && token) {
      await syncTaskToClickUp(existingTask, token, assignedUser).catch(e =>
        console.error('[ClickUp Webhook] Error pushing authoritative state to ClickUp:', e)
      );
      repo.appendAuditLog({
        category: 'webhook',
        action: 'zenflow_source_of_truth_asserted',
        actor: { ip },
        targetId: existingTask.id,
        targetType: 'task',
        details: `ClickUp diverged from ZenFlow (${divergenceReason}). ZenFlow authoritative state pushed to ClickUp.`,
        metadata: { clickupTaskId: taskId, divergenceReason },
      });
      return;
    }

    const timeItem = historyItems.find((h: any) => h.field === 'time_spent' || h.field === 'time_tracked');
    if (timeItem?.after !== undefined) {
      const parsedMs = Number(timeItem.after);
      if (!isNaN(parsedMs) && parsedMs > (existingTask.inProgressDurationMs || 0)) {
        existingTask.inProgressDurationMs = parsedMs;
        (existingTask as Task & { lastSyncedClickupTimeMs?: number }).lastSyncedClickupTimeMs = parsedMs;
        existingTask.updatedAt = new Date().toISOString();
        const activityEntries = Array.isArray(existingTask.activityLog) ? [...existingTask.activityLog] : [];
        activityEntries.unshift({
          id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          action: 'billable_adjusted',
          details: `Tracked duration synced to ${formatBillableHours(parsedMs)} from ClickUp`,
        });
        existingTask.activityLog = activityEntries.slice(0, 15);
        repo.saveLocal();
        await repo.saveTask(existingTask).catch(e => console.error('Firestore save err:', e));
        broadcastEvent('task_updated', existingTask);
      }
    }
  };

  const registerRoutes = (app: Express) => {
    refreshWebhookPointer();

    app.post('/api/clickup/verify', async (req: Request, res: Response) => {
      const token = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
      if (!token) return res.status(400).json({ error: 'API key is required' });
      try {
        const userRes = await transport(`${CLICKUP_API}/user`, { headers: { Authorization: token } });
        if (!userRes.ok) {
          return res.status(401).json({ valid: false, error: 'Invalid ClickUp API token' });
        }
        const userData = await userRes.json();
        return res.json({ valid: true, user: userData.user });
      } catch (err: any) {
        return res.status(502).json({ valid: false, error: err?.message || 'ClickUp verification failed' });
      }
    });

    app.get('/api/clickup/spaces', async (_req: Request, res: Response) => {
      const token = resolveToken(res.locals.caller);
      if (!token) return res.status(400).json({ error: 'ClickUp API token not configured' });

      const cacheKey = `spaces:${tokenCacheKey(token)}`;
      const cached = getFromCache(cacheKey);
      if (cached) return res.json(cached);

      try {
        const teamId = await resolveTeamId(token);
        if (!teamId) return res.status(404).json({ error: 'No ClickUp workspace team found' });

        const spacesRes = await transport(`${CLICKUP_API}/team/${teamId}/space?archived=false`, {
          headers: { Authorization: token },
        });
        if (!spacesRes.ok) return res.status(spacesRes.status).json({ error: 'Failed to load ClickUp spaces' });
        const data = await spacesRes.json();
        const payload = { spaces: data.spaces || [] };
        setCache(cacheKey, payload);
        return res.json(payload);
      } catch (err: any) {
        return res.status(502).json({ error: err?.message || 'Failed fetching spaces' });
      }
    });

    app.post('/api/clickup/spaces', async (req: Request, res: Response) => {
      const caller = res.locals.caller as User | undefined;
      const token = resolveToken(caller);
      const spaceName = sanitize(req.body?.name);
      if (!token || !spaceName) {
        return res.status(400).json({ error: 'ClickUp token and space name are required' });
      }
      try {
        const teamId = await resolveTeamId(token);
        if (!teamId) return res.status(404).json({ error: 'No ClickUp workspace team found' });

        const createRes = await transport(`${CLICKUP_API}/team/${teamId}/space`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({
            name: spaceName,
            multiple_assignees: true,
            features: { due_dates: { enabled: true }, time_tracking: { enabled: true }, time_estimates: { enabled: true } },
          }),
        });
        if (!createRes.ok) return res.status(createRes.status).json({ error: 'Failed to create ClickUp space' });
        const space = await createRes.json();
        invalidateCache('spaces:');
        return res.json({ space });
      } catch (err: any) {
        return res.status(502).json({ error: err?.message || 'Failed creating space' });
      }
    });

    app.get('/api/clickup/members', async (_req: Request, res: Response) => {
      const token = resolveToken(res.locals.caller);
      if (!token) return res.status(400).json({ error: 'ClickUp API token not configured' });

      const cacheKey = `members:${tokenCacheKey(token)}`;
      const cached = getFromCache(cacheKey);
      if (cached) return res.json(cached);

      try {
        const teamRes = await transport(`${CLICKUP_API}/team`, { headers: { Authorization: token } });
        if (!teamRes.ok) return res.status(teamRes.status).json({ error: 'Failed to fetch workspace members' });
        const data = await teamRes.json();
        const membersMap = new Map<string, any>();
        for (const t of data.teams || []) {
          for (const m of t.members || []) {
            const u = m.user;
            if (u?.id) {
              membersMap.set(String(u.id), {
                id: String(u.id),
                username: u.username || u.email || String(u.id),
                email: u.email,
                initials: u.initials,
                color: u.color,
              });
            }
          }
        }
        const payload = { members: Array.from(membersMap.values()) };
        setCache(cacheKey, payload);
        return res.json(payload);
      } catch (err: any) {
        return res.status(502).json({ error: err?.message || 'Failed fetching members' });
      }
    });

    app.get('/api/clickup/folders-and-lists', async (req: Request, res: Response) => {
      const token = resolveToken(res.locals.caller);
      const safeSpaceId = sanitizeClickupId(sanitize(req.query.spaceId));
      if (!token || !safeSpaceId) return res.status(400).json({ error: 'Valid spaceId and ClickUp token are required' });

      const cacheKey = `folders:${safeSpaceId}:${tokenCacheKey(token)}`;
      const cached = getFromCache(cacheKey);
      if (cached) return res.json(cached);

      try {
        const [fRes, lRes] = await Promise.all([
          transport(`${CLICKUP_API}/space/${safeSpaceId}/folder?archived=false`, { headers: { Authorization: token } }),
          transport(`${CLICKUP_API}/space/${safeSpaceId}/list?archived=false`, { headers: { Authorization: token } }),
        ]);
        const fData = fRes.ok ? await fRes.json() : { folders: [] };
        const lData = lRes.ok ? await lRes.json() : { lists: [] };
        const payload = { folders: fData.folders || [], folderlessLists: lData.lists || [] };
        setCache(cacheKey, payload);
        return res.json(payload);
      } catch (err: any) {
        return res.status(502).json({ error: err?.message || 'Failed loading folders and lists' });
      }
    });

    app.get('/api/clickup/custom-fields', async (req: Request, res: Response) => {
      const token = resolveToken(res.locals.caller);
      const rawListId = sanitize(req.query.listId);
      const safeListId = rawListId ? sanitizeClickupId(rawListId) : null;
      if (rawListId && !safeListId) return res.status(400).json({ error: 'Invalid listId format' });
      if (!token) return res.status(400).json({ error: 'ClickUp API token required' });

      const cacheKey = `custom-fields:${safeListId || 'team'}:${tokenCacheKey(token)}`;
      const cached = getFromCache(cacheKey);
      if (cached) return res.json(cached);

      try {
        let taskTypeField: any = null;
        let options: any[] = [];
        if (safeListId) {
          const fRes = await transport(`${CLICKUP_API}/list/${safeListId}/field`, { headers: { Authorization: token } });
          if (fRes.ok) {
            const data = await fRes.json();
            const match = (data.fields || []).find((f: any) => /task\s*type/i.test(f.name || ''));
            if (match) {
              taskTypeField = { id: match.id, name: match.name };
              options = (match.type_config?.options || []).map((o: any) => ({
                id: String(o.id),
                name: o.name || o.label || String(o.id),
                color: o.color,
              }));
            }
          }
        }
        const payload = { taskTypeField, options };
        setCache(cacheKey, payload);
        return res.json(payload);
      } catch (err: any) {
        return res.status(502).json({ error: err?.message || 'Failed fetching custom fields' });
      }
    });

    app.post('/api/clickup/lists', async (req: Request, res: Response) => {
      const caller = res.locals.caller as User | undefined;
      const token = resolveToken(caller);
      const name = sanitize(req.body?.name);
      const rawSpaceId = sanitize(req.body?.spaceId);
      const rawFolderId = sanitize(req.body?.folderId);
      const safeSpaceId = rawSpaceId ? sanitizeClickupId(rawSpaceId) : null;
      const safeFolderId = rawFolderId ? sanitizeClickupId(rawFolderId) : null;
      if (!token || !name || (!safeSpaceId && !safeFolderId)) {
        return res.status(400).json({ error: 'Valid name and spaceId/folderId are required' });
      }

      const url = safeFolderId ? `${CLICKUP_API}/folder/${safeFolderId}/list` : `${CLICKUP_API}/space/${safeSpaceId}/list`;
      try {
        const createRes = await transport(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ name }),
        });
        if (!createRes.ok) return res.status(createRes.status).json({ error: 'Failed to create ClickUp list' });
        const list = await createRes.json();
        if (safeSpaceId) invalidateCache(`folders:${safeSpaceId}`);
        return res.json({ list });
      } catch (err: any) {
        return res.status(502).json({ error: err?.message || 'Failed creating list' });
      }
    });

    app.post('/api/clickup/sync-user-tasks', async (req: Request, res: Response) => {
      const { userId } = req.body || {};
      const store = repo.getStore();
      const targetUser = store.users.find(u => u.id === userId);
      if (!targetUser) return res.status(404).json({ error: 'User not found' });

      const caller = res.locals.caller;
      const token = resolveToken(caller);
      if (!token) return res.status(400).json({ error: 'ClickUp API token not configured' });

      const userTasks = store.tasks.filter(t => getTaskAssigneeIds(t).includes(targetUser.id));
      const results: Array<{ taskId: string; synced: boolean }> = [];
      for (const task of userTasks) {
        const synced = await repo.runMutation(async () => {
          const currentCaller = repo.getUsers().find(user => user.id === caller.id && user.email === caller.email);
          const currentTarget = repo.getUsers().find(user => user.id === userId);
          if (repo.purgeNeedsRetry() || !currentCaller || !currentTarget ||
              res.locals.identityExpiresAt <= Date.now() ||
              (currentCaller.id !== currentTarget.id && !canEdit(currentCaller, currentTarget))) return false;
          const currentTask = repo.getTasks().find(item => item.id === task.id);
          if (!currentTask || !getTaskAssigneeIds(currentTask).includes(userId)) return false;
          return syncTaskToClickUp(currentTask, resolveToken(currentCaller), currentTarget, currentCaller.id);
        });
        results.push({ taskId: task.id, synced });
      }
      const syncedCount = results.filter(result => result.synced).length;
      const failedCount = results.length - syncedCount;

      return res.json({
        success: failedCount === 0,
        syncedCount,
        failedCount,
        results,
        archivedCount: 0,
        message: failedCount > 0
          ? `Sent ${syncedCount} of ${results.length} tasks to ClickUp. ${failedCount} failed. Retry to finish syncing.`
          : `Sent ${syncedCount} task(s) to ClickUp.`,
      });
    });

    app.post('/api/clickup/webhook', (req: Request, res: Response) => {
      const signature = req.headers['x-signature'] as string | undefined;
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      const body = req.body || {};
      const savedWebhook = webhookRegistry.get(body.webhook_id) || webhookRegistry.latest();
      if (!savedWebhook?.secret || !rawBody || !validSignature(rawBody, signature, savedWebhook.secret)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      const taskId = body.task_id ? String(body.task_id) : '';
      const eventType = String(body.event || 'unknown');
      const historyItems = Array.isArray(body.history_items) ? body.history_items : [];

      res.json({ ok: true });
      void repo.runMutation(() => {
        if (repo.purgeNeedsRetry()) return;
        return processWebhookEvent({ taskId, eventType, historyItems, rawBody: body, ip: req.ip });
      }).catch(err => console.error('[ClickUp Webhook] Unhandled processing error:', err));
    });

    app.post('/api/clickup/webhook/register', async (req: Request, res: Response) => {
      while (webhookRegistrationInFlight) {
        await webhookRegistrationInFlight.catch(() => {});
      }

      const existingWebhook = webhookRegistry.latest();
      const callerIsSuperadmin = isSuperadmin(res.locals.caller);
      if (existingWebhook?.id && !callerIsSuperadmin) {
        return res.status(403).json({ error: 'ClickUp webhook already registered; only Superadmin can replace it' });
      }
      const token = resolveToken(res.locals.caller);
      if (!token) return res.status(400).json({ error: 'ClickUp API token required' });

      const defaultEndpoint = `${req.protocol}://${req.get('host')}/api/clickup/webhook`;
      const requestedEndpoint = sanitize(req.body?.endpoint);
      const endpoint = callerIsSuperadmin && requestedEndpoint ? requestedEndpoint : defaultEndpoint;
      if (!isValidWebhookEndpoint(endpoint, req)) {
        return res.status(400).json({ error: 'Webhook endpoint must be a valid https:// URL' });
      }

      let outcomeStatus = 502;
      let outcomeBody: Record<string, any> = { error: 'Failed registering webhook' };

      const run = (async () => {
        const teamId = await resolveTeamId(token);
        if (!teamId) {
          outcomeStatus = 404;
          outcomeBody = { error: 'No ClickUp workspace team found' };
          return;
        }

        try {
          const createRes = await transport(`${CLICKUP_API}/team/${teamId}/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({
              endpoint,
              events: [
                'taskStatusUpdated',
                'taskAssigneeUpdated',
                'taskDueDateUpdated',
                'taskTimeTrackedUpdated',
                'taskDeleted',
              ],
            }),
          });
          if (!createRes.ok) {
            outcomeStatus = createRes.status;
            outcomeBody = { error: 'Failed to register ClickUp webhook' };
            return;
          }
          const data = await createRes.json();
          const webhook = data.webhook || data;
          const reg = {
            id: String(webhook.id || `wh-${Date.now()}`),
            endpoint,
            secret: String(webhook.secret || ''),
          };
          await webhookRegistry.save(reg, repo.getWebhookDb());
          refreshWebhookPointer();

          repo.appendAuditLog({
            category: 'webhook',
            action: 'clickup_webhook_registered',
            actor: { id: res.locals.caller?.id, email: res.locals.caller?.email, ip: req.ip },
            targetId: reg.id,
            targetType: 'webhook',
            details: `ClickUp webhook registered at ${endpoint}`,
          });

          outcomeStatus = 200;
          outcomeBody = {
            success: true,
            webhookId: reg.id,
            endpoint: reg.endpoint,
            message: 'ClickUp webhook registered',
          };
        } catch (err: any) {
          outcomeStatus = 502;
          outcomeBody = { error: err?.message || 'Failed registering webhook' };
        }
      })();

      webhookRegistrationInFlight = run;
      try {
        await run;
      } finally {
        if (webhookRegistrationInFlight === run) {
          webhookRegistrationInFlight = null;
        }
      }
      return res.status(outcomeStatus).json(outcomeBody);
    });

    app.get('/api/clickup/webhook/status', (_req: Request, res: Response) => {
      refreshWebhookPointer();
      res.json({
        listening: true,
        registered: Boolean(registeredWebhookId),
        webhookId: registeredWebhookId,
        endpointUrl: activeWebhookEndpoint || '/api/clickup/webhook',
        totalEventsCount,
        lastEventAt,
        lastEventAction,
      });
    });

    app.delete('/api/clickup/webhook/:id', async (req: Request, res: Response) => {
      const safeId = sanitizeClickupId(String(req.params.id || ''));
      if (!safeId) return res.status(400).json({ error: 'Invalid webhook ID' });
      const token = resolveToken(res.locals.caller);
      if (token) {
        await transport(`${CLICKUP_API}/webhook/${safeId}`, {
          method: 'DELETE',
          headers: { Authorization: token },
        }).catch(() => {});
      }
      await webhookRegistry.remove(decodeURIComponent(safeId), repo.getWebhookDb());
      refreshWebhookPointer();
      res.json({ success: true });
    });
  };

  return {
    resolveToken,
    resolveTeamId,
    syncParentDescriptionToClickUp,
    syncContentLinkToClickUp,
    syncTaskToClickUp,
    createRemoteParentTask,
    createRemoteSubtask,
    processWebhookEvent,
    registerRoutes,
  };
}

export type ClickUpService = ReturnType<typeof createClickUpService>;
