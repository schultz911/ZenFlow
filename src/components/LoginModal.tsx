import React, { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { Role } from '../types';
import { X, Mail, User as UserIcon, Palette, FileText, ArrowRight } from 'lucide-react';

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
  const { login, users, switchUser } = useDashboard();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('content');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setError('Please enter your full name');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please provide a valid official email address');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(cleanName, role, cleanEmail);
      setName('');
      setEmail('');
      onClose();
    } catch (err) {
      setError('Unable to authenticate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="login-modal"
        className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] p-6 shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200 text-neutral-900 dark:text-white"
      >
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              {isNewAccountOnly ? 'Add Member' : 'Member Sign In'}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-white/40 mt-0.5">
              Enter official details to provision a dedicated swimlane.
            </p>
          </div>
          <button
            onClick={onClose}
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

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
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
                <div className={`rounded-lg p-1.5 ${
                  role === 'content'
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                    : 'bg-neutral-200/60 dark:bg-white/5 text-neutral-500 dark:text-white/40'
                }`}>
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                    Content
                  </p>
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
                <div className={`rounded-lg p-1.5 ${
                  role === 'design'
                    ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                    : 'bg-neutral-200/60 dark:bg-white/5 text-neutral-500 dark:text-white/40'
                }`}>
                  <Palette className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                    Design
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-white/40 mt-0.5">
                    Adaptive & Visual
                  </p>
                </div>
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-white/30">
              When created, a dedicated swimlane launches on the <strong className="font-semibold text-neutral-800 dark:text-white/70 capitalize">{role === 'content' ? 'Content' : 'Design'}</strong> tab.
            </p>
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
                placeholder="maya.sterling@company.design"
                className="w-full rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#141414] py-2.5 pl-9 pr-3 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 focus:outline-none transition-colors"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            id="login-submit-button"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-900/20 hover:bg-blue-500 focus:outline-none transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>{isNewAccountOnly ? 'Create Account & Open Swimlane' : 'Authenticate & Open Dashboard'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Switcher */}
        {!isNewAccountOnly && users.length > 0 && (
          <div className="mt-5 border-t border-neutral-100 dark:border-white/5 pt-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 dark:text-white/40 mb-2">
              Or quick select an existing member:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {users.slice(0, 4).map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    switchUser(u);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#141414] px-2.5 py-1 text-xs text-neutral-700 dark:text-white/70 hover:border-neutral-300 dark:hover:border-white/20 hover:text-neutral-900 dark:hover:text-white transition-colors"
                >
                  <span
                    className={`h-2 w-2 rounded-full bg-gradient-to-tr ${
                      u.avatarColor || 'from-blue-500 to-indigo-600'
                    }`}
                  />
                  <span>{u.name.split(' ')[0]}</span>
                  <span className="text-[10px] text-neutral-400 dark:text-white/40 capitalize">({u.role === 'content' ? 'Content' : 'Design'})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
