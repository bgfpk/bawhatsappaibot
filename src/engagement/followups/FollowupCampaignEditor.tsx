import React, { useState, useEffect } from "react";
import { Dialog } from "../../design-system/primitives/Overlays";
import { Sparkles, MessageSquare, AlertCircle } from "lucide-react";
import { TextLimitCounter } from "../../components/TextLimitCounter";
import type { FollowupCampaign } from "./followup-model";

export interface FollowupCampaignEditorProps {
  campaign: FollowupCampaign | null;
  initialType?: "fixed_message" | "ai_smart_followup";
  isOpen: boolean;
  onClose: () => void;
  onSave: (campaignData: Partial<FollowupCampaign>) => Promise<void> | void;
}

export const FollowupCampaignEditor: React.FC<FollowupCampaignEditorProps> = ({
  campaign,
  initialType = "fixed_message",
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState<"fixed_message" | "ai_smart_followup">(
    campaign?.campaign_type === "ai_smart_followup" ? "ai_smart_followup" : initialType
  );
  const [hours, setHours] = useState(24);
  const [windowHours, setWindowHours] = useState(48);
  const [audience, setAudience] = useState("all_customers");
  const [fixedMessage, setFixedMessage] = useState("");
  const [offerContext, setOfferContext] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (campaign) {
      setName(campaign.name || "");
      setCampaignType(campaign.campaign_type === "ai_smart_followup" ? "ai_smart_followup" : "fixed_message");
      setHours(campaign.hours || 24);
      setWindowHours(campaign.window_hours || 48);
      setAudience(campaign.audience || "all_customers");
      setFixedMessage(campaign.fixed_message || "");
      setOfferContext(campaign.offer_context || "");
    } else {
      setName("");
      setCampaignType(initialType);
      setHours(24);
      setWindowHours(48);
      setAudience("all_customers");
      setFixedMessage("");
      setOfferContext("");
    }
  }, [campaign, initialType, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        id: campaign?.id,
        name: name.trim(),
        campaign_type: campaignType,
        is_active: campaign ? campaign.is_active : true,
        hours: Number(hours),
        window_hours: Number(windowHours),
        audience,
        fixed_message: campaignType === "fixed_message" ? fixedMessage.trim() : undefined,
        offer_context: campaignType === "ai_smart_followup" ? offerContext.trim() : undefined,
        raw: campaign?.raw,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={campaign ? "Edit Follow-up Campaign" : "New Follow-up Campaign"}
      description="Configure automated re-engagement rules for your WhatsApp instance."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
        <div>
          <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
            Campaign Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 24h Cart Recovery or VIP Promo Re-engagement"
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
              Campaign Type
            </label>
            <select
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value as any)}
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            >
              <option value="fixed_message">Fixed Message</option>
              <option value="ai_smart_followup">AI Smart Follow-up</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
              Audience Filter
            </label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            >
              <option value="all_customers">All Customers</option>
              <option value="leads_only">Leads & Prospects Only</option>
              <option value="existing_customers">Existing Customers Only</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
              Inactivity Delay (Hours)
            </label>
            <input
              type="number"
              min="1"
              max="720"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 font-mono text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
              Sending Window (Hours)
            </label>
            <input
              type="number"
              min="1"
              max="168"
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 font-mono text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {campaignType === "fixed_message" ? (
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-bold text-[var(--ca-text-primary)]">
                Fixed WhatsApp Message Content
              </label>
              <TextLimitCounter value={fixedMessage} limit={1000} />
            </div>
            <textarea
              rows={4}
              maxLength={1000}
              value={fixedMessage}
              onChange={(e) => setFixedMessage(e.target.value)}
              placeholder="Hi {{name}}, we noticed you were interested in our products. Do you have any questions?"
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500 font-sans"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="font-bold text-[var(--ca-text-primary)] flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span>AI Prompt / Offer Context</span>
              </label>
              <TextLimitCounter value={offerContext} limit={800} />
            </div>
            <textarea
              rows={4}
              maxLength={800}
              value={offerContext}
              onChange={(e) => setOfferContext(e.target.value)}
              placeholder="Offer 10% discount if customer asked about pricing within the last 24 hours..."
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500 font-sans"
            />
            <p className="text-[10px] text-[var(--ca-text-muted)] italic">
              AI generates a personalized message using customer conversation context and offer guidelines.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 p-3 text-[11px] text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Save updates campaign configuration. Messages are delivered safely according to scheduler rules.</span>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ca-border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Campaign"}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
