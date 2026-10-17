import React, { useState } from "react";
import { Users, Plus, Shield, Search, Filter, Trash2, Mail, CheckCircle2, AlertTriangle } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import { filterTeamMembers, type TeamMemberRecord } from "./platform-model";

interface Props {
  members?: TeamMemberRecord[];
  showGetStarted?: boolean;
  onToggleShowGetStarted?: (val: boolean) => void;
  onInviteMember?: (name: string, email: string, role: string) => Promise<void>;
  onChangeRole?: (memberId: string, newRole: string) => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
  formatDate?: (ts: any) => string;
}

export const TeamAccessPage: React.FC<Props> = ({
  members = [],
  showGetStarted = true,
  onToggleShowGetStarted,
  onInviteMember,
  onChangeRole,
  onRemoveMember,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [isInviting, setIsInviting] = useState(false);

  const [editingMember, setEditingMember] = useState<TeamMemberRecord | null>(null);
  const [newRole, setNewRole] = useState("agent");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const [removingMember, setRemovingMember] = useState<TeamMemberRecord | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const filtered = filterTeamMembers(members, query, roleFilter);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim() || !onInviteMember) return;

    setIsInviting(true);
    try {
      await onInviteMember(inviteName.trim(), inviteEmail.trim(), inviteRole);
      setIsInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("agent");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !onChangeRole) return;

    setIsUpdatingRole(true);
    try {
      await onChangeRole(editingMember.id, newRole);
      setEditingMember(null);
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleRemoveConfirm = async () => {
    if (!removingMember || !onRemoveMember) return;

    setIsRemoving(true);
    try {
      await onRemoveMember(removingMember.id);
      setRemovingMember(null);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Account Access</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                View account workspace ownership and access details.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
              <input
                type="text"
                placeholder="Search account users..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
            </div>

            {onInviteMember && (
              <button
                type="button"
                onClick={() => setIsInviteOpen(true)}
                className="ca-button-primary text-xs"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Invite Member
              </button>
            )}
          </div>
        </div>

        {/* Members Table */}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--ca-text-muted)]">
              No team members match your search filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-bold">
                  <th className="py-3 px-3">Name & Email</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Joined</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                {filtered.map((member) => (
                  <tr key={member.id} className="hover:bg-[var(--ca-bg-hover)]">
                    <td className="py-3 px-3">
                      <div className="font-bold text-[var(--ca-text-primary)]">{member.name}</div>
                      <div className="text-[11px] text-[var(--ca-text-secondary)] font-mono">{member.email}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-[10px] uppercase bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded">
                        <Shield className="w-3 h-3" />
                        {member.roleLabel || member.role || "Unknown"}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          member.status === "active"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : member.status === "invited"
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-rose-500/10 text-rose-500"
                        }`}
                      >
                        {member.status || "Unknown"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[var(--ca-text-secondary)]">
                      {member.joinedAt ? formatDate(member.joinedAt) : "Not recorded"}
                    </td>
                    <td className="py-3 px-3 text-right space-x-1">
                      {member.role !== "owner" && (onChangeRole || onRemoveMember) ? (
                        <>
                          {onChangeRole && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMember(member);
                                setNewRole(member.role || "agent");
                              }}
                              className="ca-button-secondary text-xs px-2.5 py-1"
                            >
                              Edit Role
                            </button>
                          )}
                          {onRemoveMember && (
                            <button
                              type="button"
                              onClick={() => setRemovingMember(member)}
                              className="ca-button-secondary text-xs text-rose-500 hover:bg-rose-500/10 px-2.5 py-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-[var(--ca-text-muted)] italic">Read-only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Workspace Preferences */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--ca-text-primary)]">
              Show Get Started
            </h3>
            <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
              Display the Get Started setup checklist in the main navigation sidebar.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showGetStarted}
              onChange={(e) => onToggleShowGetStarted?.(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--ca-bg-hover)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--ca-brand)] border border-[var(--ca-border-subtle)]"></div>
          </label>
        </div>
      </div>

      {/* Invite Modal */}
      <Dialog
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite Team Member"
      >
        <form onSubmit={handleInviteSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Alex Johnson"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Email Address *
            </label>
            <input
              type="email"
              required
              placeholder="contact-5e70f358a71d@example.invalid"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Assigned Role *
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] cursor-pointer"
            >
              <option value="admin">Administrator (Full settings & instance access)</option>
              <option value="manager">Manager (Operations & workspace management)</option>
              <option value="agent">Agent (Customer management and support)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsInviteOpen(false)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isInviting || !inviteName.trim() || !inviteEmail.trim()}
              className="ca-button-primary text-xs"
            >
              {isInviting ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Edit Role Modal */}
      <Dialog
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={`Change Role: ${editingMember?.name}`}
      >
        <form onSubmit={handleRoleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Select New Role
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)] cursor-pointer"
            >
              <option value="admin">Administrator</option>
              <option value="manager">Manager</option>
              <option value="agent">Agent</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingMember(null)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdatingRole}
              className="ca-button-primary text-xs"
            >
              {isUpdatingRole ? "Saving..." : "Update Role"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Remove Member Confirmation */}
      <Dialog
        isOpen={Boolean(removingMember)}
        onClose={() => setRemovingMember(null)}
        title="Remove Team Member"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/10 text-rose-500 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>
              Are you sure you want to remove <strong className="font-bold">{removingMember?.name}</strong> (<code className="font-mono">{removingMember?.email}</code>)? Access to this workspace will be revoked immediately.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRemovingMember(null)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemoveConfirm}
              disabled={isRemoving}
              className="ca-button-primary text-xs bg-rose-600 hover:bg-rose-700"
            >
              {isRemoving ? "Removing..." : "Confirm Revoke"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
