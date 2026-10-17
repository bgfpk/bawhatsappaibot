import React, { useState, useEffect } from "react";
import type {
  PersonalDelegationPolicy,
  PersonalOrderCommitmentMode,
} from "../../../services/personal-delegation-types.ts";
import { isBroadeningPolicyChange } from "../../../services/personal-delegation-policy-utils.ts";

interface PersonalDelegationSettingsViewProps {
  personalInstanceId?: string;
  isFeatureEnabled?: boolean;
}

export const PersonalDelegationSettingsView: React.FC<PersonalDelegationSettingsViewProps> = ({
  personalInstanceId,
  isFeatureEnabled = true,
}) => {
  const [policy, setPolicy] = useState<PersonalDelegationPolicy | null>(null);
  const [baselinePolicy, setBaselinePolicy] = useState<PersonalDelegationPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Broadening Confirmation State
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Partial<PersonalDelegationPolicy> | null>(null);
  const [broadeningReasons, setBroadeningReasons] = useState<string[]>([]);

  useEffect(() => {
    fetchPolicy();
  }, [personalInstanceId]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = personalInstanceId
        ? `/api/personal-assistant/delegation-policy?personalInstanceId=${encodeURIComponent(personalInstanceId)}`
        : `/api/personal-assistant/delegation-policy`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.policy) {
        setPolicy(data.policy);
        setBaselinePolicy(JSON.parse(JSON.stringify(data.policy)));
      } else {
        setError(data.error || "Failed to load delegation policy");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyChanges = async (confirmed = false) => {
    if (!policy || !baselinePolicy) return;

    // Check for broadening
    if (!confirmed) {
      const check = isBroadeningPolicyChange(baselinePolicy, policy);
      if (check.isBroadening) {
        setBroadeningReasons(check.reasons);
        setPendingChanges(policy);
        setShowConfirmation(true);
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch("/api/personal-assistant/delegation-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policy,
          personalInstanceId,
          expectedRevision: baselinePolicy.revision,
        }),
      });

      const data = await res.json();
      if (data.success && data.policy) {
        setPolicy(data.policy);
        setBaselinePolicy(JSON.parse(JSON.stringify(data.policy)));
        setShowConfirmation(false);
        setPendingChanges(null);
        setSuccessMessage("Delegation and safety rules updated successfully!");
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setError(data.error || "Failed to update delegation policy");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!isFeatureEnabled) {
    return (
      <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200">
        <h3 className="font-semibold text-lg">Personal Assistant Disabled</h3>
        <p className="text-sm mt-1 text-amber-300/80">
          The Personal Assistant feature is currently disabled on this account.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
        Loading permissions & safety policy...
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200">
        <p>{error || "Unable to load delegation policy."}</p>
        <button
          onClick={fetchPolicy}
          className="mt-3 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span>🛡️</span> Permissions, Safety & Delegation Policy
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Server-authoritative governance defining what your Personal Assistant is authorized to negotiate, order, and disclose.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm">
          {successMessage}
        </div>
      )}

      {/* Section 1: Orders & Spending */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <span>📦</span> Orders & Spending Authority
        </h3>
        <p className="text-xs text-slate-400">
          Control whether the assistant can commit to orders or purchases on your behalf (Cash on Delivery / Pay on Delivery only).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Order Commitment Mode
            </label>
            <select
              value={policy.orders.orderCommitmentMode}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  orders: {
                    ...policy.orders,
                    orderCommitmentMode: e.target.value as PersonalOrderCommitmentMode,
                    allowOrderCommitment: e.target.value === "WITHIN_LIMITS",
                  },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            >
              <option value="NEVER">🚫 Never place orders</option>
              <option value="ASK_EACH_TIME">⚠️ Ask me every time</option>
              <option value="WITHIN_LIMITS">✅ Allow automatically within my limits</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Max Order Value Per Task (PKR)
            </label>
            <input
              type="number"
              min="0"
              max="50000"
              step="500"
              value={policy.orders.maxOrderValuePerTask}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  orders: {
                    ...policy.orders,
                    maxOrderValuePerTask: Number(e.target.value || 0),
                  },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Daily Spending Ceiling (PKR)
            </label>
            <input
              type="number"
              min="0"
              max="100000"
              step="1000"
              value={policy.orders.maxOrderValuePerDay}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  orders: {
                    ...policy.orders,
                    maxOrderValuePerDay: Number(e.target.value || 0),
                  },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            />
          </div>

          <div className="flex items-center gap-3 pt-6">
            <input
              type="checkbox"
              id="newMerchantApproval"
              checked={policy.orders.newMerchantRequiresApproval}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  orders: {
                    ...policy.orders,
                    newMerchantRequiresApproval: e.target.checked,
                  },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-emerald-500"
            />
            <label htmlFor="newMerchantApproval" className="text-xs text-slate-300">
              Require explicit approval for merchants I haven't messaged before
            </label>
          </div>
        </div>
      </div>

      {/* Section 2: Data Sharing & Privacy */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <span>📍</span> Data Sharing Governance
        </h3>
        <p className="text-xs text-slate-400">
          Personal Assistant only discloses information consistent with your Owner360 privacy and these explicit task rules.
        </p>

        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-3 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={policy.dataDisclosure.allowCitySharingForTasks}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  dataDisclosure: {
                    ...policy.dataDisclosure,
                    allowCitySharingForTasks: e.target.checked,
                  },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-emerald-500"
            />
            Allow sharing my City with merchants during inquiry tasks
          </label>

          <label className="flex items-center gap-3 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={policy.dataDisclosure.allowDeliveryAddressForShopping}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  dataDisclosure: {
                    ...policy.dataDisclosure,
                    allowDeliveryAddressForShopping: e.target.checked,
                  },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-emerald-500"
            />
            Allow sharing my Default Delivery Address for authorized shopping tasks
          </label>

          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center gap-2">
            <span>🔒</span> Owner internal notes and memories are strictly private and NEVER shared externally.
          </div>
        </div>
      </div>

      {/* Section 3: Appointments & Negotiation */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <span>🤝</span> Negotiation & Appointments
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <label className="flex items-center gap-3 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={policy.negotiation.allowPriceNegotiation}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  negotiation: {
                    ...policy.negotiation,
                    allowPriceNegotiation: e.target.checked,
                  },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-emerald-500"
            />
            Allow asking for reasonable discounts on quoted prices
          </label>

          <label className="flex items-center gap-3 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={policy.appointments.allowMeetingNegotiation}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  appointments: {
                    ...policy.appointments,
                    allowMeetingNegotiation: e.target.checked,
                  },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-emerald-500"
            />
            Allow negotiating potential meeting times
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={() => handleApplyChanges(false)}
          disabled={saving}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? "Saving Changes..." : "Save Policy Settings"}
        </button>
      </div>

      {/* Broadening Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-amber-500/30 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-base font-bold">Safety Confirmation Required</h3>
            </div>
            <p className="text-xs text-slate-300">
              The changes you requested make your Personal Assistant more autonomous:
            </p>
            <ul className="text-xs text-amber-200 space-y-1.5 pl-4 list-disc bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
              {broadeningReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
            <p className="text-xs text-slate-400">
              Are you sure you want to grant these autonomous permissions?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowConfirmation(false);
                  setPendingChanges(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApplyChanges(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
