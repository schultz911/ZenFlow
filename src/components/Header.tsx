import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAuth, useBoardUi, useClickUp, useWorkspace } from '../context/DashboardContext';
import { handleRovingMenuKeyDown } from '../hooks/useAnchoredPopover';
import {
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  UserPlus,
  Crown,
  Shield,
  Database,
  ListChecks,
  Keyboard,
} from 'lucide-react';
import { getUserTag } from '../utils/workload';

interface HeaderProps {
  onOpenLoginModal: () => void;
  onOpenNewUserModal: (prefill?: { name: string; email: string } | null) => void;
  onOpenFirestoreModal: () => void;
  onOpenSetupModal?: () => void;
  onOpenShortcutsModal?: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  onOpenLoginModal,
  onOpenNewUserModal,
  onOpenFirestoreModal,
  onOpenSetupModal,
  onOpenShortcutsModal,
}) => {
  const {
    currentUser,
    logout,
    isSuperadmin,
    isCreativeDirector,
    canManageMembers,
  } = useAuth();
  const { users, syncStatus, accessRequests, dismissAccessRequest } = useWorkspace();
  const { isClickupConnected } = useClickUp();
  const {
    activeRoleTab,
    setActiveRoleTab,
    darkMode,
    setDarkMode,
  } = useBoardUi();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pendingMenuFocusRef = useRef<'first' | 'last' | null>(null);

  useLayoutEffect(() => {
    if (!userDropdownOpen || !pendingMenuFocusRef.current) return;
    const target = pendingMenuFocusRef.current;
    pendingMenuFocusRef.current = null;
    const items = Array.from(
      userMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') || []
    );
    if (items.length > 0) {
      (target === 'last' ? items[items.length - 1] : items[0])?.focus();
    }
  }, [userDropdownOpen]);

  useEffect(() => {
    if (!userDropdownOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserDropdownOpen(false);
        document.getElementById('user-profile-menu-button')?.focus();
      }
    };
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
    };
  }, [userDropdownOpen]);

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

  const roleTabs = [
    { id: 'tab-all', key: 'all' as const, label: 'All', count: allDeliveryUsersCount },
    { id: 'tab-content', key: 'content' as const, label: 'Content', count: contentUsers.length },
    { id: 'tab-design', key: 'design' as const, label: 'Design', count: designUsers.length },
  ];

  return (
    <header className="app-header sticky top-0 z-30 w-full border-b border-[var(--border)] bg-[var(--surface)]/92 backdrop-blur-md transition-colors">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-[54px] items-center justify-between gap-1 sm:gap-4">
          {/* Preserved Logo & Brand: zenFlow */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            <div
              id="zenflow-logo"
              className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-[#121418] dark:bg-[#1e2430] border border-[#262b36] dark:border-white/10 text-blue-500 shrink-0"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M 4.5 7.2 C 8.5 4.8, 14 9.6, 19.5 7 L 4.5 17 C 10 14.4, 15.5 19.2, 19.5 16.8" />
              </svg>
            </div>
            <div className="flex items-baseline leading-none" style={{ fontFamily: 'var(--font-sans)' }}>
              <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                zen
              </span>
              <span className="font-flowy text-2xl font-bold text-[#1d4ed8] dark:text-blue-400 ml-0.5 select-none">
                Flow
              </span>
            </div>
          </div>

          {/* Center: Flush Swiss Bottom-Ruled Role Navigation Tabs */}
          <nav aria-label="Team disciplines" className="hidden xl:flex h-full items-stretch gap-6">
            {roleTabs.map(tab => {
              const isActive = activeRoleTab === tab.key;
              return (
                <button
                  key={tab.key}
                  id={tab.id}
                  type="button"
                  onClick={() => setActiveRoleTab(tab.key)}
                  aria-pressed={isActive}
                  className={`relative flex h-full items-center gap-2 px-1 text-[13px] font-semibold transition-colors ${
                    isActive
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`tabular-nums text-[11px] font-semibold ${
                      isActive
                        ? 'text-[#1d4ed8] dark:text-blue-400'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {tab.count}
                  </span>
                  {isActive && (
                    <motion.span
                      layoutId="active-role-tab-rule"
                      transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#1d4ed8] dark:bg-blue-400"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Actions: Realtime status, Theme toggle, User Profile */}
          <div className="flex items-center gap-2">
            {/* Database & Sync Status Button */}
            <button
              id="connection-status-button"
              type="button"
              onClick={onOpenFirestoreModal}
              aria-label={`Database status: ${syncStatus === 'connected' ? 'Connected' : syncStatus === 'offline' ? 'Offline' : 'Syncing'}`}
              title={`Database Status: ${syncStatus === 'connected' ? 'Connected' : syncStatus === 'offline' ? 'Offline' : 'Connecting...'}`}
              className="mobile-tap-control flex items-center justify-center gap-2 min-w-[44px] sm:min-w-0 px-2.5 py-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Database
                aria-hidden="true"
                className={`h-3.5 w-3.5 sm:hidden ${
                  syncStatus === 'connected'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              />
              <span
                className={`h-2 w-2 rounded-full ${
                  syncStatus === 'connected'
                    ? 'bg-emerald-600 dark:bg-emerald-400'
                    : 'bg-amber-500'
                }`}
              />
              <span className="hidden sm:inline text-[11px] tracking-tight">
                {syncStatus === 'connected' ? 'Connected' : syncStatus === 'offline' ? 'Offline' : 'Syncing...'}
              </span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              id="theme-toggle"
              type="button"
              onClick={() => setDarkMode(prev => !prev)}
              aria-label="Toggle dark mode"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="icon-button border border-[var(--border)] bg-[var(--surface)]"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>

            {/* User Dropdown / Auth status */}
            <div className="relative z-30" ref={userDropdownRef}>
              {currentUser ? (
                <button
                  id="user-profile-menu-button"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={userDropdownOpen}
                  aria-controls="user-profile-menu"
                  onClick={e => {
                    if (!userDropdownOpen && e.detail === 0) {
                      pendingMenuFocusRef.current = 'first';
                    }
                    setUserDropdownOpen(prev => !prev);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const target = e.key === 'ArrowUp' ? 'last' : 'first';
                      if (!userDropdownOpen) {
                        pendingMenuFocusRef.current = target;
                        setUserDropdownOpen(true);
                      } else {
                        const items = Array.from(
                          userMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') || []
                        );
                        if (items.length > 0) {
                          (target === 'last' ? items[items.length - 1] : items[0])?.focus();
                        }
                      }
                    }
                  }}
                  className="mobile-tap-control flex items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-subtle)] py-1 px-2.5 text-left text-xs transition-colors"
                >
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-[5px] bg-gradient-to-tr ${
                      currentUser.avatarColor || 'from-blue-600 to-indigo-600'
                    } text-white font-semibold text-[11px] shrink-0`}
                  >
                    {currentUser.name
                      .split(' ')
                      .map(p => p[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5">
                    {isSuperadmin ? (
                      <Shield className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                    ) : isCreativeDirector ? (
                      <Crown className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                    ) : null}
                    <span className="text-xs font-semibold text-[var(--text-primary)] max-w-[110px] truncate">
                      {currentUser.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      {isSuperadmin ? 'Superadmin' : currentUserTag.label}
                    </span>
                  </div>
                  {canManageMembers && accessRequests.length > 0 && (
                    <span
                      title={`${accessRequests.length} pending access request${accessRequests.length === 1 ? '' : 's'}`}
                      className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular-nums"
                    >
                      {accessRequests.length}
                    </span>
                  )}
                  {!isClickupConnected && onOpenSetupModal && (
                    <span
                      title="ClickUp setup incomplete — open menu to finish Workspace Setup"
                      aria-hidden="true"
                      className="sm:hidden h-2 w-2 rounded-full bg-amber-500 shrink-0"
                    />
                  )}
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)] shrink-0" />
                </button>
              ) : (
                <button
                  id="login-button"
                  type="button"
                  onClick={onOpenLoginModal}
                  className="button-primary"
                >
                  <span>Sign In</span>
                </button>
              )}

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div
                  ref={userMenuRef}
                  id="user-profile-menu"
                  role="menu"
                  aria-label="User menu"
                  onKeyDown={e => {
                    handleRovingMenuKeyDown(e.nativeEvent, e.currentTarget);
                  }}
                  className="menu-surface absolute right-0 mt-1.5 w-72 rounded-[9px] border border-[var(--border)] p-1.5 z-50 text-[var(--text-primary)]"
                >
                  {currentUser && (
                    <div className="border-b border-[var(--border-subtle)] px-2.5 pb-2.5 pt-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {currentUser.name}
                        </p>
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[5px] border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] shrink-0">
                          {isSuperadmin ? 'Superadmin' : currentUserTag.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                        {currentUser.email}
                      </p>
                    </div>
                  )}

                  <div className="pt-1 space-y-0.5">
                    {canManageMembers && accessRequests.length > 0 && (
                      <div className="mb-1 border-b border-[var(--border-subtle)] pb-1.5">
                        <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                          <span>Pending Access</span>
                          <span className="tabular-nums text-[#1d4ed8] dark:text-blue-400">{accessRequests.length}</span>
                        </div>
                        {dismissError && <p role="alert" className="text-xs text-red-600 px-2">{dismissError}</p>}
                        <div className="max-h-48 overflow-y-auto space-y-1 px-1">
                          {accessRequests.map(reqItem => (
                            <div
                              key={reqItem.id}
                              className="flex items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 hover:bg-[var(--surface-subtle)]"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-[var(--text-primary)] truncate">{reqItem.name}</p>
                                <p className="text-[11px] text-[var(--text-secondary)] truncate">{reqItem.email}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUserDropdownOpen(false);
                                    document.getElementById('user-profile-menu-button')?.focus();
                          onOpenNewUserModal({ name: reqItem.name, email: reqItem.email });
                                  }}
                                  className="rounded-[5px] bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Dismiss request for ${reqItem.email}`}
                                  onClick={() => {
                                    setDismissError(null);
                                    dismissAccessRequest(reqItem.id).catch(() => setDismissError('Could not dismiss the request. Try again.'));
                                  }}
                                  className="rounded-[5px] border border-[var(--border)] px-1.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {canManageMembers && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          document.getElementById('user-profile-menu-button')?.focus();
                          onOpenNewUserModal(null);
                        }}
                        className="menu-item"
                      >
                        <UserPlus className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                        <span>Add Team Member</span>
                      </button>
                    )}

                    {onOpenSetupModal && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          document.getElementById('user-profile-menu-button')?.focus();
                          onOpenSetupModal();
                        }}
                        className="menu-item justify-between cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <ListChecks className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                          <span>Workspace Setup</span>
                        </span>
                        {!isClickupConnected && (
                          <span className="sm:hidden rounded-[4px] bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            Setup
                          </span>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        document.getElementById('user-profile-menu-button')?.focus();
                        onOpenFirestoreModal();
                      }}
                      className="menu-item cursor-pointer"
                    >
                      <Database className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                      <span>Database &amp; Compliance</span>
                    </button>

                    {onOpenShortcutsModal && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          document.getElementById('user-profile-menu-button')?.focus();
                          onOpenShortcutsModal();
                        }}
                        className="menu-item justify-between cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Keyboard className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400" />
                          <span>Keyboard Shortcuts</span>
                        </span>
                        <kbd className="ledger-badge font-mono !py-0">?</kbd>
                      </button>
                    )}

                    <div role="separator" className="my-1 border-t border-[var(--border-subtle)]" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="menu-item !text-red-600 dark:!text-red-400 hover:!bg-red-50 dark:hover:!bg-red-500/10"
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

        {/* Mobile Sub-header Bottom-Ruled Tabs (All, Content, Design) */}
        <div className="mobile-team-navigation flex xl:hidden items-stretch border-t border-[var(--border-subtle)] overflow-x-auto no-scrollbar">
          <div className="flex items-stretch gap-5 w-full">
            {roleTabs.map(tab => {
              const isActive = activeRoleTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveRoleTab(tab.key)}
                  aria-pressed={isActive}
                  className={`relative flex items-center gap-1.5 px-1 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`tabular-nums text-[11px] ${isActive ? 'text-[#1d4ed8] dark:text-blue-400' : 'text-[var(--text-muted)]'}`}>
                    {tab.count}
                  </span>
                  {isActive && (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#1d4ed8] dark:bg-blue-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
};

export const Header = React.memo(HeaderComponent);
Header.displayName = 'Header';
