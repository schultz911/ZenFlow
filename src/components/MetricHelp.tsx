import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';

export const efficiencyHelp = 'Estimated hours divided by billable hours for completed work with both values. 100% means on estimate. For example, 10h estimated ÷ 6h billable rounds to 167%, or 4h under estimate.';
export const utilizationHelp = 'Assigned hours are estimates spread across scheduled workdays and split among assignees. Undated assignments with an estimate count on the current report day once started. Overdue work can still add load points after its scheduled hours end.';
export const loadHelp = 'Load points reflect active work, weighted by cognitive load, task status and deadline pressure. Shared work is split among assignees. Load can be high even when few estimated hours are scheduled today.';

export function MetricHelp({ label, detail }: { label: string; detail: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { position } = useAnchoredPopover({ isOpen: open, triggerRef, popoverRef, onClose: close, dismissOnOutOfView: true });

  return (
    <span className="inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(value => !value)}
        onBlur={close}
        className="relative inline-grid h-3.5 min-h-0 w-3.5 place-items-center rounded text-[var(--text-secondary)] before:absolute before:-inset-1.5 before:content-['']"
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <span role="status" className="sr-only">{open ? detail : null}</span>
      {createPortal(<div
        id={id}
        ref={popoverRef}
        className="menu-surface fixed z-50 w-56 rounded-[7px] border border-[var(--border)] p-2.5 text-left text-xs font-normal text-[var(--text-primary)]"
        style={open && position ? position : { visibility: 'hidden' }}
        hidden={!open}
      >
        {open ? detail : null}
      </div>, document.body)}
    </span>
  );
}
