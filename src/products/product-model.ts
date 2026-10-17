export interface ProductItem {
  id?: string;
  name: string;
  sku?: string;
  type?: string;
  base_price?: number;
  cost_price?: number;
  stock?: number;
  weight?: number;
  description?: string;
  imageUrl?: string;
  variations?: any[];
  isAvailable?: boolean;
  rawProduct: any;
}

export function normalizeProductRecord(raw: any): ProductItem {
  const safeRaw = raw || {};
  const id = safeRaw.$id || safeRaw.id || safeRaw.productId || undefined;
  const name = safeRaw.name || safeRaw.title || "Name unavailable";
  const sku = safeRaw.sku || undefined;
  const type = safeRaw.type || undefined;
  const base_price = safeRaw.base_price !== undefined && safeRaw.base_price !== null ? Number(safeRaw.base_price) : (safeRaw.price !== undefined ? Number(safeRaw.price) : undefined);
  const cost_price = safeRaw.cost_price !== undefined ? Number(safeRaw.cost_price) : undefined;
  const stock = safeRaw.stock !== undefined ? Number(safeRaw.stock) : undefined;
  const weight = safeRaw.weight !== undefined ? Number(safeRaw.weight) : undefined;
  const description = safeRaw.description || safeRaw.desc || undefined;
  const imageUrl = safeRaw.imageUrl || safeRaw.image_url || safeRaw.image || undefined;
  const variations = Array.isArray(safeRaw.variations) ? safeRaw.variations : undefined;
  const isAvailable = safeRaw.isAvailable !== undefined ? Boolean(safeRaw.isAvailable) : (safeRaw.available !== undefined ? Boolean(safeRaw.available) : undefined);

  return {
    id,
    name,
    sku,
    type,
    base_price,
    cost_price,
    stock,
    weight,
    description,
    imageUrl,
    variations,
    isAvailable,
    rawProduct: safeRaw,
  };
}

export function mergeProductEdits(originalRaw: any, editedFields: Partial<ProductItem>): any {
  const base = { ...(originalRaw || {}) };

  if (editedFields.name !== undefined) base.name = editedFields.name;
  if (editedFields.sku !== undefined) base.sku = editedFields.sku;
  if (editedFields.type !== undefined) base.type = editedFields.type;
  if (editedFields.base_price !== undefined) {
    base.base_price = editedFields.base_price;
    base.price = editedFields.base_price;
  }
  if (editedFields.cost_price !== undefined) base.cost_price = editedFields.cost_price;
  if (editedFields.stock !== undefined) base.stock = editedFields.stock;
  if (editedFields.weight !== undefined) base.weight = editedFields.weight;
  if (editedFields.description !== undefined) base.description = editedFields.description;
  if (editedFields.imageUrl !== undefined) base.imageUrl = editedFields.imageUrl;
  if (editedFields.variations !== undefined) base.variations = editedFields.variations;
  if (editedFields.isAvailable !== undefined) base.isAvailable = editedFields.isAvailable;

  return base;
}

export function filterProducts(products: ProductItem[], query: string, typeFilter: string): ProductItem[] {
  const q = query.trim().toLowerCase();

  return products.filter((item) => {
    if (q) {
      const matchName = (item.name || "").toLowerCase().includes(q);
      const matchSku = (item.sku || "").toLowerCase().includes(q);
      const matchDesc = (item.description || "").toLowerCase().includes(q);
      if (!matchName && !matchSku && !matchDesc) return false;
    }

    if (typeFilter !== "all") {
      if (item.type !== typeFilter) return false;
    }

    return true;
  });
}
