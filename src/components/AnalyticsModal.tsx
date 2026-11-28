import { MetricHelp, efficiencyHelp } from './MetricHelp';
import { MetricBar } from './ui/MetricBar';
import { DialogPanel } from './ui/DialogPanel';
import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { useWorkspace } from '../context/DashboardContext';
import { User, Task, AnalyticsScope, AnalyticsTimeframe, AnalyticsSnapshot } from '../types';
import { getAnalyticsClock } from '../domain/analyticsDate';
import {
  calculateTasksEfficiency,
  formatHours,
  formatHoursRatio,
  formatTaskStatus,
  meetsDailyUtilizationTarget,
  DAILY_UTILIZATION_TARGET_HOURS,
  rankTaskHours,
  getDeliveryUnits,
  calculateUserWorkload,
  getUserTag,
  getAssignedHoursByMemberAndDate,
  isWorkingDay,
  getTaskAssigneeIds,
  groupTasksByAssignee,
  isTaskAssignedToUser,
  formatLocalDateKey,
  parseLocalDate,
  formatDateOnly,
  getEfficiencyToneClass,
  DeliveryUnitInfo,
} from '../utils/workload';
import {
  X,
  Calendar,
  Lock,
  Users,
  Activity,
  Building2,
  FolderGit2,
  CheckCircle2,
  Briefcase,
  ChevronDown,
} from 'lucide-react';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToMember?: (user: User) => void;
}

