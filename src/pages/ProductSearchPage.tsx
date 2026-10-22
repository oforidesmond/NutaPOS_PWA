import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassHeader } from '@/components/GlassHeader';
import { ProductResultList } from '@/components/ProductResultList';
import { Screen } from '@/components/Screen';
import { TemporaryItemSheet } from '@/components/TemporaryItemSheet';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/toast';
import { useProductSearch } from '@/hooks/useProductSearch';
import { createTemporaryProduct } from '@/services/temporaryProductService';
import { useCartStore } from '@/stores/cartStore';
import { text } from '@/theme';

export function ProductSearchPage() {
  const navigate = useNavigate();
  const addProduct = useCartStore((state) => state.addProduct);
  const [query, setQuery] = useState('');
  const [tempOpen, setTempOpen] = useState(false);
  const { results, settled } = useProductSearch(query);

  return (
    <Screen header={<GlassHeader title="Search products" backTo="/pos" />}>
      <TextField
        label="Search"
        value={query}
        placeholder="SKU, name, or barcode"
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results[0]) {
            event.preventDefault();
            addProduct(results[0]);
            navigate('/pos');
          }
        }}
      />
      <p className="hint" style={text.caption}>
        Search by SKU, name, or barcode.
      </p>
      <ProductResultList
        products={results}
        onPick={(product) => {
          addProduct(product);
          navigate('/pos');
        }}
      />
      {query.trim() && settled && results.length === 0 ? (
        <p className="hint" style={text.callout}>
          No matches. Try a shorter name or the exact SKU/barcode, or add a one-off item below.
        </p>
      ) : null}
      <button type="button" className="pos-card" onClick={() => setTempOpen(true)}>
        <span style={text.subheadline}>One-off item</span>
        <span style={text.caption}>Not in catalog - add name & price</span>
      </button>
      <TemporaryItemSheet
        open={tempOpen}
        mode="manual"
        initialName={query.trim()}
        onCancel={() => setTempOpen(false)}
        onSubmit={(values) => {
          void (async () => {
            try {
              const product = await createTemporaryProduct({ name: values.name, price: values.price, barcode: null });
              addProduct(product);
              navigate('/pos');
            } catch (err) {
              showToast('Could not add item', err instanceof Error ? err.message : 'Please try again.');
            }
          })();
        }}
      />
    </Screen>
  );
}
