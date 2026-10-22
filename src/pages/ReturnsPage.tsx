import { useState } from 'react';
import { ReturnTimeoutError } from '@/api/returnsApi';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/toast';
import { useOnline } from '@/components/useOnline';
import { useAuth } from '@/context/AuthContext';
import { productRepository } from '@/db/productRepository';
import { getReturnedQuantitiesByProduct, getSaleWithItems, searchSales } from '@/db/saleRepository';
import type { Sale } from '@/db/schema';
import { formatQty, normalizeQty, parseQtyInput } from '@/lib/quantity';
import { InternetRequiredForReturnError, returnService, type ReturnLineInput } from '@/services/returnService';
import { text } from '@/theme';

type ReturnLine = {
  itemId: string;
  productId: string;
  name: string;
  maxQty: number;
  unitPrice: number;
  isTemp: boolean;
  qty: number;
  qtyInput: string;
};

export function ReturnsPage() {
  const { user } = useAuth();
  const online = useOnline();
  const [receiptQ, setReceiptQ] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [results, setResults] = useState<Sale[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const runSearch = async () => {
    const trimmedMin = minAmt.trim();
    const trimmedMax = maxAmt.trim();
    const parsedMin = trimmedMin === '' ? undefined : Number(trimmedMin);
    const parsedMax = trimmedMax === '' ? undefined : Number(trimmedMax);
    const minInvalid = trimmedMin !== '' && !Number.isFinite(parsedMin);
    const maxInvalid = trimmedMax !== '' && !Number.isFinite(parsedMax);
    const rangeInvalid =
      parsedMin != null &&
      parsedMax != null &&
      Number.isFinite(parsedMin) &&
      Number.isFinite(parsedMax) &&
      parsedMin > parsedMax;

    if (minInvalid || maxInvalid || rangeInvalid) {
      setFeedbackMessage(
        minInvalid || maxInvalid
          ? 'Enter valid amounts before searching.'
          : 'Minimum amount cannot be greater than maximum amount.',
      );
      return;
    }

    setFeedbackMessage(null);
    const list = await searchSales({
      receiptQuery: receiptQ.trim() || undefined,
      minAmount: parsedMin != null && Number.isFinite(parsedMin) ? parsedMin : undefined,
      maxAmount: parsedMax != null && Number.isFinite(parsedMax) ? parsedMax : undefined,
    });
    setResults(list);
    setSelected(null);
    setLines([]);
  };

  const openSale = async (sale: Sale) => {
    const bundle = await getSaleWithItems(sale.id);
    if (!bundle) return;
    setSelected(sale);
    const alreadyReturned = await getReturnedQuantitiesByProduct(sale.id);
    const remainingByProduct = new Map<string, number>();
    for (const item of bundle.items) {
      const sold = remainingByProduct.get(item.product_id) ?? 0;
      remainingByProduct.set(item.product_id, normalizeQty(sold + item.quantity));
    }
    for (const [productId, sold] of remainingByProduct) {
      const previous = normalizeQty(alreadyReturned[productId] ?? 0);
      remainingByProduct.set(productId, Math.max(0, normalizeQty(sold - previous)));
    }
    const next: ReturnLine[] = [];
    for (const item of bundle.items) {
      const product = await productRepository.findById(item.product_id);
      const productRemaining = remainingByProduct.get(item.product_id) ?? 0;
      const lineMax = Math.min(normalizeQty(item.quantity), productRemaining);
      remainingByProduct.set(item.product_id, Math.max(0, normalizeQty(productRemaining - lineMax)));
      next.push({
        itemId: item.id,
        productId: item.product_id,
        name: product?.name ?? item.product_id,
        maxQty: lineMax,
        unitPrice: item.unit_price,
        isTemp: item.is_temporary_product === 1,
        qty: 0,
        qtyInput: '',
      });
    }
    setLines(next);
  };

  const submitReturn = async () => {
    if (!user || !selected) return;
    const picked: ReturnLineInput[] = lines
      .filter((line) => line.qty > 0)
      .map((line) => ({
        productId: line.productId,
        quantity: line.qty,
        unitPrice: line.unitPrice,
        isTemporaryProduct: line.isTemp,
      }));
    if (!picked.length) {
      setFeedbackMessage('Enter a quantity for at least one line before processing the return.');
      return;
    }
    if (!online) {
      setFeedbackMessage('Processing returns requires an active internet connection to verify the original sale.');
      return;
    }

    setLoading(true);
    try {
      await returnService.processReturn({
        originalSaleId: selected.id,
        lines: picked,
        staffUserId: user.userId,
        branchId: user.branchId,
      });
      setFeedbackMessage(null);
      showToast('Return recorded', 'Synced with the server.');
      setSelected(null);
      setLines([]);
      setResults([]);
    } catch (error) {
      if (error instanceof InternetRequiredForReturnError) {
        setFeedbackMessage('Processing returns requires an active internet connection to verify the original sale.');
      } else if (error instanceof ReturnTimeoutError) {
        showToast('Connection issue', 'Return processing timed out. Please check your connection and try again.');
      } else {
        showToast('Return failed', error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<GlassHeader title="Returns" backTo="/pos" />}>
      {!online ? (
        <p className="sync-banner" role="status">
          Returns require internet. Connect to verify the original sale, then try again.
        </p>
      ) : null}
      <h2 style={text.headline}>Find sale</h2>
      <p className="hint" style={text.callout}>
        Search by receipt code, or filter by amount. Receipt is on the printed slip (RCP-…).
      </p>
      <TextField
        label="Receipt or sale ID"
        value={receiptQ}
        placeholder="Receipt or sale id"
        onChange={(event) => {
          setReceiptQ(event.target.value);
          if (feedbackMessage) setFeedbackMessage(null);
        }}
      />
      <div className="filter-pair">
        <TextField
          label="Min amount"
          inputMode="decimal"
          value={minAmt}
          placeholder="0.00"
          onChange={(event) => {
            setMinAmt(event.target.value);
            if (feedbackMessage) setFeedbackMessage(null);
          }}
        />
        <TextField
          label="Max amount"
          inputMode="decimal"
          value={maxAmt}
          placeholder="0.00"
          onChange={(event) => {
            setMaxAmt(event.target.value);
            if (feedbackMessage) setFeedbackMessage(null);
          }}
        />
      </div>
      <FeedbackBanner message={feedbackMessage} />
      <Button title="Search" onClick={() => void runSearch()} />

      {results.length > 0 ? (
        <>
          <h2 style={text.headline}>Results</h2>
          {results.map((sale) => (
            <button key={sale.id} type="button" className="result-card" onClick={() => void openSale(sale)}>
              <span style={text.headline}>{sale.receipt_number ?? sale.id.slice(0, 8)}</span>
              <span style={text.caption}>
                {sale.sold_at.slice(0, 16)} · {Number(sale.total_amount).toFixed(2)} {sale.payment_method}
              </span>
            </button>
          ))}
        </>
      ) : null}

      {selected ? (
        <section>
          <h2 style={text.headline}>Items to return</h2>
          {lines.map((line) => (
            <div key={line.itemId} className="return-line">
              <div>
                <p style={text.callout}>{line.name}</p>
                <p style={text.caption}>
                  Max {formatQty(line.maxQty)} · {line.unitPrice.toFixed(2)} each
                  {line.isTemp ? ' · temp' : ''}
                </p>
              </div>
              <input
                className="qty-input"
                inputMode="decimal"
                aria-label={`Quantity for ${line.name}`}
                value={line.qtyInput}
                onChange={(event) => {
                  let cleaned = event.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
                  const dot = cleaned.indexOf('.');
                  if (dot !== -1) {
                    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
                    const [whole, frac = ''] = cleaned.split('.');
                    cleaned = `${whole}.${frac.slice(0, 3)}`;
                  }
                  let qty = 0;
                  if (cleaned !== '' && cleaned !== '.') {
                    const parsed = parseQtyInput(cleaned.endsWith('.') ? cleaned.slice(0, -1) : cleaned);
                    qty = parsed == null ? 0 : Math.min(parsed, line.maxQty);
                    if (parsed != null && parsed > line.maxQty) cleaned = formatQty(line.maxQty);
                  }
                  setLines((prev) => prev.map((row) => (row.itemId === line.itemId ? { ...row, qty, qtyInput: cleaned } : row)));
                  if (feedbackMessage) setFeedbackMessage(null);
                }}
              />
            </div>
          ))}
          <Button title={loading ? 'Processing…' : 'Process return'} onClick={() => void submitReturn()} disabled={loading} />
        </section>
      ) : null}
    </Screen>
  );
}
