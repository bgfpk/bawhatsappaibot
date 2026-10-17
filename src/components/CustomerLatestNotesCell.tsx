import React from "react";
import { Eye } from "lucide-react";
import { getCustomerListPreview } from "./CustomerDetailDrawer";

type Props = {
  customer: any;
  userId: string;
  onSaved?: (customer: any, profile: any) => void;
  onSummaryRefreshQueued?: () => void;
  onOpenDetails?: (customer: any) => void;
};

export function CustomerLatestNotesCell({ customer, onOpenDetails }: Props) {
  const preview = getCustomerListPreview(customer);

  return (
    <div className="flex flex-col gap-2">
      <p className="line-clamp-2 text-xs font-medium leading-relaxed text-gray-600 dark:text-neutral-400">
        {preview || "No recent interaction preview yet."}
      </p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenDetails?.(customer);
        }}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-700 hover:border-emerald-400 hover:text-emerald-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
      >
        <Eye className="h-3 w-3" />
        Details
      </button>
    </div>
  );
}
