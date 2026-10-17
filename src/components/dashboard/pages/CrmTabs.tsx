import React from "react";

export function CrmTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; badge?: number }>;
  activeTab: string;
  onChange: (tab: string) => void;
}) {
  return (
    <nav className="rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex gap-1.5 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition ${
              activeTab === tab.id
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {tab.label}
            {typeof tab.badge === "number" ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400"}`}>
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}
