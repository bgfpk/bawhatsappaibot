import React, { useState, useEffect, useRef, useMemo } from "react";
import { Users, Search, RefreshCw, AlertCircle, AlertTriangle, Check, ChevronDown, ShieldCheck, WifiOff } from "lucide-react";

export interface WhatsAppGroupOption {
  jid: string;
  name: string;
  description?: string;
  participantCount?: number;
  isBotParticipant?: boolean;
  isBotAdmin?: boolean;
  botJid?: string;
}

export interface WhatsAppGroupSelectorProps {
  selectedBotId?: string;
  selectedJid?: string;
  selectedGroupName?: string;
  onSelect: (group: { jid: string; name: string } | null) => void;
  disabled?: boolean;
  excludedJids?: string[];
  label?: string;
  placeholder?: string;
  purposeContext?: "media" | "sequence" | "welcome" | "general";
}

export const WhatsAppGroupSelector: React.FC<WhatsAppGroupSelectorProps> = ({
  selectedBotId,
  selectedJid = "",
  selectedGroupName = "",
  onSelect,
  disabled = false,
  excludedJids = [],
  label = "Select WhatsApp Group",
  placeholder = "Search or choose a WhatsApp group...",
  purposeContext = "general",
}) => {
  const [groups, setGroups] = useState<WhatsAppGroupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeFetchBotRef = useRef<string | null>(null);

  const fetchGroups = async (botId: string) => {
    if (!botId) {
      setGroups([]);
      setError(null);
      setIsOffline(false);
      return;
    }

    activeFetchBotRef.current = botId;
    setLoading(true);
    setError(null);
    setIsOffline(false);

    try {
      const res = await fetch(`/api/user/whatsapp/participating-groups?botId=${encodeURIComponent(botId)}`);
      const data = await res.json().catch(() => ({}));

      // Guard against race conditions if user changed instance while fetch was in flight
      if (activeFetchBotRef.current !== botId) return;

      if (res.status === 503 || data.offline) {
        setIsOffline(true);
        setGroups([]);
        setError("WhatsApp instance is offline. Reconnect it to load groups.");
        return;
      }

      if (!res.ok || !data.success) {
        setGroups([]);
        setError(data.error || "Failed to load WhatsApp groups.");
        return;
      }

      if (Array.isArray(data.groups)) {
        setGroups(data.groups);
      } else {
        setGroups([]);
      }
    } catch (err: any) {
      if (activeFetchBotRef.current === botId) {
        setGroups([]);
        setError("WhatsApp group sync failed. Please check connection and retry.");
      }
    } finally {
      if (activeFetchBotRef.current === botId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (selectedBotId) {
      fetchGroups(selectedBotId);
    } else {
      setGroups([]);
      setError(null);
      setIsOffline(false);
    }
  }, [selectedBotId]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const nameMatch = (g.name || "").toLowerCase().includes(q);
      const descMatch = (g.description || "").toLowerCase().includes(q);
      return nameMatch || descMatch;
    });
  }, [groups, searchQuery]);

  // Find currently selected group object in loaded groups
  const activeSelectedGroup = useMemo(() => {
    if (!selectedJid) return null;
    return groups.find((g) => g.jid === selectedJid) || null;
  }, [groups, selectedJid]);

  // Check if an existing binding is unavailable in current groups
  const isExistingBindingUnavailable = Boolean(
    selectedJid &&
    selectedJid.trim().endsWith("@g.us") &&
    !loading &&
    groups.length > 0 &&
    !activeSelectedGroup
  );

  const displayTitle = activeSelectedGroup
    ? activeSelectedGroup.name
    : selectedGroupName || (selectedJid ? selectedJid.split("@")[0] : "");

  return (
    <div className="space-y-1.5" ref={dropdownRef}>
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-bold text-[var(--ca-text-primary)]">
          {label} <span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          onClick={() => selectedBotId && fetchGroups(selectedBotId)}
          disabled={loading || !selectedBotId || disabled}
          title="Refresh participating groups from WhatsApp"
          className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Groups</span>
        </button>
      </div>

      {/* Main Selector Button */}
      <div className="relative">
        <button
          type="button"
          disabled={disabled || !selectedBotId}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 text-xs text-left outline-none transition-all ${
            isOpen
              ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-[var(--ca-surface-1)]"
              : "border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] hover:border-emerald-500"
          } ${disabled || !selectedBotId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className="flex items-center gap-2 truncate pr-2">
            <Users className="h-4 w-4 shrink-0 text-[var(--ca-text-muted)]" />
            {displayTitle ? (
              <span className="font-bold text-[var(--ca-text-primary)] truncate">
                {displayTitle}
              </span>
            ) : (
              <span className="text-[var(--ca-text-muted)] truncate">
                {!selectedBotId ? "Select an instance first" : placeholder}
              </span>
            )}
          </div>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--ca-text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-2xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-1)] p-2 shadow-xl space-y-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search WhatsApp groups..."
                className="w-full rounded-xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-2)] pl-8 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
              />
            </div>

            {/* Dropdown Options List */}
            <div className="max-h-56 overflow-y-auto space-y-1">
              {loading && groups.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--ca-text-muted)] flex items-center justify-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                  <span>Loading WhatsApp groups...</span>
                </div>
              ) : isOffline ? (
                <div className="p-3 text-center space-y-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
                  <div className="flex items-center justify-center gap-1.5 font-bold">
                    <WifiOff className="h-4 w-4" />
                    <span>Instance Offline</span>
                  </div>
                  <p className="text-[11px] text-[var(--ca-text-muted)]">
                    WhatsApp instance is offline. Reconnect it to load groups.
                  </p>
                </div>
              ) : error ? (
                <div className="p-3 text-center space-y-1 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500">
                  <p className="font-bold">Error loading groups</p>
                  <p className="text-[11px] text-[var(--ca-text-muted)]">{error}</p>
                </div>
              ) : groups.length === 0 ? (
                <div className="p-4 text-center space-y-1.5 text-xs text-[var(--ca-text-muted)]">
                  <p className="font-bold text-[var(--ca-text-secondary)]">No WhatsApp groups found</p>
                  <p className="text-[11px]">
                    Create a WhatsApp group or add this connected number to an existing group, then press Refresh Groups.
                  </p>
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="p-3 text-center text-xs text-[var(--ca-text-muted)]">
                  No groups matching "{searchQuery}"
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const isSelected = group.jid === selectedJid;
                  const isExcluded = excludedJids.includes(group.jid) && !isSelected;

                  return (
                    <button
                      key={group.jid}
                      type="button"
                      disabled={isExcluded}
                      onClick={() => {
                        onSelect({ jid: group.jid, name: group.name });
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-xl p-2.5 text-xs text-left transition-colors ${
                        isSelected
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30"
                          : isExcluded
                          ? "opacity-40 cursor-not-allowed bg-[var(--ca-surface-2)]"
                          : "hover:bg-[var(--ca-surface-2)] text-[var(--ca-text-primary)]"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold truncate">{group.name}</span>
                          {group.isBotAdmin && (
                            <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                              <ShieldCheck className="h-2.5 w-2.5" />
                              Admin
                            </span>
                          )}
                          {isExcluded && (
                            <span className="text-[10px] text-[var(--ca-text-muted)] font-normal">
                              (Already linked)
                            </span>
                          )}
                        </div>
                        {typeof group.participantCount === "number" && (
                          <p className="text-[10px] text-[var(--ca-text-muted)]">
                            {group.participantCount} participant{group.participantCount === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Warning if currently linked group is not in WhatsApp list */}
      {isExistingBindingUnavailable && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-500 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Currently linked group unavailable</p>
            <p className="text-[10px] text-[var(--ca-text-muted)]">
              This group was not returned by WhatsApp discovery. It may be deleted, the bot was removed, or WhatsApp temporarily lost connection. The existing binding will be preserved unless you choose another group.
            </p>
          </div>
        </div>
      )}

      {/* Technical Read-only JID for debugging/support */}
      {selectedJid && (
        <p className="font-mono text-[10px] text-[var(--ca-text-muted)] truncate pt-0.5">
          Linked WhatsApp JID: <span className="text-[var(--ca-text-secondary)] select-all">{selectedJid}</span>
        </p>
      )}
    </div>
  );
};
