import React from "react";
import { Link } from "react-router-dom";

export type ClientSectionTab = {
  label: string;
  active: boolean;
  path?: string;
  onClick?: () => void;
};

type Props = {
  label: string;
  tabs: ClientSectionTab[];
};

export function ClientSectionTabs({ label, tabs }: Props) {
  return (
    <nav
      aria-label={`${label} sections`}
      className="custom-scrollbar mb-4 flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {tabs.map((tab) => {
        const className = `shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
          tab.active
            ? "bg-emerald-600 text-white"
            : "text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`;

        if (tab.path) {
          return (
            <Link
              key={tab.label}
              to={tab.path}
              className={className}
            >
              {tab.label}
            </Link>
          );
        }

        return (
          <button
            key={tab.label}
            type="button"
            onClick={tab.onClick}
            className={className}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
