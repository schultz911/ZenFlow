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
        (m.username || '').toLowerCase().includes(q) ||
        Boolean(m.email && m.email.toLowerCase().includes(q))
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
      {/* Current selection summary if selected and not actively searching */}
      {selectedMember && !isOpen ? (
        <div className="flex items-center justify-between rounded-[7px] border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-2.5 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedMember.profilePicture ? (
              <img
                src={selectedMember.profilePicture}
                alt={selectedMember.username}
                className="h-7 w-7 rounded-[6px] object-cover shrink-0 border border-[var(--border)]"
              />
            ) : (
              <div
                style={{ backgroundColor: selectedMember.color || '#1d4ed8' }}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[11px] font-bold text-white shrink-0"
              >
                {selectedMember.initials || (selectedMember.username ? selectedMember.username.slice(0, 2).toUpperCase() : '??')}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {selectedMember.username}
              </p>
              {selectedMember.email && (
                <p className="text-[11px] text-[var(--text-secondary)] truncate">
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
              className="text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline px-1.5 py-0.5 rounded-[5px] cursor-pointer"
              style={{ minHeight: 'auto' }}
            >
              Change
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(null)}
              title="Clear ClickUp mapping"
              aria-label="Clear ClickUp mapping"
              className="rounded-[5px] p-1 text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
              style={{ minHeight: 'auto' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* In-Line Search Input and Results */
        <div className="relative">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-muted)]">
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
              className="field-control pl-9 pr-8"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear ClickUp search"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown Options */}
          {isOpen && (
            <div className="menu-surface mt-1.5 w-full rounded-[9px] border border-[var(--border)] p-1.5 z-30 max-h-56 overflow-y-auto space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-xs transition-colors cursor-pointer ${
                  !selectedMemberId
                    ? 'bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-muted)] text-[10px]">
                    —
                  </div>
                  <span>No ClickUp Mapping (Unassigned)</span>
                </div>
                {!selectedMemberId && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--text-secondary)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#1d4ed8] dark:text-blue-400" />
                  <span>Loading ClickUp members...</span>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-4 text-center text-xs text-[var(--text-secondary)]">
                  No ClickUp members match &ldquo;{searchQuery}&rdquo;
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
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-xs transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-300 font-semibold'
                          : 'text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {m.profilePicture ? (
                          <img
                            src={m.profilePicture}
                            alt={m.username}
                            className="h-6 w-6 rounded-[5px] object-cover shrink-0"
                          />
                        ) : (
                          <div
                            style={{ backgroundColor: m.color || '#1d4ed8' }}
                            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[10px] font-bold text-white shrink-0"
                          >
                            {m.initials || (m.username ? m.username.slice(0, 2).toUpperCase() : '??')}
                          </div>
                        )}
                        <div className="text-left min-w-0">
                          <p className="truncate font-medium">{m.username}</p>
                          {m.email && (
                            <p className="text-[11px] text-[var(--text-secondary)] truncate">
                              {m.email}
                            </p>
                          )}
                        </div>
                      </div>
                      {isCurrent && <Check className="h-3.5 w-3.5 text-[#1d4ed8] dark:text-blue-400 shrink-0 ml-2" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {members.length === 0 && !isLoading && onRefresh && (
        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] px-0.5">
          <span>No workspace members loaded.</span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 text-[#1d4ed8] dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            style={{ minHeight: 'auto' }}
          >
            <RefreshCw className="h-3 w-3" />
            <span>Fetch from ClickUp</span>
          </button>
        </div>
      )}
    </div>
  );
};