const EMPTY_USERS: User[] = [];
const EMPTY_TASKS: Task[] = [];
const clientName = (task: Task) => task.client?.trim() || 'Internal / Unassigned';
const projectName = (task: Task) => task.project?.trim() || 'General / Unnamed';
const formatEstBill = (estimatedHours: number, billableHours: number) =>
  `${formatHours(estimatedHours)} est / ${formatHours(billableHours)} bill`;

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose, onJumpToMember }) => {
  const workspace = useWorkspace();
  const { fetchAnalyticsSnapshot } = workspace;
  const { date: today } = getAnalyticsClock();

  // Active time frame & calendar state
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('today');
  const [customDate, setCustomDate] = useState<string>(() => getAnalyticsClock().date);
  const [customEndDate, setCustomEndDate] = useState<string>(() => getAnalyticsClock().date);
  const [isRangeMode, setIsRangeMode] = useState<boolean>(false);

  // Filter Scope State
  const [filterScope, setFilterScope] = useState<AnalyticsScope>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedDeliveryUnitId, setSelectedDeliveryUnitId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const requestedDates = useMemo(() => {
    if (timeframe === 'today') return [today];
    const workspaceDate = parseLocalDate(today)!;
    if (timeframe === 'week') {
      const monday = new Date(workspaceDate);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, day) =>
        formatLocalDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day))
      );
    }
    const start = parseLocalDate(customDate);
    const end = parseLocalDate(isRangeMode ? customEndDate : customDate);
    if (!start || !end || start > end) return [];
    const dates: string[] = [];
    for (const day = new Date(start); day <= end && dates.length < 366; day.setDate(day.getDate() + 1)) {
      dates.push(formatLocalDateKey(day));
    }
    return dates;
  }, [timeframe, today, customDate, customEndDate, isRangeMode]);

  const start = requestedDates[0];
  const end = requestedDates.at(-1);
  const requestedHistory = Boolean(start && end && end < today);
  const futureOnly = Boolean(start && start > today);
  const historyKey = `${start}/${end}`;
  const [historical, setHistorical] = useState<{ key: string; snapshot: AnalyticsSnapshot | null; error?: string }>();
  useEffect(() => {
    if (!isOpen || !requestedHistory || !start || !end) return;
    const controller = new AbortController();
    void fetchAnalyticsSnapshot(start, end, controller.signal)
      .then(snapshot => {
        if (!controller.signal.aborted) setHistorical({ key: historyKey, snapshot });
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistorical({ key: historyKey, snapshot: null, error: 'Historical analytics could not be loaded.' });
      });
    return () => controller.abort();
  }, [end, fetchAnalyticsSnapshot, historyKey, isOpen, requestedHistory, start]);

  const past = requestedHistory && historical?.key === historyKey ? historical : undefined;
  const snapshot = past?.snapshot;
  const isLocked = Boolean(snapshot);
  const lockLabel = snapshot ? `Locked snapshot · ${snapshot.date}` : requestedHistory ? 'Historical analytics' : `Live · ${today}`;
  const unavailable = !start ? 'Select a valid date range.'
    : futureOnly ? 'Analytics are unavailable for future dates.'
    : requestedHistory && !snapshot ? (past?.error || (past ? 'No historical snapshot was saved for this period.' : 'Loading historical analytics…'))
    : '';
  const users = requestedHistory ? snapshot?.users ?? EMPTY_USERS : workspace.users;
  const tasks = requestedHistory ? snapshot?.tasks ?? EMPTY_TASKS : workspace.tasks;
  const creativeDirectors = useMemo(() => requestedHistory
    ? users.filter(user => user.isCreativeDirector)
    : workspace.creativeDirectors, [requestedHistory, users, workspace.creativeDirectors]);
  const reportDate = snapshot?.date ?? today;
  const capturedMs = snapshot ? Date.parse(snapshot.capturedAt) : undefined;
  const dateRange = useMemo(() => requestedHistory ? (snapshot ? [reportDate] : []) :
    requestedDates.filter(date => date >= today), [requestedDates, reportDate, requestedHistory, snapshot, today]);

  // Delivery units extracted across workspace
  const deliveryUnits = useMemo(() => {
    return getDeliveryUnits(users, creativeDirectors);
  }, [users, creativeDirectors]);

  // Unique clients and projects
  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.client && t.client.trim()) set.add(t.client.trim());
    }
    return Array.from(set).sort();
  }, [tasks]);

  const uniqueProjects = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.project && t.project.trim()) set.add(t.project.trim());
    }
    return Array.from(set).sort();
  }, [tasks]);

  // Set default selection when filter scope changes
  useEffect(() => {
    if (requestedHistory && !snapshot) return;
    if (filterScope === 'client' && !uniqueClients.includes(selectedClientId)) {
      setSelectedClientId(uniqueClients[0] ?? '');
    } else if (filterScope === 'delivery_unit' && !deliveryUnits.some(unit => unit.id === selectedDeliveryUnitId)) {
      setSelectedDeliveryUnitId(deliveryUnits[0]?.id ?? '');
    } else if (filterScope === 'project' && !uniqueProjects.includes(selectedProjectId)) {
      setSelectedProjectId(uniqueProjects[0] ?? '');
    } else if (filterScope === 'user' && !users.some(user => user.id === selectedUserId)) {
      setSelectedUserId(users[0]?.id ?? '');
    }
  }, [filterScope, uniqueClients, deliveryUnits, uniqueProjects, users, selectedClientId, selectedDeliveryUnitId, selectedProjectId, selectedUserId, requestedHistory, snapshot]);

  // Filter tasks and users based on active scope (delivery roles only for workspace-wide capacity metrics)
  const { scopedUsers, scopedTasks } = useMemo(() => {
    let uList = users.filter(u => u.role === 'content' || u.role === 'design');
    let tList = tasks;

    if (filterScope === 'client') {
      tList = selectedClientId ? tasks.filter(t => t.client?.trim() === selectedClientId) : [];
      const clientUserIds = new Set(tList.flatMap(t => getTaskAssigneeIds(t)));
      uList = users.filter(u => clientUserIds.has(u.id) && (u.role === 'content' || u.role === 'design'));
    } else if (filterScope === 'delivery_unit') {
      const du = deliveryUnits.find(d => d.id === selectedDeliveryUnitId);
      const duUserIds = new Set(du?.userIds);
      uList = users.filter(u => duUserIds.has(u.id) && (u.role === 'content' || u.role === 'design'));
      tList = tasks.filter(t => getTaskAssigneeIds(t).some(id => duUserIds.has(id)));
    } else if (filterScope === 'project') {
      tList = selectedProjectId ? tasks.filter(t => t.project?.trim() === selectedProjectId) : [];
      const projUserIds = new Set(tList.flatMap(t => getTaskAssigneeIds(t)));
      uList = users.filter(u => projUserIds.has(u.id) && (u.role === 'content' || u.role === 'design'));
    } else if (filterScope === 'user') {
      uList = users.filter(u => u.id === selectedUserId);
      tList = tasks.filter(t => isTaskAssignedToUser(t, selectedUserId));
    }

    return { scopedUsers: uList, scopedTasks: tList };
  }, [users, tasks, filterScope, selectedClientId, selectedDeliveryUnitId, selectedProjectId, selectedUserId, deliveryUnits]);

  const scopedMemberIds = useMemo(() => filterScope === 'user' || filterScope === 'delivery_unit'
    ? new Set(scopedUsers.map(user => user.id))
    : undefined, [filterScope, scopedUsers]);

  const topMetrics = useMemo(() => {
    const totalEmployees = scopedUsers.length;
    const assignedHours = getAssignedHoursByMemberAndDate(scopedTasks, [reportDate], reportDate);
    const totalUtilizedCount = scopedUsers.filter(user =>
      meetsDailyUtilizationTarget(assignedHours.get(user.id)?.get(reportDate) ?? 0)
    ).length;
    const totalUtilization = totalEmployees ? Math.round((totalUtilizedCount / totalEmployees) * 100) : 0;
    const options = { nowMs: capturedMs, memberIds: scopedMemberIds };
    const efficiency = calculateTasksEfficiency(scopedTasks, options);
    const topAccountsList = rankTaskHours(scopedTasks.filter(task => Boolean(task.client?.trim())), clientName, options).filter(account => account.billableHours > 0);

    return {
      totalEmployees,
      totalUtilizedCount,
      totalUtilization,
      efficiency,
      topAccountsList,
    };
  }, [scopedUsers, scopedTasks, scopedMemberIds, capturedMs, reportDate]);

  // SECTION 1: Underutilized Employees (< 3 hours per day assigned) with dates
  const underutilizedEmployees = useMemo(() => {
    const result: Array<{
      user: User;
      avgAssigned: number;
      dates: string[];
    }> = [];

    const evaluatedDates = dateRange.filter(key => {
      const date = parseLocalDate(key);
      return date && (dateRange.length === 1 || isWorkingDay(date));
    });
    const assignedHours = getAssignedHoursByMemberAndDate(scopedTasks, evaluatedDates, reportDate);
    for (const u of scopedUsers) {
      const underutilizedDates: string[] = [];
      let totalAssigned = 0;

      for (const dateStr of evaluatedDates) {
        const dailyAssigned = assignedHours.get(u.id)?.get(dateStr) ?? 0;
        totalAssigned += dailyAssigned;
        if (!meetsDailyUtilizationTarget(dailyAssigned)) {
          underutilizedDates.push(dateStr);
        }
      }

      if (underutilizedDates.length > 0) {
        const avg = Math.round((totalAssigned / evaluatedDates.length) * 10) / 10;
        result.push({
          user: u,
          avgAssigned: avg,
          dates: underutilizedDates,
        });
      }
    }

    return result.sort((a, b) => a.avgAssigned - b.avgAssigned);
  }, [scopedUsers, scopedTasks, dateRange, reportDate]);

  // SECTION 2: Low Efficiency Employees (< 50%) with dates
  const lowEfficiencyEmployees = useMemo(() => {
    const result: Array<{
      user: User;
      efficiencyPercent: number;
      timeTaken: number;
      timeEstimated: number;
      dates: string[];
    }> = [];

    const tasksByUser = groupTasksByAssignee(scopedTasks);
    for (const u of scopedUsers) {
      const { efficiencyPercent, billableHours, estimatedHours } = calculateTasksEfficiency(tasksByUser.get(u.id) ?? [], {
        memberIds: new Set([u.id]),
        nowMs: capturedMs,
      });

      if (efficiencyPercent !== null && efficiencyPercent < 50) {
        result.push({
          user: u,
          efficiencyPercent,
          timeTaken: billableHours,
          timeEstimated: estimatedHours,
          dates: [reportDate],
        });
      }
    }

    return result.sort((a, b) => a.efficiencyPercent - b.efficiencyPercent);
  }, [scopedUsers, scopedTasks, reportDate, capturedMs]);

  // SECTIONS 3 & 4: Key Accounts & Key Delivery Units (Contextually Adjusted by Filter)
  const sections3And4Data = useMemo(() => {
    const options = { nowMs: capturedMs, memberIds: scopedMemberIds };
    const computeProjectsForTasks = (taskList: Task[], memberIds = scopedMemberIds) =>
      rankTaskHours(taskList, projectName, { ...options, memberIds }).map(hours => ({ ...hours, project: hours.key }));
    const computeClientsForTasks = (taskList: Task[], memberIds = scopedMemberIds) =>
      rankTaskHours(taskList, clientName, { ...options, memberIds }).map(hours => ({ ...hours, client: hours.key }));

    const unitsById = new Map(deliveryUnits.map(unit => [unit.id, unit]));
    const userToUnit = new Map<string, string>();
    const generalUnit: DeliveryUnitInfo = { id: 'unit-general', name: 'General Team', type: 'general', userIds: [] };
    for (const unit of deliveryUnits) {
      for (const id of unit.userIds) {
        if (!userToUnit.has(id)) userToUnit.set(id, unit.id);
      }
    }
    for (const user of users) {
      if (userToUnit.has(user.id)) continue;
      userToUnit.set(user.id, generalUnit.id);
      generalUnit.userIds.push(user.id);
    }
    unitsById.set(generalUnit.id, generalUnit);

    const tasksByUnit = new Map<string, Task[]>();
    for (const task of scopedTasks) {
      const unitIds = new Set(getTaskAssigneeIds(task).map(id => userToUnit.get(id)));
      for (const id of unitIds) {
        if (!id) continue;
        const unitTasks = tasksByUnit.get(id) ?? [];
        unitTasks.push(task);
        tasksByUnit.set(id, unitTasks);
      }
    }
    const computeDeliveryUnits = () => [...tasksByUnit].flatMap(([id, unitTasks]) => {
      const du = unitsById.get(id)!;
      const memberIds = new Set(du.userIds.filter(userId => userToUnit.get(userId) === id));
      const [hours] = rankTaskHours(unitTasks, () => id, { ...options, memberIds });
      return hours ? [{ ...hours, du, memberIds, unitTasks }] : [];
    }).sort((a, b) => b.billableHours - a.billableHours);

    if (filterScope === 'client') {
      // In per client view: Section 3 = Key Delivery Units, Section 4 = Key Projects
      const keyDeliveryUnits = computeDeliveryUnits();
      const keyProjects = computeProjectsForTasks(scopedTasks);
      return {
        section3Title: 'Key Delivery Units (for this Client)',
        section3Type: 'delivery_units',
        section3Items: keyDeliveryUnits,
        section4Title: 'Key Projects (for this Client)',
        section4Type: 'projects',
        section4Items: keyProjects,
      };
    }

    if (filterScope === 'delivery_unit') {
      // In per delivery unit view: Section 3 = Key Clients, Section 4 = Key Projects
      const keyClients = computeClientsForTasks(scopedTasks);
      const keyProjects = computeProjectsForTasks(scopedTasks);
      return {
        section3Title: 'Key Clients (served by this Unit)',
        section3Type: 'clients',
        section3Items: keyClients,
        section4Title: 'Key Projects (executed by this Unit)',
        section4Type: 'projects',
        section4Items: keyProjects,
      };
    }

    if (filterScope === 'project') {
      // In per project view: Section 3 = Key Clients, Section 4 = Key Delivery Units
      const keyClients = computeClientsForTasks(scopedTasks);
      const keyDeliveryUnits = computeDeliveryUnits();
      return {
        section3Title: 'Key Clients (for this Project)',
        section3Type: 'clients',
        section3Items: keyClients,
        section4Title: 'Key Delivery Units (working on this Project)',
        section4Type: 'delivery_units',
        section4Items: keyDeliveryUnits,
      };
    }

    if (filterScope === 'user') {
      // In per user view: Section 3 = Key Clients, Section 4 = Key Projects & Tasks
      const keyClients = computeClientsForTasks(scopedTasks);
      const keyProjects = computeProjectsForTasks(scopedTasks);
      const tasksById = new Map(scopedTasks.map(task => [task.id, task]));
      const keyTasks = rankTaskHours(scopedTasks, task => task.id, options)
        .map(hours => ({ ...hours, task: tasksById.get(hours.key)! }));
      return {
        section3Title: 'Key Clients (worked on by this User)',
        section3Type: 'clients',
        section3Items: keyClients,
        section4Title: 'Key Projects & Tasks',
        section4Type: 'projects_and_tasks',
        section4Items: { projects: keyProjects, tasks: keyTasks },
      };
    }

    const tasksByClient = new Map<string, Task[]>();
    for (const task of scopedTasks) {
      const name = clientName(task);
      const clientTasks = tasksByClient.get(name) ?? [];
      clientTasks.push(task);
      tasksByClient.set(name, clientTasks);
    }

    const keyAccounts = computeClientsForTasks(scopedTasks).map(account => ({
      ...account,
      topProjects: computeProjectsForTasks(tasksByClient.get(account.client) ?? []),
    }));
    const keyUnits = computeDeliveryUnits().map(({ memberIds, unitTasks, ...unit }) => ({
      ...unit,
      topClients: computeClientsForTasks(unitTasks, memberIds),
    }));

    return {
      section3Title: 'Key Accounts (Clients & Top Projects)',
      section3Type: 'all_key_accounts',
      section3Items: keyAccounts,
      section4Title: 'Key Delivery Units (Teams & Top Contributors)',
      section4Type: 'all_key_units',
      section4Items: keyUnits,
    };
  }, [filterScope, scopedTasks, scopedMemberIds, users, deliveryUnits, capturedMs]);

  // SECTION 5: Pressure Metrics (Teams with highest average workload score across members)
  const pressureMetrics = useMemo(() => {
    const taskById = new Map<string, Task>(tasks.map(t => [t.id, t]));
    const userById = new Map<string, User>(users.map(u => [u.id, u]));
    const tasksByUserId = groupTasksByAssignee(scopedTasks);

    // Compute workload score for every user once
    const referenceDate = parseLocalDate(reportDate)!;
    const workloadByUserId = new Map<string, ReturnType<typeof calculateUserWorkload>>();
    const userScores = new Map<string, { user: User; score: number; topProjects: Array<{ project: string; score: number }> }>();

    for (const u of scopedUsers) {
      const uTasks = tasksByUserId.get(u.id) || [];
      const breakdown = calculateUserWorkload(uTasks, referenceDate, capturedMs);
      workloadByUserId.set(u.id, breakdown);

      // Group breakdown items by project
      const projMap = new Map<string, number>();
      for (const item of breakdown.items) {
        const t = taskById.get(item.taskId);
        const pName = t?.project?.trim() || 'General';
        projMap.set(pName, (projMap.get(pName) || 0) + item.calculatedScore);
      }

      const topProjects = Array.from(projMap.entries())
        .map(([project, score]) => ({ project, score: Math.round(score * 10) / 10 }))
        .sort((a, b) => b.score - a.score);

      userScores.set(u.id, {
        user: u,
        score: breakdown.totalScore,
        topProjects,
      });
    }

    // Rank delivery units by average workload score
    const rankedUnits = deliveryUnits.map(du => {
      const membersInUnit = du.userIds.map(id => userScores.get(id)).filter(Boolean) as Array<{
        user: User;
        score: number;
        topProjects: Array<{ project: string; score: number }>;
      }>;

      const totalScore = membersInUnit.reduce((acc, m) => acc + m.score, 0);
      const avgScore = membersInUnit.length > 0 ? Math.round((totalScore / membersInUnit.length) * 10) / 10 : 0;

      return {
        unit: du,
        avgScore,
        memberCount: membersInUnit.length,
        members: membersInUnit.sort((a, b) => b.score - a.score),
      };
    }).filter(unit => unit.memberCount > 0).sort((a, b) => b.avgScore - a.avgScore);

    // Contextual rankings:
    if (filterScope === 'project') {
      // Per project view: tasks contributing highest workload scores (reusing per-user breakdowns)
      const scoresByTask = new Map<string, number>();
      for (const breakdown of workloadByUserId.values()) {
        for (const item of breakdown.items) {
          scoresByTask.set(item.taskId, (scoresByTask.get(item.taskId) ?? 0) + item.calculatedScore);
        }
      }
      const projectTasks = scopedTasks.flatMap(task => {
        const score = scoresByTask.get(task.id) ?? 0;
        if (score <= 0) return [];
        const assignees = getTaskAssigneeIds(task).flatMap(id => {
          const user = userById.get(id);
          return user ? [user.name] : [];
        });
        return [{ task, assignees, calculatedScore: score }];
      }).sort((a, b) => b.calculatedScore - a.calculatedScore);

      return {
        mode: 'project_tasks',
        projectTasks,
        rankedUnits,
      };
    }

    if (filterScope === 'user') {
      // Per user view: tasks contributing highest workload scores
      const user = scopedUsers[0];
      const breakdown = user ? (workloadByUserId.get(user.id) || calculateUserWorkload(tasksByUserId.get(user.id) || [], referenceDate, capturedMs)) : calculateUserWorkload([]);
      const userRankedTasks = breakdown.items.map(item => ({
        item,
        task: taskById.get(item.taskId),
        calculatedScore: item.calculatedScore,
      })).sort((a, b) => b.calculatedScore - a.calculatedScore);

      return {
        mode: 'user_tasks',
        userRankedTasks,
        rankedUnits,
      };
    }

    // General or delivery unit view: highest workload members with top projects
    const topMembers = Array.from(userScores.values()).sort((a, b) => b.score - a.score);

    return {
      mode: 'members_with_projects',
      rankedUnits,
      topMembers,
    };
  }, [scopedUsers, scopedTasks, tasks, users, deliveryUnits, filterScope, reportDate, capturedMs]);

  if (!isOpen) return null;
  const { efficiencyPercent, billableHours, estimatedHours } = topMetrics.efficiency;

  return (
    <AnimatePresence>
      <div
        className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto "
        onClick={e => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <DialogPanel aria-label="Workspace analytics" onClose={onClose} busy={false}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-6xl my-auto flex flex-col overflow-hidden"
        >
          {/* Ruled Dialog Header */}
          <div className="dialog-header">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
                Workspace Analytics
              </h2>
              <span className="ledger-badge">
                {isLocked ? (
                  <Lock aria-hidden="true" className="h-3 w-3 shrink-0" />
                ) : (
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400 shrink-0" />
                )}
                <span>{lockLabel}</span>
              </span>
            </div>
            <button type="button" aria-label="Close analytics" onClick={onClose} className="icon-button shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Timeframe Bar & Contextual Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
            {/* Timeframe Presets & Calendar Picker */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="segmented-track">
                <button
                  type="button"
                  aria-pressed={timeframe === 'today'}
                  onClick={() => setTimeframe('today')}
                  className={`segmented-item cursor-pointer ${timeframe === 'today' ? 'segmented-item-active' : ''}`}
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-pressed={timeframe === 'week'}
                  onClick={() => setTimeframe('week')}
                  className={`segmented-item cursor-pointer ${timeframe === 'week' ? 'segmented-item-active' : ''}`}
                >
                  This Week
                </button>
                <button
                  type="button"
                  aria-pressed={timeframe === 'custom'}
                  onClick={() => { setTimeframe('custom'); setIsRangeMode(true); }}
                  className={`segmented-item cursor-pointer ${timeframe === 'custom' ? 'segmented-item-active' : ''}`}
                >
                  Date Range
                </button>
              </div>

              {timeframe === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 bg-[var(--surface)] px-2.5 py-1 rounded-[7px] border border-[var(--border)] text-xs tabular-nums min-w-0 max-w-full">
                  <Calendar className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
                  <label className="flex flex-col gap-1 text-[var(--text-secondary)]">
                    <span>Start date</span>
                  <input
                    type="date"
                    aria-label="Analytics start date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none cursor-pointer"
                    style={{ minHeight: '26px' }}
                  />
                  </label>
                  {isRangeMode ? (
                    <>
                      <label className="flex flex-col gap-1 text-[var(--text-secondary)]">
                        <span>End date</span>
                      <input
                        type="date"
                        aria-label="Analytics end date"
                        value={customEndDate}
                        onChange={e => setCustomEndDate(e.target.value)}
                        className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none cursor-pointer"
                        style={{ minHeight: '26px' }}
                      />
                      </label>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsRangeMode(prev => !prev)}
                    className="text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer pl-1"
                    style={{ minHeight: 'auto' }}
                  >
                    {isRangeMode ? 'Single day' : '+ Range'}
                  </button>
                </div>
              )}
            </div>

            {/* Scope Filter Dropdown */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold">
                Scope:
              </span>
              <div className="relative">
                <select
                  aria-label="Analytics scope"
                  value={filterScope}
                  onChange={e => setFilterScope(e.target.value as AnalyticsScope)}
                  className="field-control !w-auto pr-8 font-semibold cursor-pointer"
                >
                  <option value="all">All Workspace</option>
                  <option value="client">Per Client</option>
                  <option value="delivery_unit">Per Delivery Unit</option>
                  <option value="project">Per Project</option>
                  <option value="user">Per User</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              </div>

              {filterScope === 'client' && (
                <div className="relative">
                  <select
                    aria-label="Analytics client"
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="field-control !w-auto !border-[var(--accent)]/50 pr-8 max-w-[180px] truncate cursor-pointer"
                  >
                    {uniqueClients.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
                </div>
              )}

              {filterScope === 'delivery_unit' && (
                <div className="relative">
                  <select
                    aria-label="Analytics delivery unit"
                    value={selectedDeliveryUnitId}
                    onChange={e => setSelectedDeliveryUnitId(e.target.value)}
                    className="field-control !w-auto !border-[var(--accent)]/50 pr-8 max-w-[180px] truncate cursor-pointer"
                  >
                    {deliveryUnits.map(du => (
                      <option key={du.id} value={du.id}>{du.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
                </div>
              )}

              {filterScope === 'project' && (
                <div className="relative">
                  <select
                    aria-label="Analytics project"
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                    className="field-control !w-auto !border-[var(--accent)]/50 pr-8 max-w-[180px] truncate cursor-pointer"
                  >
                    {uniqueProjects.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
                </div>
              )}

              {filterScope === 'user' && (
                <div className="relative">
                  <select
                    aria-label="Analytics member"
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                    className="field-control !w-auto !border-[var(--accent)]/50 pr-8 max-w-[180px] truncate cursor-pointer"
                  >
                    {users.filter(u => u.role === 'content' || u.role === 'design').map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
                </div>
              )}
            </div>
          </div>

          {/* Modal Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[var(--canvas)] space-y-4">
            {unavailable ? (
              <div className="ledger-frame p-8 text-center space-y-3">
                <p role="status" className="text-xs font-medium text-[var(--text-secondary)]">{unavailable}</p>
                <button
                  type="button"
                  onClick={() => {
                    setTimeframe('today');
                    setIsRangeMode(false);
                  }}
                  className="button-secondary"
                >
                  Jump to Today
                </button>
              </div>
            ) : <>
            {snapshot && (
              <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                Cumulative metrics as of {snapshot.date}.
                {snapshot.date !== end ? ' No snapshot was saved for the end of the selected period.' : ''}
              </p>
            )}
            {!snapshot && requestedDates.length > 1 && (
              <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                Headline utilization, time totals and efficiency are as of {reportDate}. The utilization exceptions below cover remaining selected dates.
              </p>
            )}

            {/* TOP LEDGER FRAME: 4 Hairline-Divided KPI Columns (Zero Nested Shadow Cards) */}
            <section className="ledger-frame" aria-label="Key metrics">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)]">
                {/* Total Employees */}
                <div className="metric-card flex flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="metric-label">Total Employees</span>
                    <Users className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                  </div>
                  <div className="mt-2">
                    <span className="metric-value text-[var(--text-primary)]">
                      {topMetrics.totalEmployees}
                    </span>
                    <p className="metric-detail">Active team members in scope</p>
                  </div>
                </div>

                {/* Total Utilization */}
                <div className="metric-card flex flex-col sm:border-b lg:border-b-0 border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="metric-label">Total Utilization</span>
                    <Activity className={`h-3.5 w-3.5 shrink-0 ${topMetrics.totalUtilization === 0 ? 'text-[var(--text-secondary)]' : 'text-emerald-700 dark:text-emerald-400'}`} />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-2 min-h-[44px]">
                      <span className={`metric-value ${topMetrics.totalUtilization === 0 ? 'text-[var(--text-primary)]' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {topMetrics.totalUtilization}
                        <span className="text-sm font-semibold tracking-normal">%</span>
                      </span>
                      <span className="text-xs tabular-nums text-[var(--text-muted)]">
                        ({topMetrics.totalUtilizedCount}/{topMetrics.totalEmployees})
                      </span>
                    </div>
                    <MetricBar label="Workspace utilization" value={topMetrics.totalUtilization} tone="green" detail={`${topMetrics.totalUtilizedCount} of ${topMetrics.totalEmployees} members assigned at least ${DAILY_UTILIZATION_TARGET_HOURS} hours on ${reportDate}`} />
                    <p className="metric-detail">Assigned {DAILY_UTILIZATION_TARGET_HOURS}h+ on <time dateTime={reportDate} className="whitespace-nowrap">{reportDate}</time></p>
                  </div>
                </div>

                {/* Total Efficiency */}
                <div className="metric-card flex flex-col sm:border-t lg:border-t-0 border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="metric-label">Total Efficiency</span>
                    <MetricHelp label="About total efficiency" detail={efficiencyHelp} />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-2 flex-wrap min-h-[44px]">
                      <span className={`metric-value ${getEfficiencyToneClass(efficiencyPercent)}`}>
                        {efficiencyPercent === null ? '—' : (
                          <>
                            {Math.round(efficiencyPercent)}
                            <span className="text-sm font-semibold tracking-normal">%</span>
                          </>
                        )}
                      </span>
                    </div>
                    {efficiencyPercent !== null && (
                      <MetricBar label="Workspace efficiency" value={efficiencyPercent}
                        tone={efficiencyPercent >= 100 ? 'green' : efficiencyPercent >= 50 ? 'blue' : 'red'}
                        detail={`${Math.round(efficiencyPercent)} percent, with 100 percent on estimate`} />
                    )}
                    <p className="metric-detail">
                      {efficiencyPercent === null
                        ? 'No measured work'
                        : <>{formatHours(estimatedHours)} est. / {formatHours(billableHours)} billable · {estimatedHours === billableHours ? 'On estimate' : `${formatHours(Math.abs(estimatedHours - billableHours))} ${estimatedHours > billableHours ? 'under estimate' : 'over est.'}`}</>}
                    </p>
                  </div>
                </div>

                {/* Top Accounts Graphic Bar */}
                <div className="metric-card flex flex-col sm:border-t lg:border-t-0 border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="metric-label">Top Accounts</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-[var(--text-muted)]">Billed hours</span>
                      <Briefcase className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                    </div>
                  </div>
                  <div className="space-y-2 mt-2">
                    {topMetrics.topAccountsList.slice(0, 3).map((acct, index) => (
                      <div key={acct.key} className="text-xs">
                        <div className={`flex justify-between items-end gap-1.5 text-[11px] mb-2 ${index === 0 ? 'min-h-[44px]' : ''}`}>
                          <span className="font-semibold text-[var(--text-primary)] truncate max-w-[110px]">
                            {acct.key}
                          </span>
                          <span className="text-[11px] tabular-nums text-[var(--text-secondary)] shrink-0">
                            {formatHours(acct.billableHours)} billed
                          </span>
                        </div>
                        <div className="metric-track !mt-0">
                          <div
                            className="metric-fill"
                            style={{ width: `${Math.min(100, (acct.billableHours / topMetrics.topAccountsList[0].billableHours) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {topMetrics.topAccountsList.length === 0 && (
                      <p className="text-xs text-[var(--text-muted)] py-2">No account hours recorded</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 1: UTILIZATION (< 3h/day assigned with dates) */}
            <section className="ledger-frame">
              <div className="ledger-band flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      underutilizedEmployees.length === 0
                        ? 'bg-emerald-600 dark:bg-emerald-400'
                        : 'bg-amber-600 dark:bg-amber-400'
                    }`}
                  />
                  <h3 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">
                    Underutilized Employees (&lt; 3h/day)
                  </h3>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  {underutilizedEmployees.length} member{underutilizedEmployees.length === 1 ? '' : 's'} flagged
                </span>
              </div>

              {underutilizedEmployees.length === 0 ? (
                <div className="py-6 px-4 text-center text-xs text-[var(--text-secondary)] flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>All employees in this scope are assigned at least 3 hours per day.</span>
                </div>
              ) : (
                <div
                  className={`grid grid-cols-1 ${
                    underutilizedEmployees.length === 1
                      ? ''
                      : underutilizedEmployees.length === 2
                      ? 'md:grid-cols-2'
                      : 'md:grid-cols-2 lg:grid-cols-3'
                  }`}
                >
                  {underutilizedEmployees.map((item, idx) => (
                    <div
                      key={item.user.id}
                      className={`p-3.5 flex flex-col justify-between gap-2.5 bg-[var(--surface)] border-[var(--border-subtle)] ${
                        idx > 0 ? 'border-t' : ''
                      } ${
                        underutilizedEmployees.length >= 2 && idx < 2 ? 'md:border-t-0' : ''
                      } ${
                        underutilizedEmployees.length >= 3 && idx < 3 ? 'lg:border-t-0' : ''
                      } ${
                        underutilizedEmployees.length >= 2 && idx % 2 === 0 && idx < underutilizedEmployees.length - 1
                          ? 'md:border-r'
                          : ''
                      } ${
                        underutilizedEmployees.length >= 3
                          ? idx % 3 !== 2
                            ? 'lg:border-r'
                            : 'lg:border-r-0'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`h-7 w-7 shrink-0 rounded-[6px] flex items-center justify-center text-xs font-semibold text-white bg-gradient-to-tr ${item.user.avatarColor || 'from-blue-600 to-indigo-600'}`}>
                            {item.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            {onJumpToMember ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onJumpToMember(item.user);
                                }}
                                title={`Jump to ${item.user.name}'s swimlane`}
                                className="text-left text-xs font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline truncate block max-w-full cursor-pointer !min-h-0 !py-0 leading-tight"
                              >
                                {item.user.name}
                              </button>
                            ) : (
                              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                {item.user.name}
                              </p>
                            )}
                            <p className="text-[11px] text-[var(--text-secondary)] truncate">
                              {getUserTag(item.user).label}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400 shrink-0">
                          {formatHours(item.avgAssigned)}/d
                        </span>
                      </div>

                      <div className="text-[11px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
                        <span className="font-semibold text-[var(--text-secondary)] block mb-1">Underutilized Dates</span>
                        <div className="flex flex-wrap gap-1 tabular-nums">
                          {item.dates.slice(0, 4).map(d => (
                            <span key={d} className="ledger-badge !font-medium">
                              {formatDateOnly(d)}
                            </span>
                          ))}
                          {item.dates.length > 4 && (
                            <span className="ledger-badge !font-medium">
                              +{item.dates.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* SECTION 2: EFFICIENCY (< 50% with dates) */}
            <section className="ledger-frame">
              <div className="ledger-band flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      lowEfficiencyEmployees.length === 0
                        ? 'bg-emerald-600 dark:bg-emerald-400'
                        : 'bg-red-600 dark:bg-red-400'
                    }`}
                  />
                  <h3 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">
                    Low Efficiency Threshold (&lt; 50%)
                  </h3>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  {lowEfficiencyEmployees.length} member{lowEfficiencyEmployees.length === 1 ? '' : 's'} flagged
                </span>
              </div>

              {lowEfficiencyEmployees.length === 0 ? (
                <div className="py-6 px-4 text-center text-xs text-[var(--text-secondary)] flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>No measured efficiency scores below 50%.</span>
                </div>
              ) : (
                <div
                  className={`grid grid-cols-1 ${
                    lowEfficiencyEmployees.length === 1
                      ? ''
                      : lowEfficiencyEmployees.length === 2
                      ? 'md:grid-cols-2'
                      : 'md:grid-cols-2 lg:grid-cols-3'
                  }`}
                >
                  {lowEfficiencyEmployees.map((item, idx) => (
                    <div
                      key={item.user.id}
                      className={`p-3.5 flex flex-col justify-between gap-2.5 bg-[var(--surface)] border-[var(--border-subtle)] ${
                        idx > 0 ? 'border-t' : ''
                      } ${
                        lowEfficiencyEmployees.length >= 2 && idx < 2 ? 'md:border-t-0' : ''
                      } ${
                        lowEfficiencyEmployees.length >= 3 && idx < 3 ? 'lg:border-t-0' : ''
                      } ${
                        lowEfficiencyEmployees.length >= 2 && idx % 2 === 0 && idx < lowEfficiencyEmployees.length - 1
                          ? 'md:border-r'
                          : ''
                      } ${
                        lowEfficiencyEmployees.length >= 3
                          ? idx % 3 !== 2
                            ? 'lg:border-r'
                            : 'lg:border-r-0'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`h-7 w-7 shrink-0 rounded-[6px] flex items-center justify-center text-xs font-semibold text-white bg-gradient-to-tr ${item.user.avatarColor || 'from-blue-600 to-indigo-600'}`}>
                            {item.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            {onJumpToMember ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onJumpToMember(item.user);
                                }}
                                title={`Jump to ${item.user.name}'s swimlane`}
                                className="text-left text-xs font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline truncate block max-w-full cursor-pointer !min-h-0 !py-0 leading-tight"
                              >
                                {item.user.name}
                              </button>
                            ) : (
                              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                {item.user.name}
                              </p>
                            )}
                            <p className="text-[11px] text-[var(--text-secondary)] truncate">
                              {getUserTag(item.user).label}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span className="text-xs font-bold text-red-600 dark:text-red-400 block">
                            {Math.round(item.efficiencyPercent)}%
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)]" title="Estimated / Billable hours">
                            {formatHoursRatio(item.timeEstimated, item.timeTaken)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
                        <span className="font-semibold text-[var(--text-secondary)] block mb-1">Efficiency as of</span>
                        <div className="flex flex-wrap gap-1 tabular-nums">
                          {item.dates.slice(0, 4).map(d => (
                            <span key={d} className="ledger-badge !font-medium">
                              {formatDateOnly(d)}
                            </span>
                          ))}
                          {item.dates.length > 4 && (
                            <span className="ledger-badge !font-medium">
                              +{item.dates.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* SECTIONS 3 & 4: CONTEXTUAL KEY ACCOUNTS & KEY DELIVERY UNITS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {/* Left Column: Section 3 */}
              <section className="ledger-frame flex flex-col">
                <div className="ledger-band flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
                    <h3 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)] truncate">
                      {sections3And4Data.section3Title}
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-[var(--text-muted)] shrink-0">Est / Bill</span>
                </div>

                <div className="divide-y divide-[var(--border-subtle)] max-h-72 overflow-y-auto bg-[var(--surface)]">
                  {sections3And4Data.section3Type === 'all_key_accounts' && (
                    (sections3And4Data.section3Items as any[]).map(item => (
                      <div key={item.client} className="px-4 py-2.5 text-xs hover:bg-[var(--surface-muted)] transition-colors">
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-semibold text-[var(--text-primary)] truncate">
                            {item.client}
                          </span>
                          <span className="font-semibold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">
                            {formatEstBill(item.estimatedHours, item.billableHours)}
                          </span>
                        </div>
                        {item.topProjects && item.topProjects.length > 0 && (
                          <div className="mt-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                            <span className="font-medium text-[var(--text-muted)]">Projects: </span>
                            {item.topProjects.slice(0, 3).map((p: any, idx: number) => (
                              <span key={p.project}>
                                {idx > 0 && <span className="text-[var(--text-muted)] mx-1">·</span>}
                                {p.project} ({formatEstBill(p.estimatedHours, p.billableHours)})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {sections3And4Data.section3Type === 'delivery_units' && (
                    (sections3And4Data.section3Items as any[]).map(item => (
                      <div key={item.du.id} className="px-4 py-2.5 text-xs flex justify-between items-center gap-2 hover:bg-[var(--surface-muted)] transition-colors">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {item.du.name}
                        </span>
                        <span className="font-semibold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">
                          {formatEstBill(item.estimatedHours, item.billableHours)}
                        </span>
                      </div>
                    ))
                  )}

                  {sections3And4Data.section3Type === 'clients' && (
                    (sections3And4Data.section3Items as any[]).map(item => (
                      <div key={item.client} className="px-4 py-2.5 text-xs flex justify-between items-center gap-2 hover:bg-[var(--surface-muted)] transition-colors">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {item.client}
                        </span>
                        <span className="font-semibold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">
                          {formatEstBill(item.estimatedHours, item.billableHours)}
                        </span>
                      </div>
                    ))
                  )}

                  {sections3And4Data.section3Items.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] py-6 text-center">No matching entities found in scope.</p>
                  )}
                </div>
              </section>

              {/* Right Column: Section 4 */}
              <section className="ledger-frame flex flex-col">
                <div className="ledger-band flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderGit2 className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400 shrink-0" />
                    <h3 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)] truncate">
                      {sections3And4Data.section4Title}
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-[var(--text-muted)] shrink-0">Est / Bill</span>
                </div>

                <div className="divide-y divide-[var(--border-subtle)] max-h-72 overflow-y-auto bg-[var(--surface)]">
                  {sections3And4Data.section4Type === 'all_key_units' && (
                    (sections3And4Data.section4Items as any[]).map(item => (
                      <div key={item.du.id} className="px-4 py-2.5 text-xs hover:bg-[var(--surface-muted)] transition-colors">
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-semibold text-[var(--text-primary)] truncate">
                            {item.du.name}
                          </span>
                          <span className="font-semibold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">
                            {formatEstBill(item.estimatedHours, item.billableHours)}
                          </span>
                        </div>
                        {item.topClients && item.topClients.length > 0 && (
                          <div className="mt-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                            <span className="font-medium text-[var(--text-muted)]">Clients: </span>
                            {item.topClients.slice(0, 2).map((c: any, idx: number) => (
                              <span key={c.client}>
                                {idx > 0 && <span className="text-[var(--text-muted)] mx-1">·</span>}
                                {c.client} ({formatEstBill(c.estimatedHours, c.billableHours)})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {sections3And4TypeMatchesProjects(sections3And4Data.section4Type) && (
                    (sections3And4Data.section4Items as any[]).map(item => (
                      <div key={item.project} className="px-4 py-2.5 text-xs flex justify-between items-center gap-2 hover:bg-[var(--surface-muted)] transition-colors">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {item.project}
                        </span>
                        <span className="font-semibold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">
                          {formatEstBill(item.estimatedHours, item.billableHours)}
                        </span>
                      </div>
                    ))
                  )}

                  {sections3And4Data.section4Type === 'delivery_units' && (
                    (sections3And4Data.section4Items as any[]).map(item => (
                      <div key={item.du.id} className="px-4 py-2.5 text-xs flex justify-between items-center gap-2 hover:bg-[var(--surface-muted)] transition-colors">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {item.du.name}
                        </span>
                        <span className="font-semibold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">
                          {formatEstBill(item.estimatedHours, item.billableHours)}
                        </span>
                      </div>
                    ))
                  )}

                  {sections3And4Data.section4Type === 'projects_and_tasks' && (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      <div className="px-4 py-2.5 space-y-1">
                        <span className="metric-label block mb-1.5">Key Projects</span>
                        {(sections3And4Data.section4Items as any).projects.slice(0, 3).map((p: any) => (
                          <div key={p.project} className="flex justify-between items-center py-0.5 text-xs gap-2">
                            <span className="truncate text-[var(--text-primary)]">{p.project}</span>
                            <span className="font-semibold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">{formatEstBill(p.estimatedHours, p.billableHours)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-2.5 space-y-1">
                        <span className="metric-label block mb-1.5">Key Tasks</span>
                        {(sections3And4Data.section4Items as any).tasks.slice(0, 4).map((t: any) => (
                          <div key={t.task.id} className="flex justify-between items-center py-0.5 text-xs gap-2">
                            <span className="truncate max-w-[240px] text-[var(--text-primary)]">{t.task.title}</span>
                            <span className="font-semibold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">{formatEstBill(t.estimatedHours, t.billableHours)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(Array.isArray(sections3And4Data.section4Items) ? sections3And4Data.section4Items.length === 0 : ((sections3And4Data.section4Items as any).projects.length === 0 && (sections3And4Data.section4Items as any).tasks.length === 0)) && (
                    <p className="text-xs text-[var(--text-muted)] py-6 text-center">No matching entities found in scope.</p>
                  )}
                </div>
              </section>
            </div>

            {/* SECTION 5: PRESSURE METRICS */}
            <section className="ledger-frame">
              <div className="ledger-band flex items-center gap-2 px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-[#1d4ed8] dark:bg-blue-400 shrink-0" />
                <h3 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">
                  Pressure Metrics &amp; Workload Rankings
                </h3>
              </div>

              {/* Mode: Members with Projects */}
              {pressureMetrics.mode === 'members_with_projects' && (
                <div className="divide-y divide-[var(--border-subtle)] bg-[var(--surface)]">
                  {/* Team Averages Hairline Strip */}
                  {pressureMetrics.rankedUnits && pressureMetrics.rankedUnits.length > 0 && (
                    <div>
                      <div className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Team Workload Averages
                      </div>
                      {(() => {
                        const topUnits = pressureMetrics.rankedUnits.slice(0, 4);
                        return (
                          <div
                            className={`grid border-t border-[var(--border-subtle)] ${
                              topUnits.length === 1
                                ? 'grid-cols-1'
                                : topUnits.length === 2
                                ? 'grid-cols-2'
                                : topUnits.length === 3
                                ? 'grid-cols-1 sm:grid-cols-3'
                                : 'grid-cols-2 sm:grid-cols-4'
                            }`}
                          >
                            {topUnits.map((item, idx) => (
                              <div
                                key={item.unit.id}
                                className={`px-4 py-3 text-xs border-[var(--border-subtle)] ${
                                  topUnits.length === 3 && idx > 0 ? 'border-t sm:border-t-0' : ''
                                } ${
                                  topUnits.length === 4 && idx >= 2 ? 'border-t sm:border-t-0' : ''
                                } ${
                                  (topUnits.length === 2 || topUnits.length === 4) && idx % 2 === 0 ? 'border-r' : ''
                                } ${
                                  idx < topUnits.length - 1 ? 'sm:border-r' : 'sm:border-r-0'
                                }`}
                              >
                                <p className="font-semibold text-[var(--text-primary)] truncate">{item.unit.name}</p>
                                <div className="flex items-baseline gap-1.5 mt-1 tabular-nums">
                                  <span className={`text-base font-bold ${item.avgScore >= 12 ? 'text-red-600 dark:text-red-400' : item.avgScore >= 8 ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--text-primary)]'}`}>
                                    {item.avgScore} points
                                  </span>
                                  <span className="text-[11px] text-[var(--text-muted)]">avg</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Highest Workload Members */}
                  <div>
                    <div className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Members with Highest Workload Scores &amp; Top Projects
                    </div>
                    {(() => {
                      const topMembers = pressureMetrics.topMembers?.slice(0, 6) || [];
                      return (
                        <div
                          className={`grid grid-cols-1 border-t border-[var(--border-subtle)] ${
                            topMembers.length === 1
                              ? ''
                              : topMembers.length === 2
                              ? 'md:grid-cols-2'
                              : 'md:grid-cols-2 lg:grid-cols-3'
                          }`}
                        >
                          {topMembers.map((item, idx) => (
                            <div
                              key={item.user.id}
                              className={`p-3.5 text-xs border-[var(--border-subtle)] ${
                                idx > 0 ? 'border-t' : ''
                              } ${
                                topMembers.length >= 2 && idx < 2 ? 'md:border-t-0' : ''
                              } ${
                                topMembers.length >= 3 && idx < 3 ? 'lg:border-t-0' : ''
                              } ${
                                topMembers.length >= 2 && idx % 2 === 0 && idx < topMembers.length - 1
                                  ? 'md:border-r'
                                  : ''
                              } ${
                                topMembers.length >= 3
                                  ? idx % 3 !== 2
                                    ? 'lg:border-r'
                                    : 'lg:border-r-0'
                                  : ''
                              }`}
                            >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`h-6 w-6 shrink-0 rounded-[5px] flex items-center justify-center text-[11px] font-semibold text-white bg-gradient-to-tr ${item.user.avatarColor || 'from-blue-600 to-indigo-600'}`}>
                                {item.user.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-semibold text-[var(--text-primary)] truncate">
                                {item.user.name}
                              </span>
                            </div>
                            {item.score >= 12 ? (
                              <span className="ledger-alert-badge shrink-0">
                                {item.score} points
                              </span>
                            ) : (
                              <span className={`font-bold tabular-nums text-xs shrink-0 ${
                                item.score >= 8
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-[#1d4ed8] dark:text-blue-400'
                              }`}>
                                {item.score} points
                              </span>
                            )}
                          </div>
                          {item.topProjects.length > 0 && (
                            <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] space-y-0.5 tabular-nums">
                              {item.topProjects.slice(0, 2).map(p => (
                                <div key={p.project} className="flex justify-between items-center gap-2">
                                  <span className="truncate">{p.project}</span>
                                  <span className="font-semibold text-[var(--text-primary)] shrink-0">{p.score} points</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Mode: Project Tasks */}
              {pressureMetrics.mode === 'project_tasks' && (
                <div className="divide-y divide-[var(--border-subtle)] max-h-72 overflow-y-auto bg-[var(--surface)]">
                  {pressureMetrics.projectTasks?.map(pt => (
                    <div key={pt.task.id} className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-[var(--surface-muted)] transition-colors">
                      <div className="min-w-0 pr-3">
                        <p className="font-semibold text-[var(--text-primary)] truncate">{pt.task.title}</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {pt.assignees.join(', ')} · {formatTaskStatus(pt.task.status)}
                        </p>
                      </div>
                      <span className="font-bold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">
                        {Math.round(pt.calculatedScore * 100) / 100} points
                      </span>
                    </div>
                  ))}
                  {pressureMetrics.projectTasks?.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] py-6 text-center">No active workload points in this project.</p>
                  )}
                </div>
              )}

              {/* Mode: User Tasks */}
              {pressureMetrics.mode === 'user_tasks' && (
                <div className="divide-y divide-[var(--border-subtle)] max-h-72 overflow-y-auto bg-[var(--surface)]">
                  {pressureMetrics.userRankedTasks?.map(ut => (
                    <div key={ut.item.taskId} className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-[var(--surface-muted)] transition-colors">
                      <div className="min-w-0 pr-3">
                        <p className="font-semibold text-[var(--text-primary)] truncate">{ut.item.title}</p>
                        <p className="text-[11px] text-[var(--text-secondary)] tabular-nums mt-0.5">
                          {formatTaskStatus(ut.item.status)} · {ut.item.cognitiveLoad} load · Due {ut.item.dueDate || 'None'}
                        </p>
                      </div>
                      <span className="font-bold tabular-nums text-[#1d4ed8] dark:text-blue-400 shrink-0">
                        {Math.round(ut.calculatedScore * 100) / 100} points
                      </span>
                    </div>
                  ))}
                  {pressureMetrics.userRankedTasks?.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] py-6 text-center">No active tasks contributing to workload.</p>
                  )}
                </div>
              )}
            </section>

            </>}
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              onClick={onClose}
              className="button-secondary"
            >
              Close
            </button>
          </div>
        </DialogPanel>
      </div>
    </AnimatePresence>
  );
};

function sections3And4TypeMatchesProjects(type: string): boolean {
  return type === 'projects';
}
