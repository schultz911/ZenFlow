import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDashboard } from '../context/DashboardContext';
import { Role } from '../types';
import {
  X,
  Mail,
  User as UserIcon,
  Palette,
  FileText,
  ArrowRight,
  Crown,
  Loader2,
  Shield,
  Video as VideoIcon,
  Layout,
  Briefcase,
  Award,
  Layers,
  Lock,
  Users,
  UserCheck,
  Search,
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  isNewAccountOnly?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  isNewAccountOnly = false,
}) => {
  const {
    login,
    loginWithGoogle,
    createUser,
    currentUser,
    isSuperadmin,
    isAdministrator,
    creativeDirectors,
    clusterLeads,
    canManageMembers,
    authError,
    setAuthError,
  } = useDashboard();

  const canAssignAdmin = isSuperadmin || isAdministrator;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role | undefined>('content');
  const [isAdminPrivilege, setIsAdminPrivilege] = useState(false);

  // Designations
  const [isBusinessLead, setIsBusinessLead] = useState(false);
  const [isCD, setIsCD] = useState(false);
  const [isClusterLead, setIsClusterLead] = useState(false);
  const [isTeamLead, setIsTeamLead] = useState(false);
  const [isAccountManager, setIsAccountManager] = useState(false);

  // Assigned Leaders
  const [selectedCDId, setSelectedCDId] = useState<string>(() => {
    if (currentUser?.isCreativeDirector) return currentUser.id;
    return creativeDirectors[0]?.id || '';
  });
  const [selectedClusterLeadId, setSelectedClusterLeadId] = useState<string>(() => {
    if (currentUser?.isClusterLead) return currentUser.id;
    return '';
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayError = error || authError;

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isNewAccountOnly || Boolean(currentUser)) && !isSubmitting && !isGoogleSigningIn) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isNewAccountOnly, currentUser, isSubmitting, isGoogleSigningIn, onClose]);

  // If user opens Add Member modal, make sure they have permissions
  const hasAccess = !isNewAccountOnly || canManageMembers;

  const handleGoogleSignIn = async () => {
    setError(null);
    setAuthError(null);
    setIsGoogleSigningIn(true);
    try {
      await loginWithGoogle();
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please verify your account is registered.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isNewAccountOnly && !canManageMembers) {
      setError('You do not have permission to add new team members.');
      return;
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setError('Please enter user full name');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please provide a valid official email address');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isNewAccountOnly) {
        const designation = isBusinessLead
          ? 'Business Lead'
          : isCD
          ? 'Creative Director'
          : isClusterLead
          ? 'Cluster Lead'
          : isTeamLead
          ? 'Team Lead'
          : isAccountManager
          ? 'Account Manager'
          : isAdminPrivilege
          ? 'Administrator'
          : undefined;

        await createUser({
          name: cleanName,
          email: cleanEmail,
          role: role || undefined,
          isAdministrator: isAdminPrivilege,
          isBusinessLead,
          isCreativeDirector: isCD,
          isClusterLead,
          isTeamLead,
          isAccountManager,
          designation,
          creativeDirectorId: isCD ? undefined : (selectedCDId || undefined),
          clusterLeadId: isClusterLead ? undefined : (selectedClusterLeadId || undefined),
        });
      } else {
        await login(cleanName, role || 'content', cleanEmail);
      }
      setName('');
      setEmail('');
      setRole('content');
      setIsAdminPrivilege(false);
      setIsBusinessLead(false);
      setIsCD(false);
      setIsClusterLead(false);
      setIsTeamLead(false);
      setIsAccountManager(false);
      setSelectedCDId('');
      setSelectedClusterLeadId('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Operation failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasAccess && isNewAccountOnly) {
    return null;
  }

  const roleOptions: Array<{ id: Role; label: string; desc: string; icon: React.ReactNode; tooltip: string }> = [
    {
      id: 'account_manager',
      label: 'Accounts',
      desc: 'Client & Strategy',
      icon: <Briefcase className="h-4 w-4 text-amber-500" />,
      tooltip: 'Client management and account coordination team',
    },
    {
      id: 'content',
      label: 'Content',
      desc: 'Writing & Strategy',
      icon: <FileText className="h-4 w-4 text-blue-500" />,
      tooltip: 'Content writing, editorial, and storytelling team',
    },
    {
      id: 'design',
      label: 'Design',
      desc: 'Adaptive & Visual',
      icon: <Palette className="h-4 w-4 text-indigo-500" />,
      tooltip: 'Visual design, branding, and graphic design team',
    },
    {
      id: 'video',
      label: 'Video',
      desc: 'Motion & Editing',
      icon: <VideoIcon className="h-4 w-4 text-violet-500" />,
      tooltip: 'Cross-functional motion graphics and video production shared team',
    },
    {
      id: 'ui_ux',
      label: 'UI/UX',
      desc: 'Product & Interface',
      icon: <Layout className="h-4 w-4 text-cyan-500" />,
      tooltip: 'Cross-functional product interface and user experience shared team',
    },
    {
      id: 'research',
      label: 'Research',
      desc: 'Insights & Analysis',
      icon: <Search className="h-4 w-4 text-teal-500" />,
      tooltip: 'User research, insights, and data analysis shared team',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto"
          onClick={e => {
            if (e.target === e.currentTarget && !isSubmitting && !isGoogleSigningIn && (isNewAccountOnly || Boolean(currentUser))) {
              onClose();
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            id="login-modal"
            className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-6 shadow-2xl transition-all text-neutral-900 dark:text-white"
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                {!isNewAccountOnly && (
                  <div
                    id="zenflow-login-logo"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 dark:bg-[#1A1A1A] border border-neutral-800 dark:border-white/10 text-blue-500 shadow-sm shrink-0"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M 4.5 7.2 C 8.5 4.8, 14 9.6, 19.5 7 L 4.5 17 C 10 14.4, 15.5 19.2, 19.5 16.8" />
                    </svg>
                  </div>
                )}
                <div>
                  <div className="flex items-baseline leading-none">
                    <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
                      {isNewAccountOnly ? 'Add Team Member' : 'zen'}
                    </span>
                    {!isNewAccountOnly && (
                      <span className="font-flowy text-xl font-bold text-blue-600 dark:text-blue-400 ml-0.5 select-none">
                        Flow
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-white/40 mt-0.5">
                    {isNewAccountOnly
                      ? 'Provision a team member, select role, and configure leadership designations.'
                      : 'Workflow Management System'}
                  </p>
                </div>
              </div>
              {isNewAccountOnly && onClose && (
                <button
                  onClick={onClose}
                  disabled={isSubmitting || isGoogleSigningIn}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {displayError && (
              <div className="my-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-500 border border-red-500/20 font-medium">
                {displayError}
              </div>
            )}

            {/* In Sign In Mode: Google Sign-In Only */}
            {!isNewAccountOnly ? (
              <div className="pt-4 pb-2 space-y-4">
                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed text-center">
                  Sign in with your authorized Google account to view and manage team workflows.
                </p>

                <button
                  type="button"
                  id="google-signin-modal-btn"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleSigningIn}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-zinc-800/80 hover:bg-neutral-50 dark:hover:bg-zinc-700 py-3 px-4 text-xs font-semibold text-neutral-800 dark:text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {isGoogleSigningIn ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span>Connecting to Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.34 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.97 0 12s.46 3.83 1.26 5.42l4.02-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>Sign In with Google</span>
                    </>
                  )}
                </button>

                <div className="rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02] p-3 text-[11px] text-neutral-500 dark:text-neutral-400 text-center leading-relaxed">
                  Access is restricted to pre-registered accounts (<strong className="text-neutral-700 dark:text-neutral-200">@zensciences.com</strong> or authorized team members).
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                {/* Name Field */}
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400 dark:text-white/40">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <input
                      id="login-name-input"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Maya Sterling"
                      className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Official Email Address */}
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                    Official Email Address
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400 dark:text-white/40">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="login-email-input"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@zensciences.com"
                      className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Administrator Privileges Toggle */}
                {isNewAccountOnly && (
                  <div
                    className={`rounded-xl border p-3 flex items-center justify-between transition-all ${
                      !canAssignAdmin
                        ? 'opacity-50 bg-neutral-100/50 dark:bg-white/[0.02] border-neutral-200 dark:border-white/5'
                        : isAdminPrivilege
                        ? 'border-rose-500/40 bg-rose-500/5 dark:bg-rose-500/10'
                        : 'border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414]'
                    }`}
                    title={canAssignAdmin ? "Grant administrator privileges with full board and account access" : "Administrator privileges are restricted to Superadmins and other Administrators"}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg p-1.5 bg-rose-500/10 text-rose-500">
                        <Shield className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-neutral-900 dark:text-white">Administrator Privileges</span>
                          {!canAssignAdmin && <Lock className="w-3 h-3 text-neutral-400" />}
                        </div>
                        <p className="text-[10px] text-neutral-500 dark:text-white/40">System & Ops — Full board access, team management, and workspace settings</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="toggle-admin-privilege"
                        disabled={!canAssignAdmin}
                        checked={isAdminPrivilege}
                        onChange={e => setIsAdminPrivilege(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600 disabled:cursor-not-allowed"></div>
                    </label>
                  </div>
                )}

                {/* Role / Team Selection: 6 functional teams (optional) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40" title="Select the member's functional team (click selected team to deselect)">
                      TEAM
                    </label>
                    <span className="text-[10px] text-neutral-400 dark:text-white/40">
                      {role ? '(click selected to deselect)' : '(no team selected)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {roleOptions.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        id={`select-role-${opt.id}`}
                        onClick={() => setRole(prev => prev === opt.id ? undefined : opt.id)}
                        title={opt.tooltip}
                        className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all ${
                          role === opt.id
                            ? 'border-blue-500/50 bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-500/30 cursor-pointer'
                            : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] hover:border-neutral-300 dark:hover:border-white/10 cursor-pointer'
                        }`}
                      >
                        <div className="rounded-lg p-1 bg-neutral-200/50 dark:bg-white/5 shrink-0">
                          {opt.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                            {opt.label}
                          </p>
                          <p className="text-[10px] text-neutral-500 dark:text-white/40 truncate">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Designation: Role-led */}
                <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] p-3.5 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider" title="Configure member leadership designation">
                      Designation
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Business Lead */}
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#141414] cursor-pointer hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={isBusinessLead}
                        onChange={e => setIsBusinessLead(e.target.checked)}
                        className="rounded border-neutral-300 dark:border-neutral-700 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
                      />
                      <Briefcase className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Business Lead</span>
                    </label>

                    {/* Creative Director */}
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#141414] cursor-pointer hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={isCD}
                        onChange={e => setIsCD(e.target.checked)}
                        className="rounded border-neutral-300 dark:border-neutral-700 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                      />
                      <Crown className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Creative Director</span>
                    </label>

                    {/* Cluster Lead */}
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#141414] cursor-pointer hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={isClusterLead}
                        onChange={e => setIsClusterLead(e.target.checked)}
                        className="rounded border-neutral-300 dark:border-neutral-700 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                      />
                      <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Cluster Lead</span>
                    </label>

                    {/* Team Lead */}
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#141414] cursor-pointer hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={isTeamLead}
                        onChange={e => setIsTeamLead(e.target.checked)}
                        className="rounded border-neutral-300 dark:border-neutral-700 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                      />
                      <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Team Lead</span>
                    </label>

                    {/* Account Manager */}
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#141414] cursor-pointer hover:border-neutral-300 dark:hover:border-white/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={isAccountManager}
                        onChange={e => setIsAccountManager(e.target.checked)}
                        className="rounded border-neutral-300 dark:border-neutral-700 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Account Manager</span>
                    </label>
                  </div>
                </div>

                {/* Delivery Lead: Assigned Creative Director (Boards follow Creative Director) */}
                {!isCD && (
                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5" title="Select the Delivery lead who manages this member's cluster board">
                      Assigned Creative Director (Delivery lead)
                    </label>
                    <select
                      value={selectedCDId}
                      onChange={e => setSelectedCDId(e.target.value)}
                      title="Delivery lead for this cluster delivery board"
                      className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">None / Independent Board</option>
                      {creativeDirectors.map(cd => (
                        <option key={cd.id} value={cd.id}>
                          {cd.name} ({cd.email})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-neutral-500 dark:text-white/40 mt-1">
                      Boards follow the Creative Director as the Delivery lead of a cluster.
                    </p>
                  </div>
                )}

                {/* Input for Assigned Cluster Lead */}
                {!isClusterLead && (
                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                      Assigned Cluster Lead
                    </label>
                    <select
                      value={selectedClusterLeadId}
                      onChange={e => setSelectedClusterLeadId(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">None / Direct</option>
                      {clusterLeads.map(cl => (
                        <option key={cl.id} value={cl.id}>
                          {cl.name} ({cl.email})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-neutral-500 dark:text-white/40 mt-1">
                      Optionally map to an assigned Cluster Lead for multi-lead clusters.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  id="login-submit-button"
                  disabled={isSubmitting || isGoogleSigningIn}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-900/20 hover:bg-blue-500 focus:outline-none transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span>Processing...</span>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
