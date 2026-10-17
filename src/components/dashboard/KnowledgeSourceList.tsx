import React from "react";
import { ArrowRight } from "lucide-react";

export type KnowledgeSourceRow = {
  name: string;
  status: string;
  actionLabel: "Manage" | "Review";
  onAction: () => void;
};

type Props = {
  rows: KnowledgeSourceRow[];
};

export function KnowledgeSourceList({ rows }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="divide-y divide-gray-100 dark:divide-neutral-800">
        {rows.map((row) => (
          <div key={row.name} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-950 dark:text-neutral-50">{row.name}</h3>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">{row.status}</p>
            </div>
            <button
              type="button"
              onClick={row.onAction}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 sm:self-auto"
            >
              {row.actionLabel}<ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
