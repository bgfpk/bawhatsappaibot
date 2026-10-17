import React from "react";
import { Ban, RefreshCw, Trash2 } from "lucide-react";
import { isInactiveOrder } from "../utils/order-status";

type Props = {
  order: any;
  busy: boolean;
  hasTracking: boolean;
  onWorkStart: () => void;
  onWorkEnd: () => void;
  onBookPostexOrder?: (order: any) => Promise<void>;
  onSyncTracking?: (order: any) => Promise<void>;
  onCancelOrder?: (order: any) => Promise<void>;
  onDeleteOrder?: (order: any) => Promise<void>;
};

export function OrderActionButtons({
  order,
  busy,
  hasTracking,
  onWorkStart,
  onWorkEnd,
  onSyncTracking,
  onCancelOrder,
  onDeleteOrder,
}: Props) {
  const inactive = isInactiveOrder(order);

  const run = async (action?: (order: any) => Promise<void>) => {
    if (!order || !action || busy) return;
    onWorkStart();
    try {
      await action(order);
    } finally {
      onWorkEnd();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {hasTracking && onSyncTracking && (
        <button
          disabled={busy || inactive}
          onClick={() => run(onSyncTracking)}
          title="Sync tracking"
          className="p-1.5 rounded-lg transition-colors bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
      {onCancelOrder && !inactive && (
        <button
          disabled={busy}
          onClick={() => run(onCancelOrder)}
          title="Cancel order"
          className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
        >
          <Ban className="w-3.5 h-3.5" />
        </button>
      )}
      {onDeleteOrder && (
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm("Delete this order from the active list?")) run(onDeleteOrder);
          }}
          title="Delete order"
          className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
