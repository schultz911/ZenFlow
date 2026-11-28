import { AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { DialogPanel } from './ui/DialogPanel';

export function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
          <DialogPanel aria-labelledby="workspace-help-title" onClose={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="flex w-full max-w-lg flex-col overflow-hidden">
            <header className="dialog-header">
              <h2 id="workspace-help-title" data-autofocus tabIndex={-1} className="text-sm font-bold text-[var(--text-primary)]">Help</h2>
              <button type="button" aria-label="Close help" onClick={onClose} className="icon-button shrink-0">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </header>
            <div className="overflow-y-auto px-5 py-2 divide-y divide-[var(--border-subtle)]">
              <section className="py-3">
                <h3 className="text-sm font-semibold">Create and track a brief</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">If you can create briefs, choose <strong>New Brief</strong> in Pipeline, fill in the required fields, then select <strong>Create Brief</strong>. Search for the title and open the card to check its status and assignee.</p>
              </section>
              <section className="py-3">
                <h3 className="text-sm font-semibold">Assign work and compare capacity</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">If you can assign work, open <strong>Assign</strong> on a brief. Compare hours scheduled today and load points from active work, including overdue tasks. Choose a member and destination, confirm the deadline, and review the workload before saving.</p>
              </section>
              <section className="py-3">
                <h3 className="text-sm font-semibold">Move assigned work</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">On a card you can edit, open its actions menu and choose <strong>Move</strong>, then select the next stage. Complete any deadline or deliverable prompts to finish the move.</p>
              </section>
              <section className="py-3">
                <h3 className="text-sm font-semibold">Read Analytics</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Open <strong>View Analytics</strong> and choose the scope and date. Utilization shows the share of members assigned at least 3 hours that day. Efficiency compares estimated and billable hours for measured work. Above 100% means the work came in under estimate.</p>
              </section>
            </div>
          </DialogPanel>
        </div>
      )}
    </AnimatePresence>
  );
}
