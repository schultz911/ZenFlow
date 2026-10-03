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
  Layers,
  Crown,
  Shield,
  Key,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface HeaderProps {
  onOpenLoginModal: () => void;
  onOpenNewUserModal: () => void;
  onOpenFirestoreModal: () => void;
  onOpenClickupModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenLoginModal,
  onOpenNewUserModal,
  onOpenFirestoreModal,
  onOpenClickupModal,
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
    canSwitchBoards,
    creativeDirectors,
    activeBoardId,
    setActiveBoardId,
    isZensciencesUser,
    isClickupConnected,
    clickupSpaces,
    selectedClickupSpaceId,
    setSelectedClickupSpaceId,
    setShowClickupPrompt,
  } = useDashboard();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [boardDropdownOpen, setBoardDropdownOpen] = useState(false);
  const [spaceDropdownOpen, setSpaceDropdownOpen] = useState(false);

  const userDropdownRef = useRef<HTMLDivElement>(null);
  const boardDropdownRef = useRef<HTMLDivElement>(null);
  const spaceDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userDropdownRef.current && !userDropdownRef.current.contains(target)) {
        setUserDropdownOpen(false);
      }
      if (boardDropdownRef.current && !boardDropdownRef.current.contains(target)) {
        setBoardDropdownOpen(false);
      }
      if (spaceDropdownRef.current && !spaceDropdownRef.current.contains(target)) {
        setSpaceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const contentUsers = useMemo(() => users.filter(u => u.role === 'content'), [users]);
  const designUsers = useMemo(() => users.filter(u => u.role === 'design'), [users]);

  // Current active board display name
  const currentBoardLabel = useMemo(() => {
    if (activeBoardId === 'all') return 'All Boards (Master View)';
    const cd = creativeDirectors.find(c => c.id === activeBoardId);
    if (cd) return `${cd.name}'s Board`;
    return 'Team Board';
  }, [activeBoardId, creativeDirectors]);

  // Current active ClickUp Space display name
  const currentSpace = useMemo(() => {
    return clickupSpaces.find(s => s.id === selectedClickupSpaceId);
  }, [clickupSpaces, selectedClickupSpaceId]);

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

            {/* Board Selector Dropdown (For Superadmin and Creative Directors) */}
            {canSwitchBoards && (
              <div className="relative ml-2 hidden lg:block" ref={boardDropdownRef}>
                <button
                  onClick={() => setBoardDropdownOpen(prev => !prev)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100/80 dark:bg-white/5 hover:bg-neutral-200/60 dark:hover:bg-white/10 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span className="max-w-[140px] truncate">{currentBoardLabel}</span>
                  <ChevronDown className="w-3 h-3 text-neutral-400" />
                </button>

                {boardDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-56 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-1.5 shadow-2xl z-50 text-neutral-900 dark:text-white animate-in fade-in zoom-in-95 duration-150">
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-white/40">
                      Select Team Board
                    </p>
                    {isSuperadmin && (
                      <button
                        onClick={() => {
                          setActiveBoardId('all');
                          setBoardDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                          activeBoardId === 'all'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold'
                            : 'hover:bg-neutral-100 dark:hover:bg-white/5'
                        }`}
                      >
                        <span>All Boards (Master View)</span>
                        {activeBoardId === 'all' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {creativeDirectors.map(cd => (
                      <button
                        key={cd.id}
                        onClick={() => {
                          setActiveBoardId(cd.id);
                          setBoardDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                          activeBoardId === cd.id
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold'
                            : 'hover:bg-neutral-100 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">{cd.name}'s Team</span>
                        </div>
                        {activeBoardId === cd.id && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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

          {/* Right Actions: ClickUp Space Dropdown, Realtime status, Theme toggle, User Profile */}
          <div className="flex items-center gap-2">

            {/* ClickUp Space Selector (only for @zensciences.com users) */}
            {isZensciencesUser && (
              <>
                {isClickupConnected ? (
                  <div className="relative" ref={spaceDropdownRef}>
                    <button
                      onClick={() => setSpaceDropdownOpen(prev => !prev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 text-xs font-semibold text-purple-700 dark:text-purple-300 transition-colors"
                      title="Select ClickUp Space"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="max-w-[120px] truncate">
                        {currentSpace?.name || 'ClickUp Space'}
                      </span>
                      <ChevronDown className="w-3 h-3 text-purple-400" />
                    </button>

                    {spaceDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-56 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-1.5 shadow-2xl z-50 text-neutral-900 dark:text-white animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-2.5 py-1 flex items-center justify-between border-b border-neutral-100 dark:border-white/5 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-white/40">
                            ClickUp Space
                          </span>
                          <button
                            onClick={() => {
                              setSpaceDropdownOpen(false);
                              if (onOpenClickupModal) onOpenClickupModal();
                              else setShowClickupPrompt(true);
                            }}
                            className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
                          >
                            Settings
                          </button>
                        </div>
                        {clickupSpaces.length === 0 ? (
                          <div className="p-3 text-center text-xs text-neutral-400">
                            No spaces found
                          </div>
                        ) : (
                          clickupSpaces.map(space => (
                            <button
                              key={space.id}
                              onClick={() => {
                                setSelectedClickupSpaceId(space.id, space.name);
                                setSpaceDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                                selectedClickupSpaceId === space.id
                                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold'
                                  : 'hover:bg-neutral-100 dark:hover:bg-white/5'
                              }`}
                            >
                              <span className="truncate">{space.name}</span>
                              {selectedClickupSpaceId === space.id && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (onOpenClickupModal) onOpenClickupModal();
                      else setShowClickupPrompt(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold transition-colors"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Connect ClickUp</span>
                  </button>
                )}
              </>
            )}
            
            {/* Real-time cloud sync icon */}
            <button
              id="firestore-status-button"
              onClick={onOpenFirestoreModal}
              title={
                syncStatus === 'connected'
                  ? 'Firestore Storage Status (Click to view)'
                  : 'Syncing Firestore...'
              }
              className="flex items-center justify-center p-2 rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors cursor-pointer"
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
            </button>

            {/* Dark Mode Toggle */}
            <button
              id="theme-toggle"
              onClick={() => setDarkMode(prev => !prev)}
              aria-label="Toggle dark mode"
              className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* User Dropdown / Auth status */}
            <div className="relative z-30" ref={userDropdownRef}>
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
                    <p className="text-[10px] uppercase tracking-widest text-neutral-500 dark:text-white/40">
                      {isSuperadmin
                        ? 'Superadmin'
                        : isCreativeDirector
                        ? 'Creative Dir.'
                        : currentUser.role === 'content'
                        ? 'Content'
                        : 'Design'}
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
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-2 shadow-2xl transition-all z-50 text-neutral-900 dark:text-white animate-in fade-in zoom-in-95 duration-150">
                  {currentUser && (
                    <div className="border-b border-neutral-100 dark:border-white/10 px-2 pb-2.5 pt-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                          {currentUser.name}
                        </p>
                        {isSuperadmin && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            Superadmin
                          </span>
                        )}
                        {!isSuperadmin && isCreativeDirector && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                            Creative Dir.
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-white/40 truncate mt-0.5">
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

                    {isZensciencesUser && (
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          if (onOpenClickupModal) onOpenClickupModal();
                          else setShowClickupPrompt(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-700 dark:text-white/80 hover:bg-neutral-50 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                      >
                        <Key className="h-3.5 w-3.5 text-purple-500" />
                        <span>ClickUp API Settings</span>
                      </button>
                    )}

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
