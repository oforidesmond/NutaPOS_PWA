import { create } from 'zustand';
import { productRepository, type ProductRow } from '@/db/productRepository';
import { QTY_MAX, QTY_MIN, addQtyValues, normalizeQty } from '@/lib/quantity';

export type CartLine = {
  key: string;
  product: ProductRow;
  quantity: number;
};

type State = {
  lines: CartLine[];
  addProduct: (product: ProductRow) => void;
  setQty: (key: string, qty: number) => void;
  /** Add a delta (e.g. 0.25 / 0.5) to the current line qty; removes if below min. */
  addQty: (key: string, delta: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  /**
   * Refresh line product snapshots from IndexedDB after catalog sync.
   * Drops lines whose products were deleted locally.
   */
  rehydrateFromDb: () => Promise<void>;
};

function cappedQty(qty: number): number {
  const q = normalizeQty(qty);
  if (q > QTY_MAX) return QTY_MAX;
  return q;
}

export const useCartStore = create<State>((set, get) => ({
  lines: [],
  addProduct: (product) => {
    const lines = get().lines;
    const existing = lines.find((line) => line.product.id === product.id);
    if (existing) {
      set({
        lines: lines.map((line) =>
          line.product.id === product.id ? { ...line, quantity: cappedQty(addQtyValues(line.quantity, 1)) } : line,
        ),
      });
    } else {
      set({ lines: [...lines, { key: product.id, product, quantity: 1 }] });
    }
  },
  setQty: (key, qty) => {
    const q = cappedQty(qty);
    if (q < QTY_MIN) {
      get().removeLine(key);
      return;
    }
    set({ lines: get().lines.map((line) => (line.key === key ? { ...line, quantity: q } : line)) });
  },
  addQty: (key, delta) => {
    const line = get().lines.find((item) => item.key === key);
    if (!line) return;
    get().setQty(key, addQtyValues(line.quantity, delta));
  },
  removeLine: (key) => set({ lines: get().lines.filter((line) => line.key !== key) }),
  clear: () => set({ lines: [] }),
  rehydrateFromDb: async () => {
    const next: CartLine[] = [];
    for (const line of get().lines) {
      const fresh = await productRepository.findById(line.product.id);
      if (!fresh) continue;
      next.push({ ...line, product: fresh });
    }
    set({ lines: next });
  },
}));
