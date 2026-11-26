import { useState, useCallback } from 'react';

/** Coordinates unsaved-form confirmation before closing a modal. */
export function useDiscardGuard(isDirty: boolean, isBusy: boolean, onClose: () => void) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const requestClose = useCallback(() => {
    if (isBusy) return;
    if (isDirty && !showDiscardConfirm) {
      setShowDiscardConfirm(true);
      return;
    }
    setShowDiscardConfirm(false);
    onClose();
  }, [isBusy, isDirty, showDiscardConfirm, onClose]);

  const confirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const resetDiscardConfirm = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  return {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    resetDiscardConfirm,
  };
}
