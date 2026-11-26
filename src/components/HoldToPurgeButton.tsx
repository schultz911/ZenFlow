import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useIsPresent } from 'motion/react';
import { createHoldToConfirm } from '../lib/holdToConfirm';

interface HoldToPurgeButtonProps {
  onPurgeConfirm: () => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  holdDurationMs?: number;
  className?: string;
}

export const HoldToPurgeButton: React.FC<HoldToPurgeButtonProps> = ({
  onPurgeConfirm, isLoading = false, disabled = false, holdDurationMs = 5000, className = '',
}) => {
  const confirmRef = useRef(onPurgeConfirm);
  confirmRef.current = onPurgeConfirm;
  const hold = useMemo(() => createHoldToConfirm(() => confirmRef.current(), holdDurationMs), [holdDurationMs]);
  const state = useSyncExternalStore(hold.subscribe, hold.getSnapshot, hold.getSnapshot);
  const inputRef = useRef<number | string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [showTypeConfirm, setShowTypeConfirm] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState('');
  const [typeSubmitting, setTypeSubmitting] = useState(false);
  const [typeFeedback, setTypeFeedback] = useState<string | null>(null);
  const descriptionId = useId();
  const typeInputId = useId();
  const isPresent = useIsPresent();
  const busy = isLoading || state.phase === 'submitting' || typeSubmitting;
  const blocked = !isPresent || disabled || busy || state.phase === 'success';
  const cancel = () => { inputRef.current = null; hold.cancel(); };

  const handleTypedSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked || typedPhrase.trim().toUpperCase() !== 'PURGE') return;
    setTypeSubmitting(true);
    setTypeFeedback(null);
    try {
      await confirmRef.current();
    } catch (err) {
      setTypeFeedback(err instanceof Error ? err.message : 'Purge failed. Please try again.');
    } finally {
      setTypeSubmitting(false);
    }
  };

  useEffect(() => {
    const stop = () => { inputRef.current = null; hold.cancel(); };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stop();
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [hold]);

  // Cancel before the next frame, including while AnimatePresence retains an exiting modal.
  useLayoutEffect(() => {
    if (!isPresent || disabled || isLoading) {
      inputRef.current = null;
      hold.cancel();
    }
  }, [isPresent, disabled, isLoading, hold]);

  useEffect(() => {
    if (state.phase === 'error' && isPresent && !disabled && !isLoading) buttonRef.current?.focus();
  }, [state.phase, isPresent, disabled, isLoading]);

  const label = busy ? 'Purging database…'
    : state.phase === 'success' ? 'Database purged'
    : state.phase === 'holding' ? `Keep holding to purge · ${state.remaining}s`
    : `Hold to purge database · ${Math.ceil(holdDurationMs / 1000)}s`;

  return (
    <div className={`w-full ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`hold-confirm ${state.phase === 'success' ? 'hold-confirm-success' : ''}`}
        disabled={blocked}
        aria-busy={busy}
        aria-describedby={descriptionId}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => {
          if (blocked || !event.isPrimary || event.button !== 0 || inputRef.current !== null) return;
          event.currentTarget.focus();
          if (hold.start()) {
            inputRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={event => {
          if (inputRef.current !== event.pointerId) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
        }}
        onPointerLeave={event => { if (inputRef.current === event.pointerId) cancel(); }}
        onPointerUp={event => {
          if (inputRef.current !== event.pointerId) return;
          cancel();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={event => { if (inputRef.current === event.pointerId) cancel(); }}
        onLostPointerCapture={event => { if (inputRef.current === event.pointerId) cancel(); }}
        onBlur={cancel}
        onKeyDown={event => {
          if (event.key !== ' ' && event.key !== 'Enter') return;
          event.preventDefault();
          if (!blocked && !event.repeat && inputRef.current === null && hold.start()) inputRef.current = event.key;
        }}
        onKeyUp={event => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            if (inputRef.current === event.key) cancel();
          }
        }}
      >
        <span aria-hidden="true" className="hold-confirm-fill" style={{ transform: `scaleX(${state.progress})`, '--hold-progress': state.progress } as React.CSSProperties} />
        <span className="relative">{label}</span>
      </button>
      <p id={descriptionId} className="mt-2 text-xs text-[var(--text-secondary)] text-center">
        Hold with mouse, touch, Space, or Enter. Release or leave to cancel.
      </p>
      <p role="status" aria-live="polite" aria-atomic="true" className="hold-feedback">
        <span className={state.phase === 'holding' ? 'sr-only' : undefined}>{state.phase === 'holding' ? `${state.remaining} seconds remaining` : (typeFeedback || state.feedback)}</span>
      </p>

      {!state.phase.includes('success') && (
        <div className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-center">
          <button
            type="button"
            aria-expanded={showTypeConfirm}
            onClick={() => {
              setShowTypeConfirm(prev => !prev);
              setTypedPhrase('');
              setTypeFeedback(null);
            }}
            className="text-[11px] font-semibold text-[#1d4ed8] dark:text-blue-400 hover:underline cursor-pointer"
          >
            {showTypeConfirm ? 'Use 5-second hold instead' : 'Prefer typing PURGE to confirm?'}
          </button>

          {showTypeConfirm && (
            <form onSubmit={handleTypedSubmit} className="mt-2 flex items-center gap-2 text-left">
              <label htmlFor={typeInputId} className="sr-only">
                Type PURGE to confirm database purge
              </label>
              <input
                id={typeInputId}
                type="text"
                value={typedPhrase}
                onChange={e => setTypedPhrase(e.target.value)}
                placeholder="Type PURGE to confirm"
                autoComplete="off"
                className="field-control flex-1 font-mono"
              />
              <button
                type="submit"
                disabled={blocked || typedPhrase.trim().toUpperCase() !== 'PURGE'}
                className="button-danger shrink-0"
              >
                {typeSubmitting ? 'Purging…' : 'Confirm Purge'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
