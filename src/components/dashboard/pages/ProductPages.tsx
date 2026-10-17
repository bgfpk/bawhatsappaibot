import React from "react";
import { createPortal } from "react-dom";
import { Package, SlidersHorizontal, X } from "lucide-react";
import { SectionHeader, SettingsCard } from "../DashboardPrimitives";

export function ProductCatalogPage({ children }: { children: React.ReactNode }) {
  return (
    <SettingsCard>
      <SectionHeader
        title="Catalog"
        description="Search, review, duplicate, edit, or delete products and services used by the AI."
        icon={Package}
      />
      {children}
    </SettingsCard>
  );
}

export function ProductEditorOverlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-stretch justify-center bg-black/70 p-0 sm:items-center sm:p-4 lg:p-6">
      <div className="relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-neutral-900 sm:h-auto sm:max-h-[94dvh] sm:rounded-[1.25rem] sm:border sm:border-emerald-200 dark:sm:border-emerald-900">
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-4 pr-14 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5 sm:pr-16">
          <SectionHeader
            title="Product Configuration"
            description="Organize catalog data into AI-readable product/service details, pricing, stock, and variations."
            icon={SlidersHorizontal}
          />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
              aria-label="Close product editor"
              title="Close product editor"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="dashboard-product-modal-body custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
