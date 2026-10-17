import React, { useState, useMemo } from "react";
import { Search, Package, Plus, Edit2, Trash2 } from "lucide-react";
import { DashboardPageHeader, DashboardToolbar, DashboardEmptyState, ToneBadge } from "../components/dashboard/DashboardPrimitives";
import { Dialog } from "../design-system/primitives/Overlays";
import { filterProducts, normalizeProductRecord, mergeProductEdits, type ProductItem } from "./product-model";
import { ProductFormDialog } from "./ProductFormDialog";

export interface ProductsPageProps {
  products: any[];
  onAddProduct?: (data: Partial<ProductItem>) => Promise<void> | void;
  onEditProduct?: (data: Partial<ProductItem>) => Promise<void> | void;
  onDeleteProduct?: (productId: string) => Promise<void> | void;
  formatCurrency?: (val?: number | string) => string;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({
  products = [],
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  formatCurrency = (val) => (val !== undefined ? String(val) : "Price unavailable"),
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ProductItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const normalized = useMemo(() => {
    return (products || []).map(normalizeProductRecord);
  }, [products]);

  const filtered = useMemo(() => {
    return filterProducts(normalized, searchQuery, typeFilter);
  }, [normalized, searchQuery, typeFilter]);

  const handleSave = async (data: Partial<ProductItem>) => {
    if (data.id && onEditProduct) {
      const mergedPayload = data.rawProduct ? mergeProductEdits(data.rawProduct, data) : data;
      await onEditProduct(mergedPayload);
    } else if (onAddProduct) {
      await onAddProduct(data);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct || !onDeleteProduct) return;
    setIsDeleting(true);
    try {
      await onDeleteProduct(deletingProduct.id);
      setDeletingProduct(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Catalog"
        title="Products & Services"
        description="Add products or services so your AI assistant answers pricing and catalog questions accurately."
        icon={Package}
      />

      <DashboardToolbar>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ca-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, SKU, or details..."
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] pl-10 pr-4 py-2 text-xs font-medium text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
        >
          <option value="all">All Types</option>
          <option value="physical">Physical Products</option>
          <option value="digital">Digital / Services</option>
        </select>

        {onAddProduct && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            <span>Add Product / Service</span>
          </button>
        )}
      </DashboardToolbar>

      {filtered.length === 0 ? (
        <DashboardEmptyState
          icon={Package}
          title="No Products Found"
          body="Your catalog is empty or no products match your search filter."
          tone="neutral"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-surface-1)] p-4 shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--ca-text-primary)] truncate">
                    {item.name}
                  </h4>
                  <ToneBadge tone={item.type === "digital" ? "blue" : "teal"}>
                    {item.type === "digital" ? "Digital / Service" : "Physical"}
                  </ToneBadge>
                </div>

                {item.sku && (
                  <p className="mt-1 font-mono text-[10px] text-[var(--ca-text-muted)]">
                    SKU: {item.sku}
                  </p>
                )}

                <p className="mt-2 font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(item.base_price ?? item.price)}
                </p>

                {item.description && (
                  <p className="mt-2 text-xs text-[var(--ca-text-secondary)] line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--ca-border-subtle)] pt-3">
                {onEditProduct && (
                  <button
                    type="button"
                    onClick={() => setEditingProduct(item)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--ca-text-primary)] hover:border-emerald-500"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                )}
                {onDeleteProduct && (
                  <button
                    type="button"
                    onClick={() => setDeletingProduct(item)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(isCreateOpen || editingProduct) && (
        <ProductFormDialog
          product={editingProduct}
          isOpen={isCreateOpen || Boolean(editingProduct)}
          onClose={() => {
            setIsCreateOpen(false);
            setEditingProduct(null);
          }}
          onSave={handleSave}
        />
      )}

      <Dialog
        isOpen={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        title="Confirm Product Deletion"
        description="Are you sure you want to delete this catalog product?"
      >
        <div className="space-y-4 text-xs font-medium text-[var(--ca-text-primary)]">
          <p>
            You are about to delete <strong>{deletingProduct?.name}</strong>.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ca-border-subtle)]">
            <button
              type="button"
              onClick={() => setDeletingProduct(null)}
              className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete Product"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
