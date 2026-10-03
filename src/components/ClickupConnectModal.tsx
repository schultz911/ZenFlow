import React, { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { X, Key, CheckCircle, AlertCircle, Loader2, ExternalLink, Unlink } from 'lucide-react';

interface ClickupConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClickupConnectModal: React.FC<ClickupConnectModalProps> = ({ isOpen, onClose }) => {
  const { clickupApiKey, isClickupConnected, connectClickup, disconnectClickup } = useDashboard();
  const [apiKeyInput, setApiKeyInput] = useState(clickupApiKey || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const key = apiKeyInput.trim();
    if (!key) {
      setError('Please provide a ClickUp Personal API token (starts with pk_).');
      return;
    }

    setIsLoading(true);
    try {
      const res = await connectClickup(key);
      if (res.success) {
        setSuccess('Successfully connected to ClickUp!');
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setError(res.error || 'Failed to authenticate with ClickUp. Please check your token.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error verifying ClickUp token.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnectClickup();
    setApiKeyInput('');
    setSuccess('Disconnected from ClickUp.');
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 text-zinc-900 dark:text-zinc-100">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">ClickUp Integration</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Sync tasks in real-time between ZenFlow and ClickUp
            </p>
          </div>
        </div>

        {isClickupConnected && (
          <div className="mb-5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>ClickUp Connected</span>
            </div>
            <button
              onClick={handleDisconnect}
              type="button"
              className="flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline hover:text-red-700 dark:hover:text-red-300"
            >
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        )}

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Personal API Token
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="pk_1234567_abcdef..."
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-mono"
            />
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              <span>Find this in ClickUp: Settings &rarr; Apps &rarr; API Token &rarr; Generate.</span>
              <a
                href="https://app.clickup.com"
                target="_blank"
                rel="noreferrer"
                className="text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-0.5"
              >
                Open ClickUp <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-600 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.98] rounded-xl shadow-md shadow-purple-600/20 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center gap-2"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isClickupConnected ? 'Update Token' : 'Connect ClickUp'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
