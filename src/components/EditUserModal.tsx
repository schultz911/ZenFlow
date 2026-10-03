import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { User, Role } from '../types';
import { X, UserCog, Palette, FileText, Crown, ShieldCheck, Loader2 } from 'lucide-react';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const {
    updateUserProfile,
    currentUser,
    isSuperadmin,
    creativeDirectors,
    canManageMembers,
  } = useDashboard();

  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('content');
  const [isCD, setIsCD] = useState(false);
  const [selectedCDId, setSelectedCDId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state whenever user changes or modal opens
  useEffect(() => {
    if (user && isOpen) {
      setName(user.name);
      setRole(user.role);
      setIsCD(!!user.isCreativeDirector);
      setSelectedCDId(user.creativeDirectorId || '');
      setError(null);
    }
  }, [user, isOpen]);

  // Global Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !user) return null;

  // Authorization check: Only Superadmins and Creative Directors can edit member information
  if (!canManageMembers) {
    return null;
  }

  const isTargetSuperadmin = user.email.toLowerCase() === 'kiran.s@zensciences.com';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please enter a valid full name');
      return;
    }

    setIsSubmitting(true);
    try {
      const updates: Partial<User> = {
        name: cleanName,
        role,
      };

      // Only Superadmin can change Creative Director status
      if (isSuperadmin) {
        updates.isCreativeDirector = isTargetSuperadmin ? true : isCD;
      }

      // Assign CD ID if not CD
      if (isCD || (isSuperadmin && isTargetSuperadmin)) {
        updates.creativeDirectorId = undefined;
      } else {
        updates.creativeDirectorId = selectedCDId || undefined;
      }

      await updateUserProfile(user.id, updates);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update member profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        id="edit-user-modal"
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#111111] shadow-2xl p-6 text-neutral-900 dark:text-white transition-all animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Edit Team Member
              </h2>
              <p className="text-xs text-neutral-500 dark:text-white/40">
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Email Address (read-only) */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-100 dark:bg-white/5 px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
            />
            <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
              Registered email is anchored to Google Workspace authentication.
            </p>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Workspace Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('content')}
                className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  role === 'content'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500'
                    : 'border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] text-neutral-600 dark:text-white/60 hover:border-neutral-300'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Content & Copy</span>
              </button>

              <button
                type="button"
                onClick={() => setRole('design')}
                className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  role === 'design'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500'
                    : 'border-neutral-200 dark:border-white/10 bg-white dark:bg-[#141414] text-neutral-600 dark:text-white/60 hover:border-neutral-300'
                }`}
              >
                <Palette className="h-4 w-4" />
                <span>Design</span>
              </button>
            </div>
          </div>

          {/* Creative Director Status (Only editable by Superadmin) */}
          {isSuperadmin && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-50/30 dark:bg-purple-950/10 p-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTargetSuperadmin ? true : isCD}
                  disabled={isTargetSuperadmin}
                  onChange={e => setIsCD(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300 dark:border-neutral-700 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-900 dark:text-purple-300">
                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                    <span>Creative Director Privileges</span>
                    {isTargetSuperadmin && (
                      <span className="text-[10px] bg-purple-200 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 px-1.5 py-0.2 rounded font-bold">
                        Superadmin
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-white/50 mt-0.5 leading-relaxed">
                    {isTargetSuperadmin
                      ? 'The Superadmin account permanently retains full Creative Director permissions across all team boards.'
                      : 'Creative Directors manage their own team board, assign tasks, and access executive workspace analytics.'}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Assigned Creative Director Dropdown (if not a CD) */}
          {!isCD && !isTargetSuperadmin && (
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Assigned Team Board (Creative Director)
              </label>
              <select
                value={selectedCDId}
                onChange={e => setSelectedCDId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] px-3 py-2 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Independent / Direct Board</option>
                {creativeDirectors
                  .filter(cd => cd.id !== user.id)
                  .map(cd => (
                    <option key={cd.id} value={cd.id}>
                      {cd.name} ({cd.email})
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                This member will appear on the selected Creative Director's team board view.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-[#141414] px-3.5 py-2 text-xs font-medium text-neutral-600 dark:text-white/50 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="edit-user-submit-btn"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-900/20 hover:bg-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
