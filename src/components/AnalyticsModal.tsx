import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { User, Task, AnalyticsScope, AnalyticsTimeframe } from '../types';
import {
  calculateTeamUtilization,
  calculateTasksEfficiency,
  formatHoursRatio,
  getDeliveryUnits,
  getUserDeliveryUnit,
  getTaskBillableMs,
  calculateUserWorkload,
  getUserTag,
  getUserDailyAssignedHours,
  isWorkingDay,
  DeliveryUnitInfo,
} from '../utils/workload';
import {
  X,
  Calendar,
  Lock,
  Unlock,
  Users,
  TrendingUp,
  Activity,
  Layers,
  Building2,
  FolderGit2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Briefcase,
  ChevronDown,
  BarChart3,
  Timer,
  Zap,
} from 'lucide-react';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose }) => {
  const { users, tasks, creativeDirectors } = useDashboard();

  // Active time frame & calendar state
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>('today');
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isRangeMode, setIsRangeMode] = useState<boolean>(false);

  // Filter Scope State
  const [filterScope, setFilterScope] = useState<AnalyticsScope>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedDeliveryUnitId, setSelectedDeliveryUnitId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

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
    if (filterScope === 'client' && !selectedClientId && uniqueClients.length > 0) {
      setSelectedClientId(uniqueClients[0]);
    } else if (filterScope === 'delivery_unit' && !selectedDeliveryUnitId && deliveryUnits.length > 0) {
      setSelectedDeliveryUnitId(deliveryUnits[0].id);
    } else if (filterScope === 'project' && !selectedProjectId && uniqueProjects.length > 0) {
      setSelectedProjectId(uniqueProjects[0]);
    } else if (filterScope === 'user' && !selectedUserId && users.length > 0) {
      setSelectedUserId(users[0].id);
    }
  }, [filterScope, uniqueClients, deliveryUnits, uniqueProjects, users, selectedClientId, selectedDeliveryUnitId, selectedProjectId, selectedUserId]);

  // Compute active date range [startDate, endDate]
  const { dateRange, isLocked, lockLabel } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (timeframe === 'today') {
      const isPast2359 = now.getHours() === 23 && now.getMinutes() >= 59;
      return {
        dateRange: [todayStr],
        isLocked: isPast2359,
        lockLabel: isPast2359 ? 'Locked at 11:59 PM today' : 'Live · Locks at 11:59 PM today',
      };
    }

    if (timeframe === 'week') {
      // Find Monday of current week
      const d = new Date(now);
      const day = d.getDay();
      const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diffToMon));
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const cur = new Date(monday);
        cur.setDate(cur.getDate() + i);
        dates.push(cur.toISOString().slice(0, 10));
      }

      const isSundayPast2359 = now.getDay() === 0 && now.getHours() === 23 && now.getMinutes() >= 59;
      return {
        dateRange: dates,
        isLocked: isSundayPast2359,
        lockLabel: isSundayPast2359 ? 'Locked at 11:59 PM Sunday' : 'Live · Locks Sunday 11:59 PM',
      };
    }

    // Custom calendar tool
    const start = new Date(customDate);
    const end = isRangeMode ? new Date(customEndDate) : new Date(customDate);
    const dates: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    const isHistorical = end.toISOString().slice(0, 10) < todayStr || (end.toISOString().slice(0, 10) === todayStr && now.getHours() === 23 && now.getMinutes() >= 59);
    return {
      dateRange: dates,
      isLocked: isHistorical,
      lockLabel: isHistorical ? 'Locked Historical Snapshot' : 'Live · Locks at 11:59 PM',
    };
  }, [timeframe, customDate, customEndDate, isRangeMode]);

  // Filter tasks and users based on active scope
  const { scopedUsers, scopedTasks } = useMemo(() => {
    let uList = users;
    let tList = tasks;

    if (filterScope === 'client' && selectedClientId) {
      tList = tasks.filter(t => t.client === selectedClientId);
      const clientUserIds = new Set(tList.map(t => t.userId));
      uList = users.filter(u => clientUserIds.has(u.id));
    } else if (filterScope === 'delivery_unit' && selectedDeliveryUnitId) {
      const du = deliveryUnits.find(d => d.id === selectedDeliveryUnitId);
      if (du) {
        const duUserIds = new Set(du.userIds);
        uList = users.filter(u => duUserIds.has(u.id));
        tList = tasks.filter(t => duUserIds.has(t.userId));
      }
    } else if (filterScope === 'project' && selectedProjectId) {
      tList = tasks.filter(t => t.project === selectedProjectId);
      const projUserIds = new Set(tList.map(t => t.userId));
      uList = users.filter(u => projUserIds.has(u.id));
    } else if (filterScope === 'user' && selectedUserId) {
      uList = users.filter(u => u.id === selectedUserId);
      tList = tasks.filter(t => t.userId === selectedUserId);
    }

    return { scopedUsers: uList, scopedTasks: tList };
  }, [users, tasks, filterScope, selectedClientId, selectedDeliveryUnitId, selectedProjectId, selectedUserId, deliveryUnits]);

  // SECTION 1: Total Employees, Total Utilization, Total Efficiency, Top Accounts (Graphically at Top)
  const topMetrics = useMemo(() => {
    const totalEmployees = scopedUsers.length;

    // Total utilization across dateRange
    let totalUtilizedCount = 0;
    for (const u of scopedUsers) {
      const assigned = getUserDailyAssignedHours(u, scopedTasks);
      if (assigned > 3) {
        totalUtilizedCount++;
      }
    }
    const totalUtilization = totalEmployees > 0 ? Math.round((totalUtilizedCount / totalEmployees) * 100) : 0;

    // Total efficiency
    const { efficiencyPercent, totalTimeTakenHours, totalEstimatedHours } = calculateTasksEfficiency(scopedTasks);

    // Top accounts (ranked by higher of billable or estimated)
    const clientMap = new Map<string, { billableMs: number; estimatedHours: number }>();
    for (const t of scopedTasks) {
      const clientName = t.client?.trim() || 'Internal / Unassigned';
      const existing = clientMap.get(clientName) || { billableMs: 0, estimatedHours: 0 };
      existing.billableMs += getTaskBillableMs(t);
      if (t.estimatedHours) existing.estimatedHours += t.estimatedHours;
      clientMap.set(clientName, existing);
    }

    const topAccountsList = Array.from(clientMap.entries()).map(([client, data]) => {
      const billableH = Math.round((data.billableMs / 3600000) * 10) / 10;
      const estH = Math.round(data.estimatedHours * 10) / 10;
      const keyH = Math.max(billableH, estH);
      return { client, billableHours: billableH, estimatedHours: estH, keyHours: keyH };
    }).sort((a, b) => b.keyHours - a.keyHours);

    const maxAccountHours = topAccountsList.length > 0 ? Math.max(...topAccountsList.map(a => a.keyHours), 1) : 1;

    return {
      totalEmployees,
      totalUtilizedCount,
      totalUtilization,
      efficiencyPercent,
      totalTimeTakenHours,
      totalEstimatedHours,
      topAccountsList,
      maxAccountHours,
    };
  }, [scopedUsers, scopedTasks]);

  // SECTION 1: Underutilized Employees (< 3 hours per day assigned) with dates
  const underutilizedEmployees = useMemo(() => {
    const result: Array<{
      user: User;
      avgAssigned: number;
      dates: string[];
    }> = [];

    for (const u of scopedUsers) {
      const underutilizedDates: string[] = [];
      let totalAssigned = 0;

      for (const dateStr of dateRange) {
        const d = new Date(dateStr);
        // Only evaluate working days
        if (!isWorkingDay(d) && dateRange.length > 1) continue;
        const dailyAssigned = getUserDailyAssignedHours(u, tasks, d);
        totalAssigned += dailyAssigned;
        if (dailyAssigned < 3) {
          underutilizedDates.push(dateStr);
        }
      }

      if (underutilizedDates.length > 0) {
        const avg = dateRange.length > 0 ? Math.round((totalAssigned / dateRange.length) * 10) / 10 : 0;
        result.push({
          user: u,
          avgAssigned: avg,
          dates: underutilizedDates,
        });
      }
    }

    return result.sort((a, b) => a.avgAssigned - b.avgAssigned);
  }, [scopedUsers, tasks, dateRange]);

  // SECTION 2: Low Efficiency Employees (< 50%) with dates
  const lowEfficiencyEmployees = useMemo(() => {
    const result: Array<{
      user: User;
      efficiencyPercent: number;
      timeTaken: number;
      timeEstimated: number;
      dates: string[];
    }> = [];

    for (const u of scopedUsers) {
      const uTasks = scopedTasks.filter(t => t.userId === u.id);
      const { efficiencyPercent, totalTimeTakenHours, totalEstimatedHours } = calculateTasksEfficiency(uTasks);

      // Check dates within timeframe
      const lowDates: string[] = [];
      for (const dateStr of dateRange) {
        // If user has low efficiency overall, mark the dates within the selected range
        if (efficiencyPercent < 50) {
          lowDates.push(dateStr);
        }
      }

      if (efficiencyPercent < 50 && (totalEstimatedHours > 0 || totalTimeTakenHours > 0)) {
        result.push({
          user: u,
          efficiencyPercent,
          timeTaken: totalTimeTakenHours,
          timeEstimated: totalEstimatedHours,
          dates: lowDates,
        });
      }
    }

    return result.sort((a, b) => a.efficiencyPercent - b.efficiencyPercent);
  }, [scopedUsers, scopedTasks, dateRange]);

  // SECTIONS 3 & 4: Key Accounts & Key Delivery Units (Contextually Adjusted by Filter)
  const sections3And4Data = useMemo(() => {
    // Helper to calculate key metric and projects for a task list
    const computeProjectsForTasks = (taskList: Task[]) => {
      const map = new Map<string, { billableMs: number; estimatedHours: number }>();
      for (const t of taskList) {
        const pName = t.project?.trim() || 'General / Unnamed';
        const existing = map.get(pName) || { billableMs: 0, estimatedHours: 0 };
        existing.billableMs += getTaskBillableMs(t);
        if (t.estimatedHours) existing.estimatedHours += t.estimatedHours;
        map.set(pName, existing);
      }
      return Array.from(map.entries()).map(([project, d]) => {
        const b = Math.round((d.billableMs / 3600000) * 10) / 10;
        const e = Math.round(d.estimatedHours * 10) / 10;
        return { project, billableHours: b, estimatedHours: e, keyHours: Math.max(b, e) };
      }).sort((a, b) => b.keyHours - a.keyHours);
    };

    // Helper to calculate clients for a task list
    const computeClientsForTasks = (taskList: Task[]) => {
      const map = new Map<string, { billableMs: number; estimatedHours: number }>();
      for (const t of taskList) {
        const cName = t.client?.trim() || 'Internal / Unassigned';
        const existing = map.get(cName) || { billableMs: 0, estimatedHours: 0 };
        existing.billableMs += getTaskBillableMs(t);
        if (t.estimatedHours) existing.estimatedHours += t.estimatedHours;
        map.set(cName, existing);
      }
      return Array.from(map.entries()).map(([client, d]) => {
        const b = Math.round((d.billableMs / 3600000) * 10) / 10;
        const e = Math.round(d.estimatedHours * 10) / 10;
        return { client, billableHours: b, estimatedHours: e, keyHours: Math.max(b, e) };
      }).sort((a, b) => b.keyHours - a.keyHours);
    };

    // Helper to calculate delivery units for a task list
    const computeDeliveryUnitsForTasks = (taskList: Task[]) => {
      const map = new Map<string, { du: DeliveryUnitInfo; billableMs: number; estimatedHours: number }>();
      for (const t of taskList) {
        const user = users.find(u => u.id === t.userId);
        if (!user) continue;
        const du = getUserDeliveryUnit(user, deliveryUnits) || {
          id: 'unit-general',
          name: 'General Team',
          type: 'general' as const,
          userIds: [user.id],
        };
        const existing = map.get(du.id) || { du, billableMs: 0, estimatedHours: 0 };
        existing.billableMs += getTaskBillableMs(t);
        if (t.estimatedHours) existing.estimatedHours += t.estimatedHours;
        map.set(du.id, existing);
      }
      return Array.from(map.values()).map(d => {
        const b = Math.round((d.billableMs / 3600000) * 10) / 10;
        const e = Math.round(d.estimatedHours * 10) / 10;
        return { du: d.du, billableHours: b, estimatedHours: e, keyHours: Math.max(b, e) };
      }).sort((a, b) => b.keyHours - a.keyHours);
    };

    // Helper to compute tasks
    const computeKeyTasks = (taskList: Task[]) => {
      return taskList.map(t => {
        const b = Math.round((getTaskBillableMs(t) / 3600000) * 10) / 10;
        const e = Math.round((t.estimatedHours || 0) * 10) / 10;
        return { task: t, billableHours: b, estimatedHours: e, keyHours: Math.max(b, e) };
      }).sort((a, b) => b.keyHours - a.keyHours);
    };

    if (filterScope === 'client') {
      // In per client view: Section 3 = Key Delivery Units, Section 4 = Key Projects
      const keyDeliveryUnits = computeDeliveryUnitsForTasks(scopedTasks);
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
      const keyDeliveryUnits = computeDeliveryUnitsForTasks(scopedTasks);
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
      const keyTasks = computeKeyTasks(scopedTasks);
      return {
        section3Title: 'Key Clients (worked on by this User)',
        section3Type: 'clients',
        section3Items: keyClients,
        section4Title: 'Key Projects & Tasks',
        section4Type: 'projects_and_tasks',
        section4Items: { projects: keyProjects, tasks: keyTasks },
      };
    }

    // Default 'all' view:
    // Section 3: Key Accounts (Clients with projects)
    // Section 4: Key Delivery Units (Units with clients and projects)
    const keyAccounts = computeClientsForTasks(tasks).map(c => {
      const clientTasks = tasks.filter(t => (t.client?.trim() || 'Internal / Unassigned') === c.client);
      const topProjects = computeProjectsForTasks(clientTasks);
      return { ...c, topProjects };
    });

    const keyUnits = computeDeliveryUnitsForTasks(tasks).map(u => {
      const unitTasks = tasks.filter(t => {
        const member = users.find(usr => usr.id === t.userId);
        return member && u.du.userIds.includes(member.id);
      });
      const topClients = computeClientsForTasks(unitTasks);
      const topProjects = computeProjectsForTasks(unitTasks);
      return { ...u, topClients, topProjects };
    });

    return {
      section3Title: 'Section 3: Key Accounts (Clients & Top Projects)',
      section3Type: 'all_key_accounts',
      section3Items: keyAccounts,
      section4Title: 'Section 4: Key Delivery Units (Teams & Top Contributors)',
      section4Type: 'all_key_units',
      section4Items: keyUnits,
    };
  }, [filterScope, scopedTasks, tasks, users, deliveryUnits]);

  // SECTION 5: Pressure Metrics (Teams with highest average workload score across members)
  const pressureMetrics = useMemo(() => {
    // Compute workload score for every user
    const userScores = new Map<string, { user: User; score: number; topProjects: Array<{ project: string; score: number }> }>();

    for (const u of scopedUsers) {
      const uTasks = tasks.filter(t => t.userId === u.id);
      const breakdown = calculateUserWorkload(uTasks);

      // Group breakdown items by project
      const projMap = new Map<string, number>();
      for (const item of breakdown.items) {
        const t = tasks.find(tsk => tsk.id === item.taskId);
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
    }).sort((a, b) => b.avgScore - a.avgScore);

    // Contextual rankings:
    if (filterScope === 'project') {
      // Per project view: tasks contributing highest workload scores
      const projectTasks = scopedTasks.map(t => {
        const u = users.find(usr => usr.id === t.userId);
        const uTasks = tasks.filter(tsk => tsk.userId === t.userId);
        const breakdown = calculateUserWorkload(uTasks);
        const scoreItem = breakdown.items.find(i => i.taskId === t.id);
        const score = scoreItem ? scoreItem.calculatedScore : 1.5;
        return {
          task: t,
          user: u,
          calculatedScore: score,
        };
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
      const uTasks = tasks.filter(t => t.userId === user?.id);
      const breakdown = calculateUserWorkload(uTasks);
      const userRankedTasks = breakdown.items.map(item => {
        const t = tasks.find(tsk => tsk.id === item.taskId);
        return {
          item,
          task: t,
          calculatedScore: item.calculatedScore,
        };
      }).sort((a, b) => b.calculatedScore - a.calculatedScore);

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
  }, [scopedUsers, scopedTasks, tasks, users, deliveryUnits, filterScope]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-black/70 backdrop-blur-sm"
        onClick={e => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] shadow-2xl overflow-hidden text-neutral-900 dark:text-white"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-neutral-200 dark:border-white/10 bg-neutral-50/70 dark:bg-[#141414]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-xs shrink-0">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
                    Executive Workspace Analytics
                  </h2>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    isLocked
                      ? 'bg-neutral-100 dark:bg-white/5 border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-white/60'
                      : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 animate-pulse'
                  }`}>
                    {isLocked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                    <span>{lockLabel}</span>
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-white/40">
                  Realtime utilization, efficiency thresholds, key accounts & pressure metrics.
                </p>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="self-start sm:self-center rounded-xl p-2 text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Timeframe Bar & Contextual Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-neutral-200 dark:border-white/10 bg-neutral-100/50 dark:bg-[#111111]">
            {/* Timeframe Presets & Calendar Picker */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-xl bg-white dark:bg-[#1A1A1A] p-1 border border-neutral-200 dark:border-white/10 text-xs shadow-xs">
                <button
                  type="button"
                  onClick={() => setTimeframe('today')}
                  className={`rounded-lg px-3 py-1 font-semibold transition-all cursor-pointer ${
                    timeframe === 'today'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setTimeframe('week')}
                  className={`rounded-lg px-3 py-1 font-semibold transition-all cursor-pointer ${
                    timeframe === 'week'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={() => setTimeframe('custom')}
                  className={`rounded-lg px-3 py-1 font-semibold transition-all cursor-pointer ${
                    timeframe === 'custom'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  Calendar Tool
                </button>
              </div>

              {/* Calendar Date Picker Tool */}
              {timeframe === 'custom' && (
                <div className="flex items-center gap-2 bg-white dark:bg-[#1A1A1A] px-2.5 py-1 rounded-xl border border-neutral-200 dark:border-white/10 shadow-xs text-xs">
                  <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    className="bg-transparent text-xs text-neutral-800 dark:text-white focus:outline-none cursor-pointer"
                  />
                  {isRangeMode ? (
                    <>
                      <span className="text-neutral-400">to</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={e => setCustomEndDate(e.target.value)}
                        className="bg-transparent text-xs text-neutral-800 dark:text-white focus:outline-none cursor-pointer"
                      />
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsRangeMode(prev => !prev)}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer pl-1"
                  >
                    {isRangeMode ? 'Single day' : '+ Range'}
                  </button>
                </div>
              )}
            </div>

            {/* Scope Filter Dropdown: All | Per Client | Per Delivery Unit | Per Project | Per User */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-neutral-500 dark:text-white/40 uppercase tracking-wider font-semibold">
                Filter:
              </span>
              <div className="relative">
                <select
                  value={filterScope}
                  onChange={e => setFilterScope(e.target.value as AnalyticsScope)}
                  className="appearance-none rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1A1A1A] py-1.5 pl-3 pr-8 text-xs font-semibold text-neutral-800 dark:text-white focus:border-blue-500 focus:outline-none cursor-pointer shadow-xs"
                >
                  <option value="all">All Workspace</option>
                  <option value="client">Per Client</option>
                  <option value="delivery_unit">Per Delivery Unit</option>
                  <option value="project">Per Project</option>
                  <option value="user">Per User</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              </div>

              {/* Secondary selector for chosen scope */}
              {filterScope === 'client' && (
                <div className="relative">
                  <select
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="appearance-none rounded-xl border border-blue-500/40 bg-white dark:bg-[#1A1A1A] py-1.5 pl-3 pr-8 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none cursor-pointer shadow-xs max-w-[160px] truncate"
                  >
                    {uniqueClients.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-neutral-400" />
                </div>
              )}

              {filterScope === 'delivery_unit' && (
                <div className="relative">
                  <select
                    value={selectedDeliveryUnitId}
                    onChange={e => setSelectedDeliveryUnitId(e.target.value)}
                    className="appearance-none rounded-xl border border-blue-500/40 bg-white dark:bg-[#1A1A1A] py-1.5 pl-3 pr-8 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none cursor-pointer shadow-xs max-w-[180px] truncate"
                  >
                    {deliveryUnits.map(du => (
                      <option key={du.id} value={du.id}>{du.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-neutral-400" />
                </div>
              )}

              {filterScope === 'project' && (
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                    className="appearance-none rounded-xl border border-blue-500/40 bg-white dark:bg-[#1A1A1A] py-1.5 pl-3 pr-8 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none cursor-pointer shadow-xs max-w-[180px] truncate"
                  >
                    {uniqueProjects.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-neutral-400" />
                </div>
              )}

              {filterScope === 'user' && (
                <div className="relative">
                  <select
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                    className="appearance-none rounded-xl border border-blue-500/40 bg-white dark:bg-[#1A1A1A] py-1.5 pl-3 pr-8 text-xs font-medium text-neutral-900 dark:text-white focus:outline-none cursor-pointer shadow-xs max-w-[160px] truncate"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-neutral-400" />
                </div>
              )}
            </div>
          </div>

          {/* Modal Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* TOP GRAPHICAL SECTION: 4 Key Metric Cards & Visual Top Accounts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Employees */}
              <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#141414] p-4 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-neutral-500 dark:text-white/40 mb-2">
                  <span className="text-[11px] uppercase tracking-wider font-semibold">Total Employees</span>
                  <Users className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <span className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
                    {topMetrics.totalEmployees}
                  </span>
                  <p className="text-[11px] text-neutral-500 dark:text-white/40 mt-1">
                    Active team members in scope
                  </p>
                </div>
              </div>

              {/* Total Utilization */}
              <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#141414] p-4 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-neutral-500 dark:text-white/40 mb-2">
                  <span className="text-[11px] uppercase tracking-wider font-semibold">Total Utilization</span>
                  <Activity className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                      {topMetrics.totalUtilization}%
                    </span>
                    <span className="text-xs text-neutral-400">
                      ({topMetrics.totalUtilizedCount}/{topMetrics.totalEmployees})
                    </span>
                  </div>
                  {/* Visual Progress Bar */}
                  <div className="w-full bg-neutral-200 dark:bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${topMetrics.totalUtilization}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 dark:text-white/40 mt-1">
                    Assigned &gt; 3 hours estimated per day
                  </p>
                </div>
              </div>

              {/* Total Efficiency */}
              <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#141414] p-4 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-neutral-500 dark:text-white/40 mb-2">
                  <span className="text-[11px] uppercase tracking-wider font-semibold">Total Efficiency</span>
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold tracking-tight ${
                      topMetrics.efficiencyPercent >= 75
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : topMetrics.efficiencyPercent >= 50
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-rose-600 dark:text-red-400'
                    }`}>
                      {topMetrics.efficiencyPercent}%
                    </span>
                    <span className="text-xs text-neutral-400">
                      {formatHoursRatio(topMetrics.totalTimeTakenHours, topMetrics.totalEstimatedHours)}
                    </span>
                  </div>
                  {/* Visual Progress Bar */}
                  <div className="w-full bg-neutral-200 dark:bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        topMetrics.efficiencyPercent >= 50 ? 'bg-blue-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, topMetrics.efficiencyPercent)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 dark:text-white/40 mt-1">
                    Aggregate time taken / time estimated
                  </p>
                </div>
              </div>

              {/* Top Accounts Graphic Bar */}
              <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-[#141414] p-4 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-neutral-500 dark:text-white/40 mb-2">
                  <span className="text-[11px] uppercase tracking-wider font-semibold">Top Accounts (Hours)</span>
                  <Briefcase className="h-4 w-4 text-purple-500" />
                </div>
                <div className="space-y-1.5">
                  {topMetrics.topAccountsList.slice(0, 3).map(acct => (
                    <div key={acct.client} className="text-xs">
                      <div className="flex justify-between items-center text-[11px] mb-0.5">
                        <span className="font-semibold text-neutral-800 dark:text-white/90 truncate max-w-[120px]">
                          {acct.client}
                        </span>
                        <span className="text-[10px] text-neutral-500 dark:text-white/50">
                          {formatHoursRatio(acct.billableHours, acct.estimatedHours)}
                        </span>
                      </div>
                      <div className="w-full bg-neutral-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-500 h-full rounded-full"
                          style={{ width: `${Math.min(100, (acct.keyHours / topMetrics.maxAccountHours) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {topMetrics.topAccountsList.length === 0 && (
                    <p className="text-xs text-neutral-400 py-2">No account hours recorded</p>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 1: UTILIZATION (< 3h/day assigned with dates) */}
            <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
                    Section 1: Underutilized Employees (&lt; 3h/day)
                  </h3>
                </div>
                <span className="text-xs text-neutral-400">
                  {underutilizedEmployees.length} member{underutilizedEmployees.length === 1 ? '' : 's'} flagged
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-white/40 mb-4">
                Team members assigned less than 3 hours of estimated time per day within the timeframe (split equally across task working days).
              </p>

              {underutilizedEmployees.length === 0 ? (
                <div className="py-6 text-center text-xs text-neutral-400 dark:text-white/40 flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>All employees in this scope are fully utilized (&gt; 3 hours/day assigned).</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {underutilizedEmployees.map(item => (
                    <div
                      key={item.user.id}
                      className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-[#191919] p-3 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-tr ${item.user.avatarColor || 'from-blue-600 to-indigo-600'}`}>
                            {item.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                              {item.user.name}
                            </p>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded border ${getUserTag(item.user).badgeClass}`}>
                              {getUserTag(item.user).label}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-amber-600 dark:text-yellow-400 shrink-0">
                          {item.avgAssigned}h / day
                        </span>
                      </div>

                      <div className="text-[10px] text-neutral-500 dark:text-white/40 pt-2 border-t border-neutral-200/50 dark:border-white/5">
                        <span className="font-semibold text-neutral-700 dark:text-white/70 block mb-0.5">Underutilized Dates:</span>
                        <div className="flex flex-wrap gap-1">
                          {item.dates.slice(0, 4).map(d => (
                            <span key={d} className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-white/70">
                              {d}
                            </span>
                          ))}
                          {item.dates.length > 4 && (
                            <span className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 text-neutral-500">
                              +{item.dates.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 2: EFFICIENCY (< 50% with dates) */}
            <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
                    Section 2: Low Efficiency Threshold (&lt; 50%)
                  </h3>
                </div>
                <span className="text-xs text-neutral-400">
                  {lowEfficiencyEmployees.length} member{lowEfficiencyEmployees.length === 1 ? '' : 's'} flagged
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-white/40 mb-4">
                Team members with aggregate efficiency below 50% (aggregate time taken vs time estimated across assigned tasks).
              </p>

              {lowEfficiencyEmployees.length === 0 ? (
                <div className="py-6 text-center text-xs text-neutral-400 dark:text-white/40 flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>All employees meet or exceed the 50% efficiency threshold.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {lowEfficiencyEmployees.map(item => (
                    <div
                      key={item.user.id}
                      className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-[#191919] p-3 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-tr ${item.user.avatarColor || 'from-blue-600 to-indigo-600'}`}>
                            {item.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                              {item.user.name}
                            </p>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded border ${getUserTag(item.user).badgeClass}`}>
                              {getUserTag(item.user).label}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold text-rose-600 dark:text-red-400 block">
                            {item.efficiencyPercent}%
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            {formatHoursRatio(item.timeTaken, item.timeEstimated)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] text-neutral-500 dark:text-white/40 pt-2 border-t border-neutral-200/50 dark:border-white/5">
                        <span className="font-semibold text-neutral-700 dark:text-white/70 block mb-0.5">Low Efficiency Dates:</span>
                        <div className="flex flex-wrap gap-1">
                          {item.dates.slice(0, 4).map(d => (
                            <span key={d} className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-white/70">
                              {d}
                            </span>
                          ))}
                          {item.dates.length > 4 && (
                            <span className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 text-neutral-500">
                              +{item.dates.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTIONS 3 & 4: CONTEXTUAL KEY ACCOUNTS & KEY DELIVERY UNITS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left Column: Section 3 */}
              <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    <span>{sections3And4Data.section3Title}</span>
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-white/40 mb-3">
                  Ranked by highest of billable hours or time estimated. Annotated as (Billable hours / Time estimated).
                </p>

                <div className="space-y-2.5 max-h-72 overflow-y-auto">
                  {/* If all view */}
                  {sections3And4Data.section3Type === 'all_key_accounts' && (
                    (sections3And4Data.section3Items as any[]).map(item => (
                      <div key={item.client} className="rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] p-3 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            {item.client}
                          </span>
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {formatHoursRatio(item.billableHours, item.estimatedHours)}
                          </span>
                        </div>
                        {item.topProjects && item.topProjects.length > 0 && (
                          <div className="mt-1.5 pt-1.5 border-t border-neutral-200/40 dark:border-white/5 text-[11px] text-neutral-500 dark:text-white/50">
                            <span className="font-medium text-neutral-600 dark:text-white/70">Top Projects: </span>
                            {item.topProjects.slice(0, 3).map((p: any) => (
                              <span key={p.project} className="mr-2 inline-block">
                                {p.project} {formatHoursRatio(p.billableHours, p.estimatedHours)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {/* If delivery units */}
                  {sections3And4Data.section3Type === 'delivery_units' && (
                    (sections3And4Data.section3Items as any[]).map(item => (
                      <div key={item.du.id} className="rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] p-3 text-xs flex justify-between items-center">
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          {item.du.name}
                        </span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {formatHoursRatio(item.billableHours, item.estimatedHours)}
                        </span>
                      </div>
                    ))
                  )}

                  {/* If clients */}
                  {sections3And4Data.section3Type === 'clients' && (
                    (sections3And4Data.section3Items as any[]).map(item => (
                      <div key={item.client} className="rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] p-3 text-xs flex justify-between items-center">
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          {item.client}
                        </span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {formatHoursRatio(item.billableHours, item.estimatedHours)}
                        </span>
                      </div>
                    ))
                  )}

                  {sections3And4Data.section3Items.length === 0 && (
                    <p className="text-xs text-neutral-400 py-3 text-center">No matching entities found in scope.</p>
                  )}
                </div>
              </div>

              {/* Right Column: Section 4 */}
              <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
                    <FolderGit2 className="h-4 w-4 text-purple-500" />
                    <span>{sections3And4Data.section4Title}</span>
                  </h3>
                </div>
                <p className="text-xs text-neutral-500 dark:text-white/40 mb-3">
                  Ranked by highest of billable hours or time estimated. Annotated as (Billable hours / Time estimated).
                </p>

                <div className="space-y-2.5 max-h-72 overflow-y-auto">
                  {/* If all delivery units */}
                  {sections3And4Data.section4Type === 'all_key_units' && (
                    (sections3And4Data.section4Items as any[]).map(item => (
                      <div key={item.du.id} className="rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] p-3 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-neutral-900 dark:text-white">
                            {item.du.name}
                          </span>
                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                            {formatHoursRatio(item.billableHours, item.estimatedHours)}
                          </span>
                        </div>
                        {item.topClients && item.topClients.length > 0 && (
                          <div className="mt-1 pt-1 border-t border-neutral-200/40 dark:border-white/5 text-[11px] text-neutral-500 dark:text-white/50">
                            <span className="font-medium text-neutral-600 dark:text-white/70">Top Clients: </span>
                            {item.topClients.slice(0, 2).map((c: any) => (
                              <span key={c.client} className="mr-2 inline-block">
                                {c.client} {formatHoursRatio(c.billableHours, c.estimatedHours)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {/* If projects */}
                  {sections3And4TypeMatchesProjects(sections3And4Data.section4Type) && (
                    (sections3And4Data.section4Items as any[]).map(item => (
                      <div key={item.project} className="rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] p-3 text-xs flex justify-between items-center">
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          {item.project}
                        </span>
                        <span className="font-semibold text-purple-600 dark:text-purple-400">
                          {formatHoursRatio(item.billableHours, item.estimatedHours)}
                        </span>
                      </div>
                    ))
                  )}

                  {/* If delivery units */}
                  {sections3And4Data.section4Type === 'delivery_units' && (
                    (sections3And4Data.section4Items as any[]).map(item => (
                      <div key={item.du.id} className="rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] p-3 text-xs flex justify-between items-center">
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          {item.du.name}
                        </span>
                        <span className="font-semibold text-purple-600 dark:text-purple-400">
                          {formatHoursRatio(item.billableHours, item.estimatedHours)}
                        </span>
                      </div>
                    ))
                  )}

                  {/* If projects and tasks */}
                  {sections3And4Data.section4Type === 'projects_and_tasks' && (
                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 block mb-1">
                          Key Projects
                        </span>
                        {(sections3And4Data.section4Items as any).projects.slice(0, 3).map((p: any) => (
                          <div key={p.project} className="flex justify-between items-center py-1 text-xs">
                            <span className="truncate">{p.project}</span>
                            <span className="font-semibold text-purple-500">{formatHoursRatio(p.billableHours, p.estimatedHours)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-neutral-200/40 dark:border-white/5">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 block mb-1">
                          Key Tasks
                        </span>
                        {(sections3And4Data.section4Items as any).tasks.slice(0, 4).map((t: any) => (
                          <div key={t.task.id} className="flex justify-between items-center py-1 text-xs">
                            <span className="truncate max-w-[200px]">{t.task.title}</span>
                            <span className="font-semibold text-blue-500">{formatHoursRatio(t.billableHours, t.estimatedHours)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(Array.isArray(sections3And4Data.section4Items) ? sections3And4Data.section4Items.length === 0 : ((sections3And4Data.section4Items as any).projects.length === 0 && (sections3And4Data.section4Items as any).tasks.length === 0)) && (
                    <p className="text-xs text-neutral-400 py-3 text-center">No matching entities found in scope.</p>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 5: PRESSURE METRICS (Highest Average Workload Scores & Top Contributors) */}
            <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
                    Section 5: Pressure Metrics & Workload Rankings
                  </h3>
                </div>
              </div>
              <p className="text-xs text-neutral-500 dark:text-white/40 mb-4">
                Teams and members ranked by average workload scores across members, with top contributing projects and tasks.
              </p>

              {/* Mode: Members with Projects (General, Delivery Unit, Client views) */}
              {pressureMetrics.mode === 'members_with_projects' && (
                <div className="space-y-4">
                  {/* Team Averages Bar */}
                  <div>
                    <span className="text-xs font-semibold text-neutral-700 dark:text-white/70 block mb-2 uppercase tracking-wider text-[10px]">
                      Team Workload Averages:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {pressureMetrics.rankedUnits?.slice(0, 4).map(item => (
                        <div key={item.unit.id} className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] p-3 text-xs">
                          <p className="font-semibold text-neutral-800 dark:text-white truncate">{item.unit.name}</p>
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className={`text-base font-bold ${item.avgScore >= 12 ? 'text-rose-500' : item.avgScore >= 8 ? 'text-amber-500' : 'text-blue-500'}`}>
                              {item.avgScore} pts
                            </span>
                            <span className="text-[10px] text-neutral-400">avg</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Members with highest workload scores */}
                  <div>
                    <span className="text-xs font-semibold text-neutral-700 dark:text-white/70 block mb-2 uppercase tracking-wider text-[10px]">
                      Members with Highest Workload Scores & Top Contributing Projects:
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {pressureMetrics.topMembers?.slice(0, 6).map(item => (
                        <div key={item.user.id} className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] p-3.5 text-xs">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-tr ${item.user.avatarColor || 'from-blue-600 to-indigo-600'}`}>
                                {item.user.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-semibold text-neutral-900 dark:text-white truncate max-w-[130px]">
                                {item.user.name}
                              </span>
                            </div>
                            <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                              item.score >= 12
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : item.score >= 8
                                ? 'bg-amber-500/15 text-amber-600 dark:text-yellow-400'
                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            }`}>
                              {item.score} pts
                            </span>
                          </div>
                          {item.topProjects.length > 0 && (
                            <div className="pt-2 border-t border-neutral-200/50 dark:border-white/5 text-[11px] text-neutral-500 dark:text-white/40">
                              <span className="font-medium text-neutral-700 dark:text-white/70 block mb-0.5">Top Contributing Projects:</span>
                              {item.topProjects.slice(0, 2).map(p => (
                                <div key={p.project} className="flex justify-between items-center py-0.5">
                                  <span className="truncate">{p.project}</span>
                                  <span className="font-medium text-neutral-700 dark:text-white/80">{p.score} pts</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Mode: Project Tasks (Per project view) */}
              {pressureMetrics.mode === 'project_tasks' && (
                <div>
                  <span className="text-xs font-semibold text-neutral-700 dark:text-white/70 block mb-2 uppercase tracking-wider text-[10px]">
                    Tasks Contributing Highest Workload Scores to this Project:
                  </span>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {pressureMetrics.projectTasks?.map(pt => (
                      <div key={pt.task.id} className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] text-xs">
                        <div className="min-w-0 pr-3">
                          <p className="font-semibold text-neutral-900 dark:text-white truncate">{pt.task.title}</p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">
                            Assignee: {pt.user?.name || 'Unassigned'} · Status: {pt.task.status.replace('_', ' ')}
                          </p>
                        </div>
                        <span className="font-bold px-2 py-0.5 rounded-full text-xs bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
                          {pt.calculatedScore} pts
                        </span>
                      </div>
                    ))}
                    {pressureMetrics.projectTasks?.length === 0 && (
                      <p className="text-xs text-neutral-400 py-3 text-center">No tasks in this project.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Mode: User Tasks (Per user view) */}
              {pressureMetrics.mode === 'user_tasks' && (
                <div>
                  <span className="text-xs font-semibold text-neutral-700 dark:text-white/70 block mb-2 uppercase tracking-wider text-[10px]">
                    Tasks Contributing Highest Workload Scores for this User:
                  </span>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {pressureMetrics.userRankedTasks?.map(ut => (
                      <div key={ut.item.taskId} className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-[#181818] text-xs">
                        <div className="min-w-0 pr-3">
                          <p className="font-semibold text-neutral-900 dark:text-white truncate">{ut.item.title}</p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">
                            Status: {ut.item.status.replace('_', ' ')} · Load: {ut.item.cognitiveLoad} · Due: {ut.item.dueDate || 'None'}
                          </p>
                        </div>
                        <span className="font-bold px-2 py-0.5 rounded-full text-xs bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
                          {ut.calculatedScore} pts
                        </span>
                      </div>
                    ))}
                    {pressureMetrics.userRankedTasks?.length === 0 && (
                      <p className="text-xs text-neutral-400 py-3 text-center">No active tasks contributing to workload.</p>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

function sections3And4TypeMatchesProjects(type: string): boolean {
  return type === 'projects';
}
