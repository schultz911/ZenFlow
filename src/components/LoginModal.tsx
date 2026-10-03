import React, { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { Role } from '../types';
import { X, Mail, User as UserIcon, Palette, FileText, ArrowRight, ShieldCheck, Crown, Loader2 } from 'lucide-react';

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
    isCreativeDirector,
    creativeDirectors,
  } = useDashboard();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('content');
  const [isCD, setIsCD] = useState(false);
  const [selectedCDId, setSelectedCDId] = useState<string>(() => {
    if (currentUser?.isCreativeDirector) return currentUser.id;
    return creativeDirectors[0]?.id || '';
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSigningIn(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please verify your account is registered.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
        await createUser({
          name: cleanName,
          email: cleanEmail,
          role,
          isCreativeDirector: isSuperadmin ? isCD : false,
          creativeDirectorId: isCD ? undefined : (selectedCDId || undefined),
        });
      } else {
        await login(cleanName, role, cleanEmail);
      }
      setName('');
      setEmail('');
      setIsCD(false);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Operation failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting && !isGoogleSigningIn) onClose();
      }}
    >
      <div
        id="login-modal"
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-6 shadow-2xl transition-all text-neutral-900 dark:text-white"
      >
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              {isNewAccountOnly ? 'Add Team Member' : 'Sign In to ZenFlow'}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-white/40 mt-0.5">
              {isNewAccountOnly
                ? 'Provision a new team member and assign their Creative Director.'
                : 'Sign in with your registered account to modify the board.'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting || isGoogleSigningIn}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="my-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-500 border border-red-500/20 font-medium">
            {error}
          </div>
        )}

        {/* In Sign In Mode: Emphasize Google Sign-In */}
        {!isNewAccountOnly && (
          <div className="pt-4 pb-2 space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleSigningIn}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-zinc-800/80 hover:bg-neutral-50 dark:hover:bg-zinc-700 py-2.5 px-4 text-xs font-semibold text-neutral-800 dark:text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isGoogleSigningIn ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              ) : (
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
              )}
              <span>{isGoogleSigningIn ? 'Verifying account...' : 'Continue with Google'}</span>
            </button>

            <div className="relative flex items-center justify-center my-3">
              <div className="border-t border-neutral-200 dark:border-neutral-800 w-full" />
              <span className="bg-white dark:bg-[#0D0D0D] px-2 text-[10px] uppercase tracking-wider text-neutral-400">
                Or sign in with email
              </span>
            </div>
          </div>
        )}

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
                className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2.5 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                required
              />
            </div>
          </div>

          {/* Role Selection: Content or Design */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
              Role & Swimlane Tab
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="select-role-content"
                onClick={() => setRole('content')}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                  role === 'content'
                    ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-500/30'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] hover:border-neutral-300 dark:hover:border-white/10'
                }`}
              >
                <div
                  className={`rounded-lg p-1.5 ${
                    role === 'content'
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                      : 'bg-neutral-200/60 dark:bg-white/5 text-neutral-500 dark:text-white/40'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white">Content</p>
                  <p className="text-[11px] text-neutral-500 dark:text-white/40 mt-0.5">
                    Writing & Strategy
                  </p>
                </div>
              </button>

              <button
                type="button"
                id="select-role-design"
                onClick={() => setRole('design')}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                  role === 'design'
                    ? 'border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-[#141414] hover:border-neutral-300 dark:hover:border-white/10'
                }`}
              >
                <div
                  className={`rounded-lg p-1.5 ${
                    role === 'design'
                      ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                      : 'bg-neutral-200/60 dark:bg-white/5 text-neutral-500 dark:text-white/40'
                  }`}
                >
                  <Palette className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white">Design</p>
                  <p className="text-[11px] text-neutral-500 dark:text-white/40 mt-0.5">
                    Adaptive & Visual
                  </p>
                </div>
              </button>
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
                className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2.5 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                required
              />
            </div>
          </div>

          {/* New Account Only: Creative Director Option (Visible ONLY to Superadmin) */}
          {isNewAccountOnly && isSuperadmin && (
            <div className="p-3 rounded-xl border border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCD}
                  onChange={e => setIsCD(e.target.checked)}
                  className="rounded border-purple-400 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <div className="flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-semibold text-purple-900 dark:text-purple-200">
                    Designate as Creative Director
                  </span>
                </div>
              </label>
              <p className="text-[11px] text-purple-700/80 dark:text-purple-300/70 mt-1 pl-6">
                Creative Directors lead a dedicated team board and can add members or manage team tasks.
              </p>
            </div>
          )}

          {/* New Account Only: Creative Director Assignment (if not designated as a CD) */}
          {isNewAccountOnly && !isCD && creativeDirectors.length > 0 && (
            <div>
              <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-white/40 mb-1.5">
                Assigned Creative Director / Team
              </label>
              <div className="relative">
                <select
                  value={selectedCDId}
                  onChange={e => setSelectedCDId(e.target.value)}
                  disabled={!isSuperadmin && isCreativeDirector}
                  className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2 px-3 text-xs text-neutral-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  {creativeDirectors.map(cd => (
                    <option key={cd.id} value={cd.id}>
                      {cd.name} ({cd.email})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-neutral-500 dark:text-white/40 mt-1">
                This member will appear on this Creative Director's board.
              </p>
            </div>
          )}

          <button
            type="submit"
            id="login-submit-button"
            disabled={isSubmitting || isGoogleSigningIn}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-900/20 hover:bg-blue-500 focus:outline-none transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Processing...</span>
            ) : (
              <>
                <span>{isNewAccountOnly ? 'Create Account & Assign Board' : 'Sign In'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
