import React, { useState } from "react";
import { Laptop, Search, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { filterSessions, type SessionRecord } from "./platform-model";

interface Props {
  sessions?: SessionRecord[];
  onRevokeSession?: (sessionId: string) => Promise<void>;
  formatDate?: (ts: any) => string;
}

export const SessionPanel: React.FC<Props> = ({
  sessions = [],
  onRevokeSession,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [query, setQuery] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const filtered = filterSessions(sessions, query);

  const handleRevoke = async (id: string) => {
    if (!onRevokeSession) return;
    setRevokingId(id);
    try {
      await onRevokeSession(id);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm">
        {!onRevokeSession && (
          <div className="mb-5 p-3 rounded-xl bg-neutral-500/10 text-[var(--ca-text-secondary)] text-xs font-medium border border-[var(--ca-border-subtle)]">
            Active session management is read-only in this view.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <Laptop className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ca-text-primary)]">Active User Sessions</h2>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Review logged-in devices and active session status.
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ca-text-muted)]" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>
        </div>

        {/* Sessions Table */}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--ca-text-muted)]">
              No active sessions match your search.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--ca-border-subtle)] text-[var(--ca-text-muted)] uppercase tracking-wider font-bold">
                  <th className="py-3 px-3">Device & Browser</th>
                  <th className="py-3 px-3">IP Address</th>
                  <th className="py-3 px-3">Last Active</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ca-border-subtle)]">
                {filtered.map((session) => (
                  <tr key={session.id} className="hover:bg-[var(--ca-bg-hover)]">
                    <td className="py-3 px-3 font-bold text-[var(--ca-text-primary)]">
                      {session.device}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--ca-text-secondary)]">
                      {session.ipAddress}
                    </td>
                    <td className="py-3 px-3 text-[var(--ca-text-secondary)]">
                      {formatDate(session.lastActive)}
                    </td>
                    <td className="py-3 px-3">
                      {session.isCurrent ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[10px] uppercase bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          Current Session
                        </span>
                      ) : (
                        <span className="inline-block font-bold text-[10px] uppercase bg-neutral-500/10 text-[var(--ca-text-muted)] px-2 py-0.5 rounded">
                          Active Remote
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {!session.isCurrent && onRevokeSession ? (
                        <button
                          type="button"
                          onClick={() => handleRevoke(session.id)}
                          disabled={revokingId === session.id}
                          className="ca-button-secondary text-xs text-rose-500 hover:bg-rose-500/10 px-2.5 py-1 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          {revokingId === session.id ? "Revoking..." : "Revoke"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-[var(--ca-text-muted)] font-mono">
                          {session.isCurrent ? "—" : "Active"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
