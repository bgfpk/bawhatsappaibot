import React from "react";

export function CrmLeadDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close lead details"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/45"
      />
      <div className="absolute inset-y-0 right-0 flex w-full justify-end sm:w-auto">
        <div className="relative h-full w-full overflow-y-auto bg-white p-3 shadow-2xl dark:bg-neutral-950 sm:w-[min(92vw,680px)] sm:p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
