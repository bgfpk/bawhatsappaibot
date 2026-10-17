import React from "react";
import { Search, X } from "lucide-react";

export interface ConversationSearchProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export const ConversationSearch: React.FC<ConversationSearchProps> = ({
  value,
  onChange,
  placeholder = "Search customers or messages...",
}) => {
  return (
    <div className="relative w-full">
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ca-text-muted)]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-10 pr-9 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)]"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
