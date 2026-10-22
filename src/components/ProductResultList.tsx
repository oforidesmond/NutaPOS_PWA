import { formatQty } from '@/lib/quantity';
import type { Product } from '@/db/schema';
import { text } from '@/theme';

function meta(product: Product): string {
  const parts: string[] = [];
  if (product.sku) parts.push(`SKU ${product.sku}`);
  if (product.barcode) parts.push(`Barcode ${product.barcode}`);
  parts.push(`Stock ${formatQty(product.stock_quantity)}`);
  return parts.join(' · ');
}

type Props = {
  products: Product[];
  onPick: (product: Product) => void;
};

export function ProductResultList({ products, onPick }: Props) {
  if (products.length === 0) return null;
  return (
    <ul className="product-results">
      {products.map((product) => (
        <li key={product.id}>
          <button type="button" className="product-result" onClick={() => onPick(product)}>
            <span className="product-result-copy">
              <span className="product-result-name" style={text.headline}>
                {product.name}
              </span>
              <span style={text.caption}>{meta(product)}</span>
            </span>
            <span style={text.headline}>{product.price.toFixed(2)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
