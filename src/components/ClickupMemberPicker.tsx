import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ClickupMember } from '../types';
import { Search, X, Check, Loader2, RefreshCw } from 'lucide-react';

interface ClickupMemberPickerProps {
  members: ClickupMember[];
  selectedMemberId?: string;
  onSelect: (member: ClickupMember | null) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
  disabled?: boolean;
}

export const ClickupMemberPicker: React.FC<ClickupMemberPickerProps> = ({
  members,
  selectedMemberId,
  onSelect,
  isLoading = false,
  onRefresh,
  disabled = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedMember = useMemo(() => {
    if (!selectedMemberId) return null;
    return members.find(m => m.id === selectedMemberId) || null;
  }, [members, selectedMemberId]);

  // Filter members by query
  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return members;
    return members.filter(
      m =>
        m.username.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q))
    );
  }, [members, searchQuery]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Current selection summary card if selected and not actively searching */}
      {selectedMember && !isOpen ? (
        <div className="flex items-center justify-between rounded-xl border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/30 p-2.5 transition-all">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedMember.profilePicture ? (
              <img
                src={selectedMember.profilePicture}
                alt={selectedMember.username}
                className="h-7 w-7 rounded-full object-cover shrink-0 border border-indigo-300 dark:border-indigo-700"
              />
            ) : (
              <div
                style={{ backgroundColor: selectedMember.color || '#6366f1' }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0 shadow-xs"
              >
                {selectedMember.initials || selectedMember.username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                {selectedMember.username}
              </p>
              {selectedMember.email && (
                <p className="text-[10px] text-neutral-500 dark:text-white/40 truncate">
                  {selectedMember.email}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline px-1.5 py-0.5 rounded cursor-pointer"
            >
              Change
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(null)}
              title="Clear ClickUp mapping"
              className="rounded p-1 text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* In-Line Search Input and Results */
        <div className="relative">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400 dark:text-white/40">
              <Search className="h-3.5 w-3.5" />
            </div>
            <input
              ref={inputRef}
              type="text"
              disabled={disabled}
              value={searchQuery}
              onFocus={() => setIsOpen(true)}
              onChange={e => {
                setSearchQuery(e.target.value);
                setIsOpen(true);
              }}
              placeholder="Search ClickUp member by name or email..."
              className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 pl-9 pr-8 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          {/* Dropdown Options */}
          {isOpen && (
            <div className="mt-1.5 w-full rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] shadow-xl p-1.5 z-30 max-h-56 overflow-y-auto space-y-0.5 animate-in fade-in duration-100">
              {/* Option to unassign/clear */}
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  !selectedMemberId
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'text-neutral-600 dark:text-white/60 hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 dark:bg-white/10 text-neutral-500 dark:text-white/40 text-[10px]">
                    ∅
                  </div>
                  <span>-- No ClickUp Mapping (Unassigned) --</span>
                </div>
                {!selectedMemberId && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-neutral-500 dark:text-white/40">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  <span>Loading ClickUp members...</span>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-4 text-center text-xs text-neutral-400 dark:text-white/40">
                  No ClickUp members match "{searchQuery}"
                </div>
              ) : (
                filteredMembers.map(m => {
                  const isCurrent = m.id === selectedMemberId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onSelect(m);
                        setIsOpen(false);
                        setSearchQuery('');
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                          : 'text-neutral-800 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {m.profilePicture ? (
                          <img
                            src={m.profilePicture}
                            alt={m.username}
                            className="h-6 w-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div
                            style={{ backgroundColor: m.color || '#6366f1' }}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                          >
                            {m.initials || m.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="text-left min-w-0">
                          <p className="truncate font-medium">{m.username}</p>
                          {m.email && (
                            <p className="text-[10px] text-neutral-400 dark:text-white/40 truncate">
                              {m.email}
                            </p>
                          )}
                        </div>
                      </div>
                      {isCurrent && <Check className="h-3.5 w-3.5 text-indigo-500 shrink-0 ml-2" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Helper reload action if no members available */}
      {members.length === 0 && !isLoading && onRefresh && (
        <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-white/40 px-1">
          <span>No workspace members loaded.</span>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Fetch from ClickUp</span>
          </button>
        </div>
      )}
    </div>
  );
};
