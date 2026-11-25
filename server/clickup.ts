import { createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { ParentTask, Task, User } from '../src/types';
import { formatBillableHours, getTaskAssigneeIds } from '../src/domain/taskTransitions';
import { validSignature } from './security';
import type { WorkspaceRepository } from './store';
import type { WebhookRegistry } from './webhooks';

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
  const transport: ClickUpTransport = deps.transport || ((url, init) => fetch(url, init));
  const sanitize = deps.sanitizeString || defaultSanitize;

  const teamIdCache = new Map<string, string>();
  const apiCache = new Map<string, { data: any; expiresAt: number }>();

  let registeredWebhookId: string | null = webhookRegistry.latest()?.id || null;
  let activeWebhookEndpoint: string | null = webhookRegistry.latest()?.endpoint || null;
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
    apiCache.set(key, { data, expiresAt: Date.now() + ttlMs });
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

  const resolveToken = (options?: {
    explicitToken?: string;
    req?: Request;
    caller?: User;
    taskUser?: User;
    fallbackToAnyUser?: boolean;
  }): string => {
    const store = repo.getStore();
    const candidates = [
      options?.explicitToken,
      options?.caller?.clickupApiKey,
      options?.taskUser?.clickupApiKey,
      options?.req?.headers?.['x-clickup-api-key'] as string | undefined,
      options?.req?.body?.apiKey as string | undefined,
      options?.fallbackToAnyUser !== false ? store.users.find(u => u.clickupApiKey)?.clickupApiKey : undefined,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return '';
  };

  const resolveTeamId = async (token: string): Promise<string | null> => {
    const cached = teamIdCache.get(token);
    if (cached) return cached;
    try {
      const teamRes = await transport(`${CLICKUP_API}/team`, {
        headers: { Authorization: token },
      });
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        const tid = teamData.teams?.[0]?.id ? String(teamData.teams[0].id) : null;
        if (tid) teamIdCache.set(token, tid);
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
    const timeMs = Math.round(durationMs);
    if (timeMs < 1000) return true;

    const isOwnBoard = !callerUserId || callerUserId === taskUser.id;
    const boardUserToken = taskUser.clickupApiKey?.trim();
    const boardUserClickupId = taskUser.clickupUserId ? parseInt(taskUser.clickupUserId, 10) : undefined;

    if (boardUserToken) {
      const teamId = await resolveTeamId(boardUserToken);
      if (teamId) {
        try {
          const timeRes = await transport(`${CLICKUP_API}/team/${teamId}/time_entries`, {
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
        const timeRes = await transport(`${CLICKUP_API}/task/${clickupTaskId}/time`, {
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
      if (teamId) {
        try {
          const timeRes = await transport(`${CLICKUP_API}/team/${teamId}/time_entries`, {
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
  }): Promise<{ hash?: string; conflict: boolean }> => {
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
    if (!clickupId || !token) return { hash: lastSyncedHash, conflict: false };

    let liveDesc = initialLiveDesc;
    if (liveDesc === undefined) {
      try {
        const getRes = await transport(`${CLICKUP_API}/task/${clickupId}`, {
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
      return { hash: lastSyncedHash, conflict: false };
    }

    const liveHash = hashClickupDescription(liveDesc);
    const desiredHash = hashClickupDescription(desiredMarkdown);
    if (liveHash === desiredHash) {
      return { hash: desiredHash, conflict: false };
    }

    const fallbackHash = fallbackLegacyDesc ? hashClickupDescription(fallbackLegacyDesc) : '';
    const isSafeToOverwrite =
      !liveDesc.trim() ||
      (Boolean(lastSyncedHash) && liveHash === lastSyncedHash) ||
      (Boolean(fallbackHash) && liveHash === fallbackHash);

    if (isSafeToOverwrite) {
      try {
        const putRes = await transport(`${CLICKUP_API}/task/${clickupId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ description: desiredMarkdown }),
        });
        if (putRes.ok) {
          return { hash: desiredHash, conflict: false };
        }
      } catch (err) {
        console.warn(`[ClickUp Desc Sync] Failed updating ClickUp description on ${clickupId}:`, err);
      }
      return { hash: lastSyncedHash, conflict: false };
    }

    if (!skipConflictComment && desiredMarkdown.trim()) {
      try {
        await transport(`${CLICKUP_API}/task/${clickupId}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({
            comment_text: `[${commentHeader}]\n\n${desiredMarkdown}`,
            notify_all: false,
          }),
        });
      } catch (err) {
        console.warn(`[ClickUp Desc Sync] Failed posting conflict comment on ${clickupId}:`, err);
      }
    }
    return { hash: lastSyncedHash, conflict: true };
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
      repo.saveParentTask(parentTask).catch(e => console.error('Firestore parent hash err:', e));
    }
  };

  const syncContentLinkToClickUp = async (task: Task, link: string, explicitToken?: string): Promise<void> => {
    const clickupId = task.clickupTaskId;
    if (!clickupId || !link) return;
    const store = repo.getStore();
    const taskUser = task.userId ? store.users.find(u => u.id === task.userId) : undefined;
    const token = resolveToken({ explicitToken, taskUser });
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
          repo.saveTask(task).catch(e => console.error('Firestore task hash err:', e));
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
  ): Promise<void> => {
    const store = repo.getStore();
    const assignees = getTaskAssigneeIds(task);
    const assignedUsers = assignees
      .map(uid => store.users.find(u => u.id === uid))
      .filter((u): u is User => Boolean(u));
    const taskUser = userOverride || assignedUsers[0] || store.users.find(u => u.id === task.userId);
    const token = resolveToken({ explicitToken, taskUser });
    if (!token) return;

    const clickupAssigneeIds = assignedUsers
      .map(u => (u.clickupUserId ? parseInt(u.clickupUserId, 10) : NaN))
      .filter(id => !isNaN(id));

    const clickupStatus = ZENFLOW_TO_CLICKUP_STATUS[task.status] || 'to do';
    const timeEstimateMs = COGNITIVE_LOAD_ESTIMATES_MS[task.cognitiveLoad] || 24 * 3600 * 1000;

    if (task.clickupTaskId) {
      try {
        const updatePayload: any = {
          name: task.title,
          status: clickupStatus,
          time_estimate: timeEstimateMs,
        };
        if (task.dueDate) {
          updatePayload.due_date = new Date(task.dueDate + 'T23:59:59').getTime();
        }
        const res = await transport(`${CLICKUP_API}/task/${task.clickupTaskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify(updatePayload),
        });

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
          await transport(`${CLICKUP_API}/task/${task.clickupTaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({
              assignees: { add: clickupAssigneeIds, rem: [] },
            }),
          }).catch(() => {});
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
            if (descResult.hash && descResult.hash !== task.lastSyncedClickupDescHash) {
              task.lastSyncedClickupDescHash = descResult.hash;
              task.updatedAt = new Date().toISOString();
              repo.saveLocal();
              repo.saveTask(task).catch(e => console.error('Firestore save desc hash err:', e));
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
            if (timePosted) {
              taskWithSync.lastSyncedClickupTimeMs = trackedMs;
              repo.saveLocal();
              repo.saveTask(task).catch(e => console.error('Firestore save time err:', e));
            }
          }
        }
      } catch (err) {
        console.warn('[ClickUp Auto-Sync] Update error:', err);
      }
      return;
    }

    // Create task in ClickUp
    let targetListId = task.clickupListId;
    if (!targetListId && taskUser?.selectedClickupSpaceId) {
      try {
        const listRes = await transport(`${CLICKUP_API}/space/${taskUser.selectedClickupSpaceId}/list?archived=false`, {
          headers: { Authorization: token },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.lists?.length > 0) {
            targetListId = listData.lists[0].id;
          }
        }
        if (!targetListId) {
          const folderRes = await transport(`${CLICKUP_API}/space/${taskUser.selectedClickupSpaceId}/folder?archived=false`, {
            headers: { Authorization: token },
          });
          if (folderRes.ok) {
            const folderData = await folderRes.json();
            for (const f of folderData.folders || []) {
              if (f.lists?.length > 0) {
                targetListId = f.lists[0].id;
                break;
              }
            }
          }
        }
      } catch {
        // ignore lookup errors
      }
    }

    if (!targetListId) return;

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
        repo.saveTask(task).catch(e => console.error('Firestore save err:', e));
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
          if (timePosted) {
            (task as Task & { lastSyncedClickupTimeMs?: number }).lastSyncedClickupTimeMs = trackedMs;
            repo.saveLocal();
            repo.saveTask(task).catch(e => console.error('Firestore save time err:', e));
          }
        }
      }
    } catch (err) {
      console.warn('[ClickUp Auto-Sync] Creation error:', err);
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
  }): Promise<{ clickupParentTaskId?: string; clickupUrl?: string; descHash?: string }> => {
    const { token, listId, title, markdown, dueDate, taskTypeFieldId, taskTypeId } = params;
    if (!token || !listId) return {};
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
      const pRes = await transport(`${CLICKUP_API}/list/${listId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(parentPayload),
      });
      if (pRes.ok) {
        const pData = await pRes.json();
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
      console.warn('[ClickUp Bundle] Failed to create parent task:', await pRes.text());
    } catch (err) {
      console.warn('[ClickUp Bundle] Parent task error:', err);
    }
    return {};
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
  }): Promise<{ clickupTaskId?: string; clickupUrl?: string; descHash?: string }> => {
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
    if (!token || !listId) return { clickupUrl: parentClickupUrl };
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
      const sRes = await transport(`${CLICKUP_API}/list/${listId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(subPayload),
      });
      if (sRes.ok) {
        const sData = await sRes.json();
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
      console.warn(`[ClickUp Bundle] Failed to create ${discLabel} subtask:`, await sRes.text());
    } catch (err) {
      console.warn(`[ClickUp Bundle] ${discLabel} subtask error:`, err);
    }
    return { clickupUrl: parentClickupUrl };
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
    const token = resolveToken({ taskUser: assignedUser });

    if (token) {
      try {
        const cRes = await transport(`${CLICKUP_API}/task/${taskId}`, {
          headers: { Authorization: token },
        });
        if (cRes.ok) clickupTaskData = await cRes.json();
      } catch (e) {
        console.warn(`[ClickUp Webhook] Could not fetch ClickUp task ${taskId}:`, e);
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
      syncTaskToClickUp(existingTask, token, assignedUser).catch(e =>
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
        repo.saveTask(existingTask).catch(e => console.error('Firestore save err:', e));
        broadcastEvent('task_updated', existingTask);
      }
    }
  };

  const registerRoutes = (app: Express) => {
    refreshWebhookPointer();

    app.post('/api/clickup/verify', async (req: Request, res: Response) => {
      const token = resolveToken({ explicitToken: req.body?.apiKey, req, caller: res.locals.caller, fallbackToAnyUser: false });
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

    app.get('/api/clickup/spaces', async (req: Request, res: Response) => {
      const token = resolveToken({ req, caller: res.locals.caller });
      if (!token) return res.status(400).json({ error: 'ClickUp API token not configured' });

      const cacheKey = `spaces:${token}`;
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
      const token = resolveToken({ req, caller: res.locals.caller });
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

    app.get('/api/clickup/members', async (req: Request, res: Response) => {
      const token = resolveToken({ req, caller: res.locals.caller });
      if (!token) return res.status(400).json({ error: 'ClickUp API token not configured' });

      const cacheKey = `members:${token}`;
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
      const token = resolveToken({ req, caller: res.locals.caller });
      const spaceId = sanitize(req.query.spaceId);
      if (!token || !spaceId) return res.status(400).json({ error: 'spaceId and ClickUp token are required' });

      const cacheKey = `folders:${spaceId}:${token}`;
      const cached = getFromCache(cacheKey);
      if (cached) return res.json(cached);

      try {
        const [fRes, lRes] = await Promise.all([
          transport(`${CLICKUP_API}/space/${spaceId}/folder?archived=false`, { headers: { Authorization: token } }),
          transport(`${CLICKUP_API}/space/${spaceId}/list?archived=false`, { headers: { Authorization: token } }),
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
      const token = resolveToken({ req, caller: res.locals.caller });
      const listId = sanitize(req.query.listId);
      if (!token) return res.status(400).json({ error: 'ClickUp API token required' });

      const cacheKey = `custom-fields:${listId || 'team'}:${token}`;
      const cached = getFromCache(cacheKey);
      if (cached) return res.json(cached);

      try {
        let taskTypeField: any = null;
        let options: any[] = [];
        if (listId) {
          const fRes = await transport(`${CLICKUP_API}/list/${listId}/field`, { headers: { Authorization: token } });
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
      const token = resolveToken({ req, caller: res.locals.caller });
      const name = sanitize(req.body?.name);
      const spaceId = sanitize(req.body?.spaceId);
      const folderId = sanitize(req.body?.folderId);
      if (!token || !name || (!spaceId && !folderId)) {
        return res.status(400).json({ error: 'name and spaceId/folderId are required' });
      }

      const url = folderId ? `${CLICKUP_API}/folder/${folderId}/list` : `${CLICKUP_API}/space/${spaceId}/list`;
      try {
        const createRes = await transport(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ name }),
        });
        if (!createRes.ok) return res.status(createRes.status).json({ error: 'Failed to create ClickUp list' });
        const list = await createRes.json();
        invalidateCache(`folders:${spaceId}`);
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
      const token = resolveToken({ req, caller, taskUser: targetUser });
      if (!token) return res.status(400).json({ error: 'ClickUp API token not configured' });

      const userTasks = store.tasks.filter(t => getTaskAssigneeIds(t).includes(targetUser.id));
      let syncedCount = 0;
      for (const t of userTasks) {
        await syncTaskToClickUp(t, token, targetUser, caller?.id);
        syncedCount++;
      }

      return res.json({
        success: true,
        syncedCount,
        archivedCount: 0,
        message: `Synced ${syncedCount} task(s) for ${targetUser.name}`,
      });
    });

    app.post('/api/clickup/webhook', (req: Request, res: Response) => {
      const signature = req.headers['x-signature'] as string | undefined;
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      const savedWebhook = webhookRegistry.latest();
      if (!savedWebhook?.secret || !rawBody || !validSignature(rawBody, signature, savedWebhook.secret)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      const body = req.body || {};
      const taskId = body.task_id ? String(body.task_id) : '';
      const eventType = String(body.event || 'unknown');
      const historyItems = Array.isArray(body.history_items) ? body.history_items : [];

      res.json({ ok: true });
      processWebhookEvent({ taskId, eventType, historyItems, rawBody: body, ip: req.ip }).catch(err =>
        console.error('[ClickUp Webhook] Unhandled processing error:', err)
      );
    });

    app.post('/api/clickup/webhook/register', async (req: Request, res: Response) => {
      const token = resolveToken({ req, caller: res.locals.caller });
      if (!token) return res.status(400).json({ error: 'ClickUp API token required' });

      const teamId = await resolveTeamId(token);
      if (!teamId) return res.status(404).json({ error: 'No ClickUp workspace team found' });

      const endpoint =
        sanitize(req.body?.endpoint) ||
        `${req.protocol}://${req.get('host')}/api/clickup/webhook`;

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
          return res.status(createRes.status).json({ error: 'Failed to register ClickUp webhook' });
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

        return res.json({
          success: true,
          webhookId: reg.id,
          endpoint: reg.endpoint,
          message: 'ClickUp webhook registered',
        });
      } catch (err: any) {
        return res.status(502).json({ error: err?.message || 'Failed registering webhook' });
      }
    });

    app.get('/api/clickup/webhook/status', (_req: Request, res: Response) => {
      refreshWebhookPointer();
      res.json({
        registered: Boolean(registeredWebhookId),
        webhookId: registeredWebhookId,
        endpointUrl: activeWebhookEndpoint || '/api/clickup/webhook',
        totalEventsCount,
        lastEventAt,
        lastEventAction,
      });
    });

    app.delete('/api/clickup/webhook/:id', async (req: Request, res: Response) => {
      const id = String(req.params.id || '');
      const token = resolveToken({ req, caller: res.locals.caller });
      if (token && id) {
        await transport(`${CLICKUP_API}/webhook/${id}`, {
          method: 'DELETE',
          headers: { Authorization: token },
        }).catch(() => {});
      }
      await webhookRegistry.remove(id, repo.getWebhookDb());
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
