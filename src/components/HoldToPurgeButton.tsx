import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';

interface HoldToPurgeButtonProps {
  onPurgeConfirm: () => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  holdDurationMs?: number;
  className?: string;
}

export const HoldToPurgeButton: React.FC<HoldToPurgeButtonProps> = ({
  onPurgeConfirm,
  isLoading = false,
  disabled = false,
  holdDurationMs = 5000,
  className = '',
}) => {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [remainingSec, setRemainingSec] = useState(holdDurationMs / 1000);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isTriggeredRef = useRef<boolean>(false);
  const isHoldingRef = useRef<boolean>(false);
  const isCompletedRef = useRef<boolean>(false);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onPurgeConfirmRef = useRef(onPurgeConfirm);

  useEffect(() => {
    onPurgeConfirmRef.current = onPurgeConfirm;
  }, [onPurgeConfirm]);

  const cancelHold = useCallback((reason?: string) => {
    if (isTriggeredRef.current || isCompletedRef.current) return;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const elapsed = startTimeRef.current ? (performance.now() - startTimeRef.current) : 0;
    startTimeRef.current = null;
    isHoldingRef.current = false;
    setIsHolding(false);
    setProgress(0);
    setRemainingSec(holdDurationMs / 1000);

    if (elapsed > 300 && reason) {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setCancelFeedback(reason);
      feedbackTimerRef.current = setTimeout(() => {
        setCancelFeedback(null);
      }, 2500);
    }
  }, [holdDurationMs]);

  const triggerPurge = useCallback(async () => {
    if (isTriggeredRef.current) return;
    isTriggeredRef.current = true;
    isHoldingRef.current = false;
    setIsHolding(false);
    setProgress(100);
    setRemainingSec(0);
    setCancelFeedback(null);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    try {
      await onPurgeConfirmRef.current();
      isCompletedRef.current = true;
      setIsCompleted(true);
    } catch {
      isTriggeredRef.current = false;
      isCompletedRef.current = false;
      setProgress(0);
      setRemainingSec(holdDurationMs / 1000);
    }
  }, [holdDurationMs]);

  const startHold = useCallback((e?: React.PointerEvent | React.KeyboardEvent) => {
    if (disabled || isLoading || isCompletedRef.current || isTriggeredRef.current || isHoldingRef.current) return;
    if (e && 'button' in e && (e as React.PointerEvent).button !== 0) return; // Only primary mouse button

    if (e && 'setPointerCapture' in e.currentTarget && 'pointerId' in e) {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture((e as React.PointerEvent).pointerId);
      } catch {
        // ignore
      }
    }

    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setCancelFeedback(null);
    isHoldingRef.current = true;
    setIsHolding(true);
    isTriggeredRef.current = false;
    startTimeRef.current = performance.now();

    const tick = (now: number) => {
      if (!startTimeRef.current || !isHoldingRef.current) return;
      const elapsed = now - startTimeRef.current;
      const currentProgress = Math.min(100, (elapsed / holdDurationMs) * 100);
      const remaining = Math.max(0, (holdDurationMs - elapsed) / 1000);

      setProgress(currentProgress);
      setRemainingSec(remaining);

      if (elapsed >= holdDurationMs) {
        triggerPurge();
      } else {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [disabled, isLoading, holdDurationMs, triggerPurge]);

  // Clean up on unmount or when window blurs
  useEffect(() => {
    const handleWindowBlur = () => {
      if (isHoldingRef.current && !isTriggeredRef.current && !isCompletedRef.current) {
        cancelHold('Window lost focus - hold cancelled');
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [cancelHold]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !isHoldingRef.current) {
      e.preventDefault();
      startHold(e);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      if (!isTriggeredRef.current && !isCompletedRef.current) {
        cancelHold('Key released early - hold for 5s');
      }
    }
  };

  return (
    <div className={`w-full flex flex-col items-center ${className}`}>
      {/* Outer Action Container */}
      <div className="relative w-full">
        <button
          type="button"
          disabled={disabled || isLoading || isCompleted}
          onPointerDown={startHold}
          onPointerUp={(e) => {
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            if (!isTriggeredRef.current && !isCompletedRef.current) {
              cancelHold('Released early - hold for 5s');
            }
          }}
          onPointerCancel={() => {
            if (!isTriggeredRef.current && !isCompletedRef.current) {
              cancelHold('Hold cancelled');
            }
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className={`relative w-full h-12 rounded-xl border font-medium text-xs sm:text-sm overflow-hidden select-none transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${
            isCompleted
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 cursor-default'
              : isHolding
              ? 'bg-red-600 border-red-600 text-white shadow-lg'
              : 'bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 border-red-200 hover:border-red-300 dark:border-red-900/60 dark:hover:border-red-700 text-red-700 dark:text-red-300'
          } ${disabled || isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {/* Animated Progress Track Fill */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 transition-all ease-linear pointer-events-none"
            style={{
              width: `${progress}%`,
              opacity: isHolding ? 0.95 : progress > 0 ? 0.4 : 0,
            }}
          />

          {/* Shimmer light on active hold */}
          {isHolding && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse pointer-events-none"
              style={{ width: `${progress}%` }}
            />
          )}

          {/* Button Content Overlay */}
          <div className="relative z-10 flex items-center justify-between px-4 h-full pointer-events-none">
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-transform ${
                  isHolding
                    ? 'scale-110 bg-white/20 text-white'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/15 text-red-600 dark:text-red-400'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </div>

              <div className="font-semibold text-xs tracking-wide">
                {isLoading
                  ? 'Purging database...'
                  : isCompleted
                  ? 'Database purged'
                  : isHolding
                  ? `Hold to confirm (${remainingSec.toFixed(1)}s)`
                  : 'Hold 5s to Purge Database'}
              </div>
            </div>

            {/* Countdown / Percentage Meter on Right */}
            <div className="flex items-center gap-2">
              {!isCompleted && !isLoading && (
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider ${
                    isHolding
                      ? 'bg-white/20 text-white'
                      : 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20'
                  }`}
                >
                  {isHolding ? `${remainingSec.toFixed(1)}s` : '5.0s'}
                </span>
              )}
            </div>
          </div>
        </button>
      </div>

      {/* Early Release / Cancellation Alert Feedback */}
      <AnimatePresence>
        {cancelFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-lg px-2.5 py-1 font-medium"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{cancelFeedback}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
