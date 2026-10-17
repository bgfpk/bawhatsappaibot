import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { requestCustomerSummaryRefresh, saveCustomerProfileNotes } from "../api/customer-api";
import { getCustomerSummaryDisplayState } from "../services/customer-display-state-service";
import { TextLimitCounter } from "./TextLimitCounter";

const CUSTOMER_PRIVATE_NOTES_MAX_CHARS = 100000;

type Props = {
  customer: any;
  userId: string;
  onSaved: (profile: any) => void;
  onSummaryRefreshQueued?: () => void;
  showSummary?: boolean;
};

export function CustomerNotesEditor({ customer, userId, onSaved, onSummaryRefreshQueued, showSummary = true }: Props) {
  const [customerInstructions, setCustomerInstructions] = useState(customer.profile?.customerInstructions || customer.profile?.smartPrivateAdminNote || "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshQueued, setRefreshQueued] = useState(false);

  const customerId = customer.$id || customer.id || customer.customer_id;
  const summaryState = getCustomerSummaryDisplayState(customer);

  useEffect(() => {
    setCustomerInstructions(customer.profile?.customerInstructions || customer.profile?.smartPrivateAdminNote || "");
  }, [customerId, customer.profile?.customerInstructions, customer.profile?.smartPrivateAdminNote]);

  useEffect(() => {
    setRefreshQueued(false);
  }, [customerId]);

  useEffect(() => {
    if (!userId || !customerId || !summaryState.canRefresh || refreshQueued) return;
    setRefreshQueued(true);
    requestCustomerSummaryRefresh({ userId, customerId })
      .then(() => onSummaryRefreshQueued?.())
      .catch(() => {});
  }, [userId, customerId, summaryState.canRefresh, refreshQueued, onSummaryRefreshQueued]);

  const handleSave = async () => {
    if (!userId || !customerId) return;
    setIsSaving(true);
    setMessage("");
    try {
      const profile = await saveCustomerProfileNotes({
        userId,
        customerId,
        customerInstructions
      });
      onSaved(profile);
      setMessage("Saved");
    } catch (e: any) {
      setMessage(e.message || "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {showSummary ? (
        <textarea
          value={summaryState.summary}
          readOnly
          rows={3}
          className={`w-full bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg p-2 text-xs outline-none resize-y ${summaryState.pending ? "text-amber-600 dark:text-amber-300 italic" : "text-gray-700 dark:text-neutral-300"}`}
          placeholder="Chat summary will be written by AI"
        />
      ) : null}
      <textarea
        value={customerInstructions}
        onChange={(e) => setCustomerInstructions(e.target.value)}
        rows={3}
        className="w-full bg-white dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg p-2 text-xs text-gray-700 dark:text-neutral-300 outline-none focus:border-emerald-400 resize-y"
        placeholder="Private AI instructions for future replies to this customer"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider disabled:opacity-60"
        >
          <Save className="w-3 h-3" />
          {isSaving ? "Saving" : "Save Notes"}
        </button>
        {message ? <span className="text-[10px] font-bold text-gray-400">{message}</span> : null}
      </div>
    </div>
  );
}
