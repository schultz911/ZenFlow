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
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const cancelHold = useCallback((reason?: string) => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const hadProgress = progress > 5;
    startTimeRef.current = null;
    setIsHolding(false);
    setProgress(0);
    setRemainingSec(holdDurationMs / 1000);

    if (hadProgress && !isTriggeredRef.current && reason) {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setCancelFeedback(reason);
      feedbackTimerRef.current = setTimeout(() => {
        setCancelFeedback(null);
      }, 3000);
    }
  }, [holdDurationMs, progress]);

  const onCompleteHold = useCallback(async () => {
    isTriggeredRef.current = true;
    setIsHolding(false);
    setProgress(100);
    setRemainingSec(0);
    setCancelFeedback(null);

    try {
      await onPurgeConfirm();
      setIsCompleted(true);
    } catch {
      isTriggeredRef.current = false;
      setProgress(0);
    }
  }, [onPurgeConfirm]);

  const startHold = useCallback((e?: React.SyntheticEvent) => {
    if (disabled || isLoading || isCompleted || isTriggeredRef.current) return;
    if (e && 'button' in e && (e as React.MouseEvent).button !== 0) return; // Only primary mouse button

    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setCancelFeedback(null);
    setIsHolding(true);
    isTriggeredRef.current = false;
    startTimeRef.current = performance.now();

    const tick = (now: number) => {
      if (!startTimeRef.current) return;
      const elapsed = now - startTimeRef.current;
      const currentProgress = Math.min(100, (elapsed / holdDurationMs) * 100);
      const remaining = Math.max(0, (holdDurationMs - elapsed) / 1000);

      setProgress(currentProgress);
      setRemainingSec(remaining);

      if (elapsed >= holdDurationMs) {
        onCompleteHold();
      } else {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [disabled, isLoading, isCompleted, holdDurationMs, onCompleteHold]);

  // Clean up on unmount or when window blurs
  useEffect(() => {
    const handleWindowBlur = () => {
      if (isHolding) {
        cancelHold('Window lost focus - hold cancelled');
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [isHolding, cancelHold]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !isHolding) {
      e.preventDefault();
      startHold();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && isHolding) {
      e.preventDefault();
      cancelHold('Key released early - hold for 5s');
    }
  };

  return (
    <div className={`w-full flex flex-col items-center ${className}`}>
      {/* Outer Action Container */}
      <div className="relative w-full">
        <button
          type="button"
          disabled={disabled || isLoading || isCompleted}
          onMouseDown={startHold}
          onMouseUp={() => cancelHold('Released early - hold for 5 full seconds')}
          onMouseLeave={() => {
            if (isHolding) cancelHold('Cursor moved away - hold cancelled');
          }}
          onTouchStart={startHold}
          onTouchEnd={() => cancelHold('Touch released early - hold for 5 seconds')}
          onTouchCancel={() => cancelHold('Touch cancelled')}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          style={{
            boxShadow: isHolding
              ? `0 0 ${12 + (progress / 100) * 24}px rgba(239, 68, 68, ${0.4 + (progress / 100) * 0.45})`
              : undefined,
          }}
          className={`relative w-full h-14 rounded-xl border font-medium text-sm overflow-hidden select-none transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${
            isCompleted
              ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 cursor-default'
              : isHolding
              ? 'bg-red-950/80 border-red-500 text-white scale-[1.01]'
              : 'bg-red-950/40 hover:bg-red-950/70 active:bg-red-950 border-red-800/80 hover:border-red-600 text-red-200 hover:text-white'
          } ${disabled || isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {/* Animated Progress Track Fill */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-700 via-rose-600 to-red-500 transition-all ease-linear pointer-events-none"
            style={{
              width: `${progress}%`,
              opacity: isHolding ? 0.95 : progress > 0 ? 0.5 : 0,
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
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-transform ${
                  isHolding ? 'scale-110 bg-red-600 text-white' : 'bg-red-900/60 text-red-400'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : isHolding ? (
                  <AlertTriangle className="h-4 w-4 animate-bounce text-white" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </div>

              <div className="text-left">
                <div className="font-semibold text-xs tracking-wide">
                  {isLoading
                    ? 'PURGING DATABASE...'
                    : isCompleted
                    ? 'DATABASE PURGED SUCCESSFULLY'
                    : isHolding
                    ? 'HOLDING... KEEP PRESSING'
                    : 'HOLD 5 SECONDS TO PURGE DATABASE'}
                </div>
                <div className="text-[11px] opacity-80 font-mono">
                  {isHolding ? (
                    <span className="font-bold text-white">
                      {remainingSec.toFixed(1)}s remaining to wipe
                    </span>
                  ) : isCompleted ? (
                    <span className="text-emerald-400">All data wiped. Root superadmin retained.</span>
                  ) : (
                    <span className="text-red-300/80">Press & hold mouse or Spacebar continuously</span>
                  )}
                </div>
              </div>
            </div>

            {/* Countdown / Percentage Meter on Right */}
            <div className="flex items-center gap-2">
              {isHolding && (
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-red-400 bg-red-900/80 text-white font-mono text-xs font-bold shadow-md animate-pulse">
                  {remainingSec.toFixed(1)}s
                </div>
              )}
              {!isHolding && !isCompleted && !isLoading && (
                <span className="rounded-md bg-red-900/50 border border-red-700/50 px-2 py-0.5 text-[10px] font-mono text-red-300 font-semibold tracking-wider">
                  5.0s
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
            className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded-lg px-2.5 py-1 font-medium"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>{cancelFeedback}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

