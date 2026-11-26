import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertCircle, ShieldAlert, Loader2, LogIn, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/DashboardContext';
import { getSuperadminEmail } from '../domain/permissions';
import { DialogPanel } from './ui/DialogPanel';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  canDismiss?: boolean;
}

export const SignInModal: React.FC<SignInModalProps> = ({ isOpen, onClose, canDismiss = true }) => {
  const { loginWithGoogle, authError, setAuthError, accessRequestNotice, setAccessRequestNotice } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    setError(null);
    setAuthError(null);
    setAccessRequestNotice(null);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      if (!err?.isAccessRequestSubmitted) {
        setError(err.message || 'Google Sign-In failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => {
            if (canDismiss && e.target === e.currentTarget && !isSubmitting) onClose();
          }}
        >
          <DialogPanel
            aria-label="Sign in to zenFlow"
            onClose={canDismiss ? onClose : undefined}
            busy={isSubmitting || !canDismiss}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
            id="login-modal"
            className="w-full max-w-md my-auto overflow-hidden"
          >
            <div className="dialog-header">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-soft)] text-[#1d4ed8] dark:text-blue-400">
                  <LogIn className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">Sign In to zenFlow</h2>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    Authenticate with your registered Google account.
                  </p>
                </div>
              </div>
              {canDismiss && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  aria-label="Close modal"
                  className="icon-button shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {accessRequestNotice && (
                <div className="callout callout-success flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {accessRequestNotice.deduplicated ? 'Access Request Already Pending' : 'Access Request Submitted'}
                    </p>
                    <p className="text-[11px] opacity-90">
                      <span className="font-mono">{accessRequestNotice.email}</span> is queued for workspace approval. Try signing in again once a manager adds your account.
                    </p>
                  </div>
                </div>
              )}

              {error && !accessRequestNotice && (
                <div className="callout callout-danger flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                id="google-signin-button"
                disabled={isSubmitting}
                onClick={handleGoogleLogin}
                className="button-secondary w-full !min-h-[40px] gap-2.5 text-xs font-semibold"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#1d4ed8] dark:text-blue-400" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                )}
                <span>{isSubmitting ? 'Verifying Credentials...' : 'Continue with Google'}</span>
              </button>

              <div className="callout callout-warning flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="text-[11px] space-y-0.5">
                  <p className="font-semibold">Authorized Workspace Access</p>
                  <p className="opacity-90">
                    Sign in with an <span className="font-mono font-semibold">@zensciences.com</span> Google account. Unregistered domain accounts automatically submit an approval request to workspace managers ({getSuperadminEmail()}).
                  </p>
                </div>
              </div>
            </div>
          </DialogPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
