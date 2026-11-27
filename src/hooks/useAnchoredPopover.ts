import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export interface PopoverPosition {
  top: number;
  left: number;
}

interface UseAnchoredPopoverOptions {
  isOpen: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  align?: 'left' | 'right';
  gap?: number;
  margin?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
  dismissOnOutOfView?: boolean;
  restoreFocusOnEscape?: boolean;
}

/**
 * Computes fixed viewport coordinates from the mounted popover's real dimensions,
 * keeping portals anchored to their trigger without pre-mount height fallbacks.
 */
export function useAnchoredPopover({
  isOpen,
  triggerRef,
  popoverRef,
  onClose,
  align = 'right',
  gap = 6,
  margin = 10,
  fallbackWidth = 208,
  fallbackHeight = 160,
  dismissOnOutOfView = false,
  restoreFocusOnEscape = true,
}: UseAnchoredPopoverOptions) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (dismissOnOutOfView && (rect.bottom < 0 || rect.top > window.innerHeight)) {
      onClose();
      return;
    }

    const popover = popoverRef.current;
    const width = popover?.offsetWidth || fallbackWidth;
    const height = popover?.offsetHeight || fallbackHeight;
    const rawLeft = align === 'right' ? rect.right - width : rect.left;
    const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - width - margin));
    const fitsBelow = rect.bottom + height + margin <= window.innerHeight;
    const fitsAbove = rect.top >= height + margin;
    const rawTop = !fitsBelow && fitsAbove ? rect.top - height - gap : rect.bottom + gap;
    const top = Math.max(margin, Math.min(rawTop, window.innerHeight - height - margin));
    setPosition(prev => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [triggerRef, popoverRef, align, gap, margin, fallbackWidth, fallbackHeight, dismissOnOutOfView, onClose]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        if (restoreFocusOnEscape) {
          triggerRef.current?.focus({ preventScroll: true });
        }
      }
    };

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, triggerRef, popoverRef, onClose, restoreFocusOnEscape, updatePosition]);

  return { position, updatePosition };
}

/** Shared roving ArrowDown/ArrowUp/Home/End keyboard navigation for ARIA menus. */
export function handleRovingMenuKeyDown(
  event: Pick<KeyboardEvent, 'key' | 'preventDefault'>,
  menuElement: HTMLElement | null
): boolean {
  if (!menuElement) return false;
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
    return false;
  }
  const items = Array.from(menuElement.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')).filter(
    el => el.getClientRects().length > 0
  );
  if (items.length === 0) return false;
  event.preventDefault();
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  let nextIndex = 0;
  if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
  else if (event.key === 'ArrowUp') nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  else if (event.key === 'End') nextIndex = items.length - 1;
  items[nextIndex]?.focus();
  return true;
}
