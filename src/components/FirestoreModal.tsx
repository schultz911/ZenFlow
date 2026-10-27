import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Database, Download, RefreshCw, X } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import type { AuditLogEntry } from '../types';

export const FirestoreModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { firestoreStatus, refreshFirestoreStatus, fetchAuditLogs, downloadAuditLogs, canManageMembers } = useDashboard();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setError(''); setLogs([]);
    void refreshFirestoreStatus();
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [isOpen, onClose, refreshFirestoreStatus]);
  const loadAudit = async () => {
    setLoading(true); setError('');
    try { setLogs(await fetchAuditLogs(100)); }
    catch { setError('Audit history could not be loaded. Please retry.'); }
    finally { setLoading(false); }
  };
  return <AnimatePresence>{isOpen && <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ duration: 0.18, ease: 'easeOut' }}
      className="w-full max-w-2xl rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Workspace & Compliance</h2>
        <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <section className="rounded-xl border border-neutral-200 dark:border-white/10 p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold"><Database className="h-4 w-4" />Cloud Firestore</div>
        <p className="text-sm text-neutral-500">Members, tasks, activity history and audit records are saved in your workspace database.</p>
        <p className="text-sm">{firestoreStatus?.connected ? 'Connected' : 'Checking connection…'} · {firestoreStatus?.totalUsers ?? '—'} members · {firestoreStatus?.totalTasks ?? '—'} tasks</p>
        {firestoreStatus?.lastError && <p role="alert" className="text-sm text-red-500">Workspace database unavailable. Please retry.</p>}
        <button className="flex items-center gap-2 text-sm text-blue-500" onClick={() => void refreshFirestoreStatus()}><RefreshCw className="h-4 w-4" />Refresh status</button>
      </section>
      {canManageMembers && <section className="mt-4 space-y-3">
        <h3 className="font-semibold">Audit history</h3>
        <div className="flex gap-4">
          <button disabled={loading} onClick={() => void loadAudit()} className="text-sm text-blue-500">{loading ? 'Loading…' : 'Load recent activity'}</button>
          <button onClick={downloadAuditLogs} className="flex gap-2 items-center text-sm text-blue-500"><Download className="h-4 w-4" />Download full history</button>
        </div>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="max-h-64 overflow-auto space-y-2">{logs.map(log => <div key={log.id} className="rounded-lg bg-neutral-100 dark:bg-white/5 p-3 text-xs">
          <time className="text-neutral-500">{new Date(log.timestamp).toLocaleString()}</time>
          <p>{log.details || log.action}</p>
        </div>)}</div>
      </section>}
    </motion.div>
  </motion.div>}</AnimatePresence>;
};
