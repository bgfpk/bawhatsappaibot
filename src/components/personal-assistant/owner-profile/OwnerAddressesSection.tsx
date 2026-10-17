import React, { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import type { OwnerProfileSectionProps, OwnerAddress, OwnerDataPrivacyPolicy } from "./owner-profile-types.ts";
import { OwnerPrivacyControl } from "./OwnerPrivacyControl.tsx";
import { PRIVACY_POLICY_OPTIONS } from "./owner-profile-form-utils.ts";

export const OwnerAddressesSection: React.FC<OwnerProfileSectionProps> = ({
  profile,
  onChange,
}) => {
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState<Partial<OwnerAddress>>({
    label: "Home",
    addressLine1: "",
    city: "",
    country: "Pakistan",
    isDefault: false,
    privacyPolicy: "PRIVATE",
  });

  const handleSaveAddress = () => {
    if (!newAddress.addressLine1 || !newAddress.city) return;
    const isDefault = Boolean(newAddress.isDefault || profile.addresses.length === 0);
    let existingAddresses = [...profile.addresses];
    if (isDefault) {
      existingAddresses = existingAddresses.map((a) => ({ ...a, isDefault: false }));
    }

    const addrToAdd: OwnerAddress = {
      id: crypto.randomUUID(),
      label: (newAddress.label || "Home").trim(),
      addressLine1: newAddress.addressLine1.trim(),
      city: newAddress.city.trim(),
      country: (newAddress.country || "Pakistan").trim(),
      postalCode: newAddress.postalCode?.trim(),
      isDefault,
      privacyPolicy: newAddress.privacyPolicy || "PRIVATE",
      source: "owner_dashboard",
    };

    onChange({
      ...profile,
      addresses: [...existingAddresses, addrToAdd],
    });
    setShowAddressForm(false);
    setNewAddress({
      label: "Home",
      addressLine1: "",
      city: "",
      country: "Pakistan",
      isDefault: false,
      privacyPolicy: "PRIVATE",
    });
  };

  const handleDeleteAddress = (id: string) => {
    onChange({
      ...profile,
      addresses: profile.addresses.filter((item) => item.id !== id),
    });
  };

  const handleSetDefault = (id: string) => {
    onChange({
      ...profile,
      addresses: profile.addresses.map((item) => ({
        ...item,
        isDefault: item.id === id,
      })),
    });
  };

  const handleUpdatePrivacy = (id: string, privacyPolicy: OwnerDataPrivacyPolicy) => {
    onChange({
      ...profile,
      addresses: profile.addresses.map((item) =>
        item.id === id ? { ...item, privacyPolicy } : item
      ),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--ca-text-secondary)]">
          Physical and delivery addresses used when authorized tasks (e.g. courier orders) require them.
        </p>
        <button
          type="button"
          onClick={() => setShowAddressForm(!showAddressForm)}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Address
        </button>
      </div>

      {showAddressForm && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20 space-y-3">
          <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
            New Address
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Label
              </label>
              <input
                type="text"
                placeholder="Home, Office, Warehouse"
                value={newAddress.label || ""}
                onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Address Line 1 *
              </label>
              <input
                type="text"
                data-testid="owner-address-line1-input"
                placeholder="House # / Street / Building"
                value={newAddress.addressLine1 || ""}
                onChange={(e) => setNewAddress({ ...newAddress, addressLine1: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                City *
              </label>
              <input
                type="text"
                data-testid="owner-city-input"
                placeholder="Karachi, Lahore, etc."
                value={newAddress.city || ""}
                onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Postal Code
              </label>
              <input
                type="text"
                placeholder="75500"
                value={newAddress.postalCode || ""}
                onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--ca-text-secondary)] mb-1">
                Country *
              </label>
              <input
                type="text"
                data-testid="owner-country-input"
                placeholder="Pakistan"
                value={newAddress.country || "Pakistan"}
                onChange={(e) => setNewAddress({ ...newAddress, country: e.target.value })}
                className="w-full rounded-lg border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1.5 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-[var(--ca-text-primary)]">
                <input
                  type="checkbox"
                  checked={newAddress.isDefault}
                  onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })}
                  className="rounded border-[var(--ca-border-subtle)] text-indigo-600"
                />
                Make Default
              </label>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-[var(--ca-text-secondary)]">Privacy:</span>
                <select
                  value={newAddress.privacyPolicy || "PRIVATE"}
                  onChange={(e) =>
                    setNewAddress({
                      ...newAddress,
                      privacyPolicy: e.target.value as OwnerDataPrivacyPolicy,
                    })
                  }
                  className="rounded border border-[var(--ca-border-subtle)] bg-[var(--ca-card-bg)] p-1 text-xs"
                >
                  {PRIVACY_POLICY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddressForm(false)}
                className="rounded-lg px-2.5 py-1 text-xs text-[var(--ca-text-secondary)] hover:bg-[var(--ca-hover-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAddress}
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Save Address
              </button>
            </div>
          </div>
        </div>
      )}

      {profile.addresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--ca-border-subtle)] p-6 text-center text-xs text-[var(--ca-text-secondary)]">
          No addresses saved yet. Add a default delivery address for your assistant.
        </div>
      ) : (
        <div className="grid gap-3">
          {profile.addresses.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-subtle)] p-3.5"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--ca-text-primary)]">{a.label}</span>
                    {a.isDefault && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                        Default
                      </span>
                    )}
                    <span
                      className="rounded bg-[var(--ca-hover-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400"
                      data-testid="privacy-badge"
                    >
                      {a.privacyPolicy}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                    {a.addressLine1}, {a.city}, {a.country} {a.postalCode ? `(${a.postalCode})` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!a.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(a.id)}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-hover-bg)]"
                  >
                    Set as Default
                  </button>
                )}
                <OwnerPrivacyControl
                  value={a.privacyPolicy}
                  onChange={(val) => handleUpdatePrivacy(a.id, val)}
                  compact
                />
                <button
                  type="button"
                  onClick={() => handleDeleteAddress(a.id)}
                  className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
