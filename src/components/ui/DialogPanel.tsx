import { useEffect, useRef } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

const panels: HTMLElement[] = [];
let previousOverflow = '';

type DialogPanelProps = HTMLMotionProps<'div'> & { onClose?: () => void; busy?: boolean };

/** Shared sizing, focus containment, scroll lock, and topmost-only dismissal. */
export function DialogPanel({ children, className = '', onClose, busy = false, ...props }: DialogPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (panels.length === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    panels.push(panel);
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
    panel.focus({ preventScroll: true });
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
      if (panels.length === 0) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <motion.div {...props} ref={ref} role="dialog" aria-modal="true" aria-busy={busy} tabIndex={-1} className={`dialog-panel ${className}`}>{children}</motion.div>;
}
