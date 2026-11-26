import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { apiFetch as fetch } from '../lib/api';
import type {
  User,
  ClickupMember,
  ClickupSpace,
  ClickupList,
  ClickupFolder,
  ClickupCustomFieldOption,
  ClickupWebhookStatus,
} from '../types';

export interface ClickUpContextValue {
  isZensciencesUser: boolean;
  isClickupConnected: boolean;
  clickupMembers: ClickupMember[];
  loadClickupMembers: (apiKey?: string) => Promise<ClickupMember[]>;
  clickupSpaces: ClickupSpace[];
  selectedClickupSpaceId: string;
  spaceFoldersAndListsMap: Record<string, { folders: ClickupFolder[]; folderlessLists: ClickupList[] }>;
  getFoldersAndListsForSpace: (spaceId: string) => Promise<{ folders: ClickupFolder[]; folderlessLists: ClickupList[] }>;
  connectClickup: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  disconnectClickup: () => void;
  setSelectedClickupSpaceId: (spaceId: string, spaceName?: string) => Promise<void>;
  createClickupSpace: (name: string) => Promise<ClickupSpace | null>;
  createClickupList: (name: string, spaceId: string, folderId?: string) => Promise<ClickupList | null>;
  syncUserTasksWithClickUp: (userId: string) => Promise<{ success: boolean; syncedCount: number; archivedCount: number; message: string }>;
  clickupCustomFieldOptions: ClickupCustomFieldOption[];
  clickupTaskTypeFieldId: string;
  isLoadingTaskTypes: boolean;
  fetchClickupCustomFields: (params: { listId?: string; spaceId?: string; folderId?: string }) => Promise<ClickupCustomFieldOption[]>;
  clickupWebhookStatus: ClickupWebhookStatus | null;
  refreshClickupWebhookStatus: () => Promise<void>;
  registerClickupWebhook: (customEndpoint?: string) => Promise<{ success: boolean; message: string; webhookId?: string }>;
}

const ClickUpContext = createContext<ClickUpContextValue | undefined>(undefined);

interface ClickUpProviderProps {
  currentUser: User | null;
  updateUserProfile: (userId: string, updates: Partial<User>) => Promise<User>;
  fetchState: () => Promise<void>;
  children: ReactNode;
}

