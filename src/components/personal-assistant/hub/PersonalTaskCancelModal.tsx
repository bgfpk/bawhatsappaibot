import React from "react";

interface PersonalTaskCancelModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const PersonalTaskCancelModal: React.FC<PersonalTaskCancelModalProps> = ({
  isOpen,
  isLoading,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full p-6 rounded-2xl bg-[var(--ca-bg-card)] border border-[var(--ca-border-subtle)] space-y-4">
        <h3 className="text-base font-bold text-[var(--ca-text-primary)]">Cancel Personal Task?</h3>
        <p className="text-xs text-[var(--ca-text-secondary)] leading-relaxed">
          Cancelling this task will permanently stop all pending automated actions, follow-ups, and checks.
          The personal contact, contact memory, and WhatsApp message history will be completely preserved.
        </p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)]"
          >
            Keep Task
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white"
          >
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
};
