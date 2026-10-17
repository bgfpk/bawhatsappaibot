import React, { useState, useEffect } from "react";
import { Dialog } from "../design-system/primitives/Overlays";
import type { ProductItem } from "./product-model";

export interface ProductFormDialogProps {
  product?: ProductItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (productData: Partial<ProductItem>) => Promise<void> | void;
}

export const ProductFormDialog: React.FC<ProductFormDialogProps> = ({
  product,
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [type, setType] = useState<"physical" | "digital">("physical");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setName(product.name || "");
      setSku(product.sku || "");
      setType(product.type || "physical");
      const currentPrice = product.base_price !== undefined ? product.base_price : product.price;
      setPrice(currentPrice !== undefined ? String(currentPrice) : "");
      setDescription(product.description || "");
    } else {
      setName("");
      setSku("");
      setType("physical");
      setPrice("");
      setDescription("");
    }
  }, [product, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    const numPrice = price ? Number(price) : undefined;
    try {
      await onSave({
        id: product?.id,
        rawProduct: product?.rawProduct,
        name: name.trim(),
        sku: sku.trim() || undefined,
        type,
        base_price: numPrice,
        price: numPrice,
        description: description.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={product ? "Edit Product / Service" : "Add Product / Service"}
      description="Enter catalog details for your AI assistant to reference."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
        <div>
          <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
            Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Leather Jacket or Web Design Service"
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
              SKU Code
            </label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="e.g. LTH-001"
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 font-mono text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs font-bold text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
            >
              <option value="physical">Physical Product</option>
              <option value="digital">Digital / Service</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
            Price
          </label>
          <input
            type="number"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 2500"
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 font-mono text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block mb-1 font-bold text-[var(--ca-text-primary)]">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Key features, specifications, or pricing notes for AI replies..."
            className="w-full rounded-xl border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] p-2.5 text-xs text-[var(--ca-text-primary)] outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ca-border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--ca-border-default)] px-4 py-2 text-xs font-bold text-[var(--ca-text-secondary)] hover:bg-[var(--ca-surface-2)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Product"}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