export const ClickUpProvider: React.FC<ClickUpProviderProps> = ({
  currentUser,
  updateUserProfile,
  fetchState,
  children,
}) => {
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;

  const isZensciencesUser = useMemo(
    () => Boolean(currentUser?.email?.toLowerCase().endsWith('@zensciences.com')),
    [currentUser]
  );
  const isClickupConnected = useMemo(
    () => Boolean(isZensciencesUser && currentUser?.clickupConnected),
    [isZensciencesUser, currentUser?.clickupConnected]
  );

  const [clickupSpaces, setClickupSpaces] = useState<ClickupSpace[]>([]);
  const [selectedClickupSpaceId, setSelectedClickupSpaceIdState] = useState<string>(
    () => currentUser?.selectedClickupSpaceId || localStorage.getItem('zenflow_clickup_space_id') || ''
  );
  const selectedClickupSpaceIdRef = useRef<string>(selectedClickupSpaceId);
  selectedClickupSpaceIdRef.current = selectedClickupSpaceId;

  const [spaceFoldersAndListsMap, setSpaceFoldersAndListsMap] = useState<
    Record<string, { folders: ClickupFolder[]; folderlessLists: ClickupList[] }>
  >({});
  const spaceFoldersAndListsMapRef = useRef(spaceFoldersAndListsMap);
  spaceFoldersAndListsMapRef.current = spaceFoldersAndListsMap;

  const [clickupMembers, setClickupMembers] = useState<ClickupMember[]>([]);
  const [clickupCustomFieldOptions, setClickupCustomFieldOptions] = useState<ClickupCustomFieldOption[]>([]);
  const [clickupTaskTypeFieldId, setClickupTaskTypeFieldId] = useState<string>('');
  const [isLoadingTaskTypes, setIsLoadingTaskTypes] = useState<boolean>(false);
  const [clickupWebhookStatus, setClickupWebhookStatus] = useState<ClickupWebhookStatus | null>(null);

  const refreshClickupWebhookStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/clickup/webhook/status');
      if (res.ok) setClickupWebhookStatus(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const loadClickupFoldersAndLists = useCallback(async (spaceId: string, apiKey: string = '') => {
    if (!spaceId) return;
    try {
      const res = await fetch(`/api/clickup/folders-and-lists?spaceId=${encodeURIComponent(spaceId)}`, {
        headers: apiKey ? { 'x-clickup-api-key': apiKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSpaceFoldersAndListsMap(prev => ({
          ...prev,
          [spaceId]: { folders: data.folders || [], folderlessLists: data.folderlessLists || [] },
        }));
      }
    } catch (err) {
      console.warn('Failed to load ClickUp folders & lists:', err);
    }
  }, []);

  const loadClickupSpaces = useCallback(async (apiKey: string = '') => {
    try {
      const res = await fetch('/api/clickup/spaces', {
        headers: apiKey ? { 'x-clickup-api-key': apiKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.spaces)) {
          setClickupSpaces(data.spaces);
          if (data.spaces.length > 0 && !selectedClickupSpaceIdRef.current) {
            const firstId = data.spaces[0].id;
            setSelectedClickupSpaceIdState(firstId);
            try { localStorage.setItem('zenflow_clickup_space_id', firstId); } catch {}
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load ClickUp spaces:', err);
    }
  }, []);

  const getFoldersAndListsForSpace = useCallback(async (spaceId: string) => {
    if (!spaceId) return { folders: [], folderlessLists: [] };
    if (spaceFoldersAndListsMapRef.current[spaceId]) return spaceFoldersAndListsMapRef.current[spaceId];
    try {
      const res = await fetch(`/api/clickup/folders-and-lists?spaceId=${encodeURIComponent(spaceId)}`);
      if (res.ok) {
        const data = await res.json();
        const result = { folders: data.folders || [], folderlessLists: data.folderlessLists || [] };
        setSpaceFoldersAndListsMap(prev => ({ ...prev, [spaceId]: result }));
        return result;
      }
    } catch (err) {
      console.warn('Failed to load folders & lists for space:', err);
    }
    return { folders: [], folderlessLists: [] };
  }, []);

  const loadClickupMembers = useCallback(async (apiKey: string = ''): Promise<ClickupMember[]> => {
    try {
      const res = await fetch('/api/clickup/members', {
        headers: apiKey ? { 'x-clickup-api-key': apiKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const list: ClickupMember[] = Array.isArray(data.members) ? data.members : [];
        setClickupMembers(list);
        return list;
      }
    } catch (err) {
      console.warn('Failed to load ClickUp members:', err);
    }
    return [];
  }, []);

  useEffect(() => {
    if (isClickupConnected) {
      loadClickupSpaces('');
      loadClickupMembers('');
    }
  }, [isClickupConnected, loadClickupSpaces, loadClickupMembers]);

  const connectClickup = useCallback(
    async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
      const cleanKey = apiKey.trim();
      if (!cleanKey) return { success: false, error: 'API key is required' };
      try {
        const res = await fetch('/api/clickup/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: cleanKey }),
        });
        const data = await res.json();
        if (!res.ok || !data.valid) return { success: false, error: data.error || 'Invalid ClickUp API Key' };
        if (currentUserRef.current) {
          await updateUserProfile(currentUserRef.current.id, { clickupApiKey: cleanKey });
        }
        await loadClickupSpaces('');
        await loadClickupMembers('');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || 'Connection failed' };
      }
    },
    [updateUserProfile, loadClickupSpaces, loadClickupMembers]
  );

  const disconnectClickup = useCallback(() => {
    localStorage.removeItem('zenflow_clickup_api_key');
    if (currentUserRef.current) updateUserProfile(currentUserRef.current.id, { clickupApiKey: '' });
    setClickupSpaces([]);
  }, [updateUserProfile]);

  const setSelectedClickupSpaceId = useCallback(
    async (spaceId: string, spaceName?: string) => {
      setSelectedClickupSpaceIdState(spaceId);
      try {
        localStorage.setItem('zenflow_clickup_space_id', spaceId);
        if (spaceName) localStorage.setItem('zenflow_clickup_space_name', spaceName);
      } catch {}
      if (currentUserRef.current) {
        await updateUserProfile(currentUserRef.current.id, {
          selectedClickupSpaceId: spaceId,
          selectedClickupSpaceName: spaceName,
        });
      }
      if (isClickupConnected) await loadClickupFoldersAndLists(spaceId, '');
    },
    [isClickupConnected, updateUserProfile, loadClickupFoldersAndLists]
  );

  const createClickupSpace = useCallback(
    async (name: string): Promise<ClickupSpace | null> => {
      if (!name.trim()) return null;
      try {
        const res = await fetch('/api/clickup/spaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          await loadClickupSpaces('');
          return data.space;
        }
      } catch (err) {
        console.warn('Failed to create ClickUp space:', err);
      }
      return null;
    },
    [loadClickupSpaces]
  );

  const createClickupList = useCallback(
    async (name: string, spaceId: string, folderId?: string): Promise<ClickupList | null> => {
      if (!name.trim() || (!spaceId && !folderId)) return null;
      try {
        const res = await fetch('/api/clickup/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spaceId, folderId, name: name.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          setSpaceFoldersAndListsMap(prev => {
            const next = { ...prev };
            delete next[spaceId];
            return next;
          });
          await loadClickupFoldersAndLists(spaceId, '');
          return data.list;
        }
      } catch (err) {
        console.warn('Failed to create ClickUp list:', err);
      }
      return null;
    },
    [loadClickupFoldersAndLists]
  );

  const syncUserTasksWithClickUp = useCallback(
    async (userId: string) => {
      try {
        const res = await fetch('/api/clickup/sync-user-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          await fetchState();
          return {
            success: true,
            syncedCount: data.syncedCount || 0,
            archivedCount: data.archivedCount || 0,
            message: data.message || 'Sync complete',
          };
        }
        return { success: false, syncedCount: 0, archivedCount: 0, message: data?.error || 'Failed to sync with ClickUp' };
      } catch (err: any) {
        return { success: false, syncedCount: 0, archivedCount: 0, message: err.message || 'Sync request failed' };
      }
    },
    [fetchState]
  );

  const fetchClickupCustomFields = useCallback(
    async (params: { listId?: string; spaceId?: string; folderId?: string }): Promise<ClickupCustomFieldOption[]> => {
      setIsLoadingTaskTypes(true);
      try {
        const q = new URLSearchParams();
        if (params.listId) q.set('listId', params.listId);
        else if (params.spaceId) q.set('spaceId', params.spaceId);
        else if (params.folderId) q.set('folderId', params.folderId);
        const res = await fetch(`/api/clickup/custom-fields?${q.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const options: ClickupCustomFieldOption[] = data.options || [];
          setClickupCustomFieldOptions(options);
          if (data.taskTypeField?.id) setClickupTaskTypeFieldId(data.taskTypeField.id);
          return options;
        }
      } catch (err) {
        console.warn('[ClickUpContext] Failed to fetch custom fields:', err);
      } finally {
        setIsLoadingTaskTypes(false);
      }
      return [];
    },
    []
  );

  const registerClickupWebhook = useCallback(
    async (customEndpoint?: string): Promise<{ success: boolean; message: string; webhookId?: string }> => {
      try {
        const res = await fetch('/api/clickup/webhook/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: customEndpoint }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await refreshClickupWebhookStatus();
          return {
            success: true,
            message: data.message || 'ClickUp real-time webhook registered successfully!',
            webhookId: data.webhookId,
          };
        }
        return { success: false, message: data.error || 'Failed to register webhook in ClickUp' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Network error registering webhook' };
      }
    },
    [refreshClickupWebhookStatus]
  );

  const value = useMemo<ClickUpContextValue>(
    () => ({
      isZensciencesUser,
      isClickupConnected,
      clickupMembers,
      loadClickupMembers,
      clickupSpaces,
      selectedClickupSpaceId,
      spaceFoldersAndListsMap,
      getFoldersAndListsForSpace,
      connectClickup,
      disconnectClickup,
      setSelectedClickupSpaceId,
      createClickupSpace,
      createClickupList,
      syncUserTasksWithClickUp,
      clickupCustomFieldOptions,
      clickupTaskTypeFieldId,
      isLoadingTaskTypes,
      fetchClickupCustomFields,
      clickupWebhookStatus,
      refreshClickupWebhookStatus,
      registerClickupWebhook,
    }),
    [
      isZensciencesUser,
      isClickupConnected,
      clickupMembers,
      loadClickupMembers,
      clickupSpaces,
      selectedClickupSpaceId,
      spaceFoldersAndListsMap,
      getFoldersAndListsForSpace,
      connectClickup,
      disconnectClickup,
      setSelectedClickupSpaceId,
      createClickupSpace,
      createClickupList,
      syncUserTasksWithClickUp,
      clickupCustomFieldOptions,
      clickupTaskTypeFieldId,
      isLoadingTaskTypes,
      fetchClickupCustomFields,
      clickupWebhookStatus,
      refreshClickupWebhookStatus,
      registerClickupWebhook,
    ]
  );

  return <ClickUpContext.Provider value={value}>{children}</ClickUpContext.Provider>;
};

export function useClickUp(): ClickUpContextValue {
  const ctx = useContext(ClickUpContext);
  if (!ctx) throw new Error('useClickUp must be used within a DashboardProvider');
  return ctx;
}
