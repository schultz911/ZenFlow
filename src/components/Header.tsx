import React, { useState, useRef, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { Role, User } from '../types';
import {
  Sun,
  Moon,
  Users,
  Plus,
  Radio,
  CheckCircle2,
  LogOut,
  ChevronDown,
  UserPlus,
  Palette,
  FileText,
  Layers,
  RotateCcw,
  Cloud,
} from 'lucide-react';

interface HeaderProps {
  onOpenLoginModal: () => void;
  onOpenNewUserModal: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenLoginModal,
  onOpenNewUserModal,
  searchQuery,
  onSearchChange,
}) => {
  const {
    currentUser,
    users,
    tasks,
    activeRoleTab,
    setActiveRoleTab,
    darkMode,
    setDarkMode,
    syncStatus,
    switchUser,
    logout,
    resetDemoData,
  } = useDashboard();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const contentUsers = users.filter(u => u.role === 'content');
  const designUsers = users.filter(u => u.role === 'design');

  return (
    <header className="sticky top-0 z-30 w-full border-b border-neutral-200 dark:border-white/5 bg-white/95 dark:bg-[#0D0D0D]/95 backdrop-blur-md transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-4">
          
          {/* Logo & Brand: zenFlow */}
          <div className="flex items-center gap-3">
            <div
              id="zenflow-logo"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 dark:bg-[#1A1A1A] border border-neutral-800 dark:border-white/10 text-blue-500 shadow-sm shrink-0"
            >
              {/* Z logo with flowy wave horizontal lines */}
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
              <p className="text-[11px] font-medium text-neutral-500 dark:text-white/40 tracking-normal mt-0.5">
                Workflow Management System
              </p>
            </div>
          </div>

          {/* Center: Role Switcher Tabs (Content & Design only) */}
          <div className="hidden md:flex items-center rounded-full bg-neutral-100 dark:bg-[#1A1A1A] p-1 border border-neutral-200 dark:border-white/5">
            <button
              id="tab-content"
              onClick={() => setActiveRoleTab('content')}
              className={`flex items-center gap-2 rounded-full px-5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                activeRoleTab === 'content'
                  ? 'bg-white dark:bg-[#2A2A2A] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              <span>Content</span>
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
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
              className={`flex items-center gap-2 rounded-full px-5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                activeRoleTab === 'design'
                  ? 'bg-white dark:bg-[#2A2A2A] text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white'
              }`}
            >
              <Palette className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Design</span>
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                activeRoleTab === 'design'
                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                  : 'bg-neutral-200 dark:bg-white/5 text-neutral-600 dark:text-white/40'
              }`}>
                {designUsers.length}
              </span>
            </button>
          </div>

          {/* Right Actions: Realtime status, Search, Theme toggle, User Profile */}
          <div className="flex items-center gap-2">
            
            {/* Real-time cloud sync icon */}
            <div
              title={
                syncStatus === 'connected'
                  ? 'Cloud Synced'
                  : 'Syncing...'
              }
              className="flex items-center justify-center p-2 rounded-full text-neutral-500 hover:text-neutral-900 dark:text-white/40 dark:hover:text-white transition-colors"
            >
              <Cloud
                className={`h-4 w-4 ${
                  syncStatus === 'connected'
                    ? 'text-blue-500'
                    : syncStatus === 'connecting'
                    ? 'text-amber-400 animate-pulse'
                    : 'text-neutral-400 dark:text-white/20'
                }`}
              />
            </div>

            {/* Dark Mode Toggle */}
            <button
              id="theme-toggle"
              onClick={() => setDarkMode(prev => !prev)}
              aria-label="Toggle dark mode"
              className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Quick Demo Reset */}
            <button
              id="reset-demo-btn"
              onClick={resetDemoData}
              title="Reset to default seed data"
              className="hidden sm:inline-flex rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white/80 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* User Dropdown / Auth status */}
            <div className="relative" ref={dropdownRef}>
              {currentUser ? (
                <button
                  id="user-profile-menu-button"
                  onClick={() => setUserDropdownOpen(prev => !prev)}
                  className="flex items-center gap-2.5 rounded-full border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#141414] py-1.5 px-3 text-left text-xs hover:border-neutral-300 dark:hover:border-white/20 transition-colors"
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
                    <p className="text-xs font-medium text-neutral-900 dark:text-white max-w-[120px] truncate">
                      {currentUser.name}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-neutral-500 dark:text-white/40">
                      {currentUser.role === 'content' ? 'Content' : 'Design'}
                    </p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
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
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-2 shadow-2xl transition-all z-50 text-neutral-900 dark:text-white">
                  {currentUser && (
                    <div className="border-b border-neutral-100 dark:border-white/10 px-2 pb-2.5 pt-1">
                      <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                        {currentUser.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-white/40 truncate">
                        {currentUser.email}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <span className="text-[10px] uppercase tracking-wider text-neutral-600 dark:text-white/60">
                          {currentUser.role === 'content' ? 'Content' : 'Design'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Switch to another team member */}
                  <div className="py-2">
                    <p className="px-2 text-[10px] uppercase tracking-widest text-neutral-400 dark:text-white/30">
                      Switch Active User
                    </p>
                    <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                      {users.map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            switchUser(u);
                            setUserDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-left transition-colors ${
                            currentUser?.id === u.id
                              ? 'bg-neutral-100 dark:bg-[#2A2A2A] font-medium text-neutral-900 dark:text-white'
                              : 'text-neutral-600 dark:text-white/60 hover:bg-neutral-50 dark:hover:bg-[#1A1A1A] hover:text-neutral-900 dark:hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div
                              className={`h-5 w-5 rounded-full bg-gradient-to-tr ${
                                u.avatarColor || 'from-blue-600 to-indigo-600'
                              } text-[9px] font-bold text-white flex items-center justify-center shrink-0 border border-white/10`}
                            >
                              {u.name[0]}
                            </div>
                            <span className="truncate">{u.name}</span>
                          </div>
                          <span className="text-[10px] uppercase text-neutral-400 dark:text-white/40 shrink-0">
                            {u.role === 'content' ? 'Content' : 'Design'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-neutral-100 dark:border-white/10 pt-1.5 space-y-0.5">
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onOpenNewUserModal();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    >
                      <UserPlus className="h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
                      <span>Create New Account</span>
                    </button>

                    <button
                      onClick={async () => {
                        setUserDropdownOpen(false);
                        await resetDemoData();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-600 dark:text-white/60 hover:bg-neutral-50 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-neutral-400 dark:text-white/40" />
                      <span>Clear Workspace Data</span>
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

        {/* Mobile Sub-header Tabs (Content & Design only) */}
        <div className="flex md:hidden items-center justify-between border-t border-neutral-200 dark:border-white/5 py-2">
          <div className="flex items-center rounded-full bg-neutral-100 dark:bg-[#1A1A1A] p-1 text-xs w-full justify-around border border-neutral-200 dark:border-white/5">
            <button
              onClick={() => setActiveRoleTab('content')}
              className={`flex-1 rounded-full py-1 text-center font-medium ${
                activeRoleTab === 'content'
                  ? 'bg-white dark:bg-[#2A2A2A] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500 dark:text-white/40'
              }`}
            >
              Content ({contentUsers.length})
            </button>
            <button
              onClick={() => setActiveRoleTab('design')}
              className={`flex-1 rounded-full py-1 text-center font-medium ${
                activeRoleTab === 'design'
                  ? 'bg-white dark:bg-[#2A2A2A] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500 dark:text-white/40'
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
