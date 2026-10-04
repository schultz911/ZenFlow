import React, { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { ShieldCheck, Loader2, Sparkles, Layers, RefreshCw, AlertCircle } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { loginWithGoogle, authError, setAuthError } = useDashboard();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = localError || authError;

  const handleSignIn = async () => {
    setLocalError(null);
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('[LoginScreen] Sign in error:', err);
      setLocalError(err.message || 'Google sign-in failed. Please verify your account is registered.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col justify-between selection:bg-blue-500/30 selection:text-white relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-gradient-to-b from-blue-600/15 via-indigo-600/10 to-transparent blur-3xl pointer-events-none rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[400px] bg-purple-600/10 blur-3xl pointer-events-none rounded-full" />

      {/* Top Bar Branding */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 shadow-lg shadow-blue-500/20">
            <span className="font-bold text-white text-lg tracking-wider">ZF</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white">zenFlow</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-white/40">Studio Operations & Workflow Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/50 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>System Online</span>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-white/10 bg-[#121212]/90 backdrop-blur-xl p-8 shadow-2xl shadow-black/80 space-y-6">
            
            {/* Title Section */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Creative Studio Platform</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white pt-1">
                Sign In to ZenFlow
              </h1>
              <p className="text-xs text-white/50 max-w-sm mx-auto leading-relaxed">
                Access your studio board, track cognitive workload limits, and sync tasks seamlessly with ClickUp.
              </p>
            </div>

            {/* Error Notification */}
            {displayError && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-300">Authentication Error</p>
                  <p className="leading-relaxed opacity-90">{displayError}</p>
                  {displayError.includes('unauthorized') && (
                    <p className="text-[11px] text-red-400/80 mt-1">
                      Tip: Ensure you are accessing through <code className="bg-red-950/60 px-1 py-0.5 rounded text-red-300 font-mono">http://localhost:3000</code>.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Google Authentication Button */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                id="google-signin-btn"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-white hover:bg-neutral-100 text-neutral-900 py-3.5 px-4 font-semibold text-sm shadow-xl shadow-white/5 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <span>Verifying Google Account...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
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
                    <span>Sign In with Google</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-center text-white/40">
                Requires pre-registered account (<span className="text-white/60">@zensciences.com</span> or authorized team member)
              </p>
            </div>

            {/* Access Policy Card */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-white/80 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Authorized Team Gating</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                ZenFlow enforces strict Google Workspace authentication. To request an account, contact your Creative Director or Superadmin (<span className="text-blue-400">kiran.s@zensciences.com</span>).
              </p>
            </div>

          </div>

          {/* Feature Badges below card */}
          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-xs font-semibold text-white/90">Cognitive Load</p>
              <p className="text-[10px] text-white/40 mt-0.5">Capacity estimation</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-xs font-semibold text-white/90">ClickUp Sync</p>
              <p className="text-[10px] text-white/40 mt-0.5">Auto-assign tasks</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-xs font-semibold text-white/90">Team Boards</p>
              <p className="text-[10px] text-white/40 mt-0.5">Content & Design</p>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-[11px] text-white/30 border-t border-white/5">
        <span>&copy; {new Date().getFullYear()} ZenSciences. All rights reserved.</span>
        <span>Enterprise Operations Engine</span>
      </footer>
    </div>
  );
};
