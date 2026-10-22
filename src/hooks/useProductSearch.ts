import { useEffect, useState } from 'react';
import { productRepository } from '@/db/productRepository';
import type { Product } from '@/db/schema';

export function useProductSearch(query: string): { results: Product[]; settled: boolean } {
  const [results, setResults] = useState<Product[]>([]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSettled(false);
      return;
    }
    setSettled(false);
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void productRepository.search({ query: trimmed, limit: 30 }).then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setSettled(true);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  return { results, settled };
}
