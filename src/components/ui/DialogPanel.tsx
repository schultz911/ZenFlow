import { useEffect, useRef } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

const panels: HTMLElement[] = [];
let lockedScrollX = 0;
let lockedScrollY = 0;

function canScrollInContainer(target: EventTarget | null, deltaY: number, deltaX: number): boolean {
  const topPanel = panels.at(-1);
  if (!topPanel || !(target instanceof Element)) return false;
  const scope = topPanel.closest('.dialog-backdrop') ?? topPanel;
  if (!scope.contains(target)) return false;

  let current: Element | null = target;
  while (current) {
    const style = window.getComputedStyle(current);
    const canScrollY =
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      current.scrollHeight > current.clientHeight + 1;
    if (canScrollY) {
      if (deltaY === 0) return true;
      if (deltaY < 0 && current.scrollTop > 0) return true;
      if (deltaY > 0 && current.scrollTop + current.clientHeight < current.scrollHeight - 1) return true;
    }

    const canScrollX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      current.scrollWidth > current.clientWidth + 1;
    if (canScrollX && deltaX !== 0) {
      if (deltaX < 0 && current.scrollLeft > 0) return true;
      if (deltaX > 0 && current.scrollLeft + current.clientWidth < current.scrollWidth - 1) return true;
    }

    if (current === scope) break;
    current = current.parentElement;
  }
  return false;
}

const preventBackgroundWheel = (event: WheelEvent) => {
  if (panels.length === 0) return;
  if (!canScrollInContainer(event.target, event.deltaY, event.deltaX)) {
    event.preventDefault();
  }
};

const preventBackgroundTouchMove = (event: TouchEvent) => {
  if (panels.length === 0) return;
  if (!canScrollInContainer(event.target, 0, 0)) {
    event.preventDefault();
  }
};

const holdWindowScroll = () => {
  if (panels.length === 0) return;
  if (window.scrollX !== lockedScrollX || window.scrollY !== lockedScrollY) {
    window.scrollTo(lockedScrollX, lockedScrollY);
  }
};

type DialogPanelProps = HTMLMotionProps<'div'> & { onClose?: () => void; busy?: boolean };

/** Shared sizing, focus containment, scroll lock, and topmost-only dismissal. */
export function DialogPanel({ children, className = '', onClose, busy = false, ...props }: DialogPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  if (openerRef.current === undefined && typeof document !== 'undefined') {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && active !== document.documentElement) {
      openerRef.current = active;
    } else {
      openerRef.current = null;
    }
  }
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const activeAtEffect = document.activeElement as HTMLElement | null;
    const capturedOpener =
      openerRef.current && !panel.contains(openerRef.current)
        ? openerRef.current
        : activeAtEffect && !panel.contains(activeAtEffect)
          ? activeAtEffect
          : null;
    const previousFocus = capturedOpener;
    if (panels.length === 0) {
      lockedScrollX = window.scrollX;
      lockedScrollY = window.scrollY;
      window.addEventListener('wheel', preventBackgroundWheel, { passive: false });
      window.addEventListener('touchmove', preventBackgroundTouchMove, { passive: false });
      window.addEventListener('scroll', holdWindowScroll, { passive: true });
    }
    panels.push(panel);
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
    if (!panel.contains(document.activeElement)) {
      const initialTarget = panel.querySelector<HTMLElement>('[autofocus]') || focusable()[0] || panel;
      initialTarget.focus({ preventScroll: true });
    }
    const keydown = (event: KeyboardEvent) => {
      if (panels.at(-1) !== panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current?.();
      }
      if (event.key === 'Tab') {
        const items = focusable();
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (items.length === 0) { event.preventDefault(); panel.focus(); }
        else if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (panels.at(-1) === panel && !panel.contains(event.target as Node)) panel.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      panels.splice(panels.indexOf(panel), 1);
      if (panels.length === 0) {
        window.removeEventListener('wheel', preventBackgroundWheel);
        window.removeEventListener('touchmove', preventBackgroundTouchMove);
        window.removeEventListener('scroll', holdWindowScroll);
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <motion.div {...props} ref={ref} role="dialog" aria-modal="true" aria-busy={busy} tabIndex={-1} className={`dialog-panel ${className}`}>{children}</motion.div>;
}
