import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';
import {
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  UserPlus,
  Palette,
  FileText,
  Cloud,
  Crown,
  Shield,
  Database,
  Users,
} from 'lucide-react';
import { getUserTag } from '../utils/workload';

interface HeaderProps {
  onOpenLoginModal: () => void;
  onOpenNewUserModal: () => void;
  onOpenFirestoreModal: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  onOpenLoginModal,
  onOpenNewUserModal,
  onOpenFirestoreModal,
}) => {
  const {
    currentUser,
    users,
    activeRoleTab,
    setActiveRoleTab,
    darkMode,
    setDarkMode,
    syncStatus,
    logout,
    isSuperadmin,
    isCreativeDirector,
    canManageMembers,
  } = useDashboard();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userDropdownOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setUserDropdownOpen(false); document.getElementById('user-profile-menu-button')?.focus(); }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [userDropdownOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userDropdownRef.current && !userDropdownRef.current.contains(target)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const contentUsers = useMemo(() => users.filter(u => u.role === 'content'), [users]);
  const designUsers = useMemo(() => users.filter(u => u.role === 'design'), [users]);
  const allDeliveryUsersCount = contentUsers.length + designUsers.length;

  const currentUserTag = useMemo(() => getUserTag(currentUser), [currentUser]);

  return (
    <header className="app-header sticky top-0 z-30 w-full border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          
          {/* Logo & Brand: zenFlow */}
          <div className="flex items-center gap-3">
            <div
              id="zenflow-logo"
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
            <div className="flex flex-col">
              <div className="flex items-baseline leading-none">
                <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                  zen
                </span>
                <span className="font-flowy text-2xl font-bold text-blue-600 dark:text-blue-400 ml-0.5 select-none">
                  Flow
                </span>
              </div>
            </div>
          </div>

          {/* Center: Role Filter Tabs (All, Content, Design) */}
          <div className="hidden xl:flex items-center rounded-full bg-[var(--surface-muted)] p-1 border border-[var(--border)]">
            <button
              id="tab-all"
              onClick={() => setActiveRoleTab('all')}
              aria-pressed={activeRoleTab === 'all'}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                activeRoleTab === 'all'
                  ? 'bg-[var(--surface-raised)] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5 text-neutral-500 dark:text-white/70" />
              <span>All</span>
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                activeRoleTab === 'all'
                  ? 'bg-neutral-900/10 text-neutral-900 dark:bg-white/15 dark:text-white'
                  : 'bg-neutral-200 dark:bg-white/5 text-neutral-600 dark:text-white/40'
              }`}>
                {allDeliveryUsersCount}
              </span>
            </button>

            <button
              id="tab-content"
              onClick={() => setActiveRoleTab('content')}
              aria-pressed={activeRoleTab === 'content'}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                activeRoleTab === 'content'
                  ? 'bg-[var(--surface-raised)] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              <span>Content</span>
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                activeRoleTab === 'content'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                  : 'bg-neutral-200 dark:bg-white/5 text-neutral-600 dark:text-white/40'
              }`}>
                {contentUsers.length}
              </span>
            </button>

            <button
              id="tab-design"
              onClick={() => setActiveRoleTab('design')}
              aria-pressed={activeRoleTab === 'design'}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                activeRoleTab === 'design'
                  ? 'bg-[var(--surface-raised)] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
              }`}
            >
              <Palette className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Design</span>
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                activeRoleTab === 'design'
                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                  : 'bg-neutral-200 dark:bg-white/5 text-neutral-600 dark:text-white/40'
              }`}>
                {designUsers.length}
              </span>
            </button>
          </div>

          {/* Right Actions: Realtime status, Theme toggle, User Profile */}
          <div className="flex items-center gap-2">

            {/* Database & Sync Status Button */}
            <button
              id="connection-status-button"
              onClick={onOpenFirestoreModal}
              title={`Database Status: ${syncStatus === 'connected' ? 'Connected (Firestore)' : 'Connecting...'}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-neutral-100 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10 text-xs font-medium text-neutral-700 dark:text-white/80 transition-colors cursor-pointer"
            >
              <Cloud
                className={`h-3.5 w-3.5 ${
                  syncStatus === 'connected'
                    ? 'text-blue-500'
                    : syncStatus === 'connecting'
                    ? 'text-amber-400'
                    : 'text-neutral-400 dark:text-white/20'
                }`}
              />
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  syncStatus === 'connected'
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
              />
              <span className="hidden sm:inline text-[11px]">
                {syncStatus === 'connected'
                  ? 'Connected'
                  : 'Syncing...'}
              </span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              id="theme-toggle"
              onClick={() => setDarkMode(prev => !prev)}
              aria-label="Toggle dark mode"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* User Dropdown / Auth status */}
            <div className="relative z-30" ref={userDropdownRef}>
              {currentUser ? (
                <button
                  id="user-profile-menu-button"
                  aria-expanded={userDropdownOpen}
                  aria-controls="user-profile-menu"
                  onClick={() => setUserDropdownOpen(prev => !prev)}
                  className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] py-1.5 px-3 text-left text-xs hover:border-neutral-300 dark:hover:border-white/20 transition-colors"
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr ${
                      currentUser.avatarColor || 'from-blue-600 to-indigo-600'
                    } text-white font-medium text-xs border border-white/10`}
                  >
                    {currentUser.name
                      .split(' ')
                      .map(p => p[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  <div className="hidden sm:block leading-tight text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {isSuperadmin ? (
                        <Shield className="w-3 h-3 text-amber-500" />
                      ) : isCreativeDirector ? (
                        <Crown className="w-3 h-3 text-purple-400" />
                      ) : null}
                      <p className="text-xs font-medium text-neutral-900 dark:text-white max-w-[120px] truncate">
                        {currentUser.name}
                      </p>
                    </div>
                    <p className="text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">
                      {isSuperadmin
                        ? 'Superadmin'
                        : currentUserTag.label}
                    </p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                </button>
              ) : (
                <button
                  id="login-button"
                  onClick={onOpenLoginModal}
                  className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 shadow-lg shadow-blue-900/30 transition-all"
                >
                  <span>Sign In</span>
                </button>
              )}

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div id="user-profile-menu" className="menu-surface absolute right-0 mt-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl transition-all z-50 text-neutral-900 dark:text-white animate-in fade-in zoom-in-95 duration-150">
                  {currentUser && (
                    <div className="border-b border-neutral-100 dark:border-white/10 px-2 pb-2.5 pt-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                          {currentUser.name}
                        </p>
                        {isSuperadmin && (
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            Superadmin
                          </span>
                        )}
                        {!isSuperadmin && (
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${currentUserTag.badgeClass}`}>
                            {currentUserTag.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                        {currentUser.email}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <span className="text-[11px] uppercase tracking-wider text-neutral-600 dark:text-white/60">
                          {currentUserTag.label}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions for Authorized Users */}
                  <div className="py-1.5 space-y-0.5">
                    {canManageMembers && (
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          onOpenNewUserModal();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5 text-blue-500" />
                        <span>Add Team Member</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onOpenFirestoreModal();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <Database className="h-3.5 w-3.5 text-blue-500" />
                      <span>Database & Compliance</span>
                    </button>


                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Mobile Sub-header Tabs (All, Content, Design) */}
        <div className="mobile-team-navigation flex xl:hidden items-center justify-between border-t border-[var(--border)] py-2 overflow-x-auto">
          <div className="flex items-center rounded-full bg-[var(--surface-muted)] p-1 text-xs w-full justify-between border border-[var(--border)] gap-1">
            <button
              onClick={() => setActiveRoleTab('all')}
              aria-pressed={activeRoleTab === 'all'}
              className={`flex-1 rounded-full py-1 text-center font-medium px-2 text-[11px] ${
                activeRoleTab === 'all'
                  ? 'bg-[var(--surface-raised)] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              All ({allDeliveryUsersCount})
            </button>
            <button
              onClick={() => setActiveRoleTab('content')}
              aria-pressed={activeRoleTab === 'content'}
              className={`flex-1 rounded-full py-1 text-center font-medium px-2 text-[11px] ${
                activeRoleTab === 'content'
                  ? 'bg-[var(--surface-raised)] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Content ({contentUsers.length})
            </button>
            <button
              onClick={() => setActiveRoleTab('design')}
              aria-pressed={activeRoleTab === 'design'}
              className={`flex-1 rounded-full py-1 text-center font-medium px-2 text-[11px] ${
                activeRoleTab === 'design'
                  ? 'bg-[var(--surface-raised)] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Design ({designUsers.length})
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};

export const Header = React.memo(HeaderComponent);
Header.displayName = 'Header';
