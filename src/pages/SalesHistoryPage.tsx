import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/toast';
import { searchSales } from '@/db/saleRepository';
import type { Sale } from '@/db/schema';
import { printSaleReceipt, printSaleWithBrowser } from '@/services/printerService';
import { text } from '@/theme';

type Range = 'today' | 'week' | 'month' | 'all';

function dateBounds(range: Range, now = new Date()): { dateFrom?: string; dateTo?: string } {
  if (range === 'today') {
    const day = now.toISOString().slice(0, 10);
    return { dateFrom: `${day}T00:00:00.000Z`, dateTo: `${day}T23:59:59.999Z` };
  }
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { dateFrom: start.toISOString() };
  }
  if (range === 'month') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { dateFrom: start.toISOString() };
  }
  return {};
}

export function SalesHistoryPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('week');
  const [payment, setPayment] = useState('');
  const [receiptQuery, setReceiptQuery] = useState('');
  const [minAmountStr, setMinAmountStr] = useState('');
  const [maxAmountStr, setMaxAmountStr] = useState('');
  const [rows, setRows] = useState<Sale[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [printingSaleId, setPrintingSaleId] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ saleId: string; message: string } | null>(null);

  const load = useCallback(
    async (next?: { range?: Range; receiptQuery?: string; minAmountStr?: string; maxAmountStr?: string; payment?: string }) => {
      const activeRange = next?.range ?? range;
      const activeReceipt = next?.receiptQuery ?? receiptQuery;
      const activeMin = next?.minAmountStr ?? minAmountStr;
      const activeMax = next?.maxAmountStr ?? maxAmountStr;
      const activePayment = next?.payment ?? payment;
      const trimmedMin = activeMin.trim();
      const trimmedMax = activeMax.trim();
      const minAmount = trimmedMin === '' ? undefined : Number(trimmedMin);
      const maxAmount = trimmedMax === '' ? undefined : Number(trimmedMax);
      const minInvalid = trimmedMin !== '' && !Number.isFinite(minAmount);
      const maxInvalid = trimmedMax !== '' && !Number.isFinite(maxAmount);
      const rangeInvalid =
        minAmount != null &&
        maxAmount != null &&
        Number.isFinite(minAmount) &&
        Number.isFinite(maxAmount) &&
        minAmount > maxAmount;

      if (minInvalid || maxInvalid || rangeInvalid) {
        setFeedbackMessage(
          minInvalid || maxInvalid
            ? 'Enter valid totals before applying filters.'
            : 'Minimum total cannot be greater than maximum total.',
        );
        return;
      }

      setFeedbackMessage(null);
      setLoading(true);
      try {
        const bounds = dateBounds(activeRange);
        let list = await searchSales(
          {
            dateFrom: bounds.dateFrom,
            dateTo: bounds.dateTo,
            receiptQuery: activeReceipt.trim() || undefined,
            minAmount: minAmount != null && !Number.isNaN(minAmount) ? minAmount : undefined,
            maxAmount: maxAmount != null && !Number.isNaN(maxAmount) ? maxAmount : undefined,
          },
          200,
        );
        const method = activePayment.trim().toUpperCase();
        if (method) {
          list = list.filter((sale) => (sale.payment_method ?? '').toUpperCase().includes(method));
        }
        setRows(list);
      } finally {
        setLoading(false);
      }
    },
    [range, receiptQuery, minAmountStr, maxAmountStr, payment],
  );

  useEffect(() => {
    void load();
    // Initial week view only. Apply reads the latest field values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFilters = () => {
    setRange('week');
    setPayment('');
    setReceiptQuery('');
    setMinAmountStr('');
    setMaxAmountStr('');
    setFeedbackMessage(null);
    void load({ range: 'week', receiptQuery: '', minAmountStr: '', maxAmountStr: '', payment: '' });
  };

  const hasActiveFilters =
    range !== 'week' ||
    receiptQuery.trim().length > 0 ||
    minAmountStr.trim().length > 0 ||
    maxAmountStr.trim().length > 0 ||
    payment.trim().length > 0;

  const printSale = (saleId: string) => {
    if (printingSaleId) return;
    setPrintingSaleId(saleId);
    setOffer(null);
    void (async () => {
      try {
        const result = await printSaleReceipt(saleId);
        if (result.ok) {
          showToast(result.printedVia === 'browser' ? 'Print sheet opened' : 'Receipt printed', result.message);
        } else {
          setOffer({ saleId, message: result.message });
          showToast('Print failed', result.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Print failed';
        setOffer({ saleId, message });
        showToast('Print failed', message);
      } finally {
        setPrintingSaleId(null);
      }
    })();
  };

  const printBrowser = (saleId: string) => {
    if (printingSaleId) return;
    setPrintingSaleId(saleId);
    void (async () => {
      try {
        await printSaleWithBrowser(saleId);
        setOffer(null);
        showToast('Print sheet opened', 'Receipt opened in the browser print sheet.');
      } catch (error) {
        showToast('Print failed', error instanceof Error ? error.message : 'Print failed');
      } finally {
        setPrintingSaleId(null);
      }
    })();
  };

  return (
    <Screen header={<GlassHeader title="Sales history" backTo="/pos" />}>
      <div className="stack">
      <div className="filter-chips" role="group" aria-label="Date range">
        {(['today', 'week', 'month', 'all'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`filter-chip${range === item ? ' filter-chip-on' : ''}`}
            aria-pressed={range === item}
            onClick={() => {
              setRange(item);
              if (feedbackMessage) setFeedbackMessage(null);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <TextField
        label="Receipt contains"
        value={receiptQuery}
        onChange={(event) => {
          setReceiptQuery(event.target.value);
          if (feedbackMessage) setFeedbackMessage(null);
        }}
        placeholder="Receipt # or id contains..."
        autoCapitalize="none"
      />
      <div className="filter-pair">
        <TextField
          label="Min total"
          value={minAmountStr}
          onChange={(event) => {
            setMinAmountStr(event.target.value);
            if (feedbackMessage) setFeedbackMessage(null);
          }}
          inputMode="decimal"
          placeholder="0.00"
        />
        <TextField
          label="Max total"
          value={maxAmountStr}
          onChange={(event) => {
            setMaxAmountStr(event.target.value);
            if (feedbackMessage) setFeedbackMessage(null);
          }}
          inputMode="decimal"
          placeholder="0.00"
        />
      </div>
      <TextField
        label="Payment method"
        value={payment}
        onChange={(event) => {
          setPayment(event.target.value);
          if (feedbackMessage) setFeedbackMessage(null);
        }}
        placeholder="Filter payment method (e.g. CASH)"
        autoCapitalize="characters"
        onKeyDown={(event) => {
          if (event.key === 'Enter') void load();
        }}
      />
      <FeedbackBanner message={feedbackMessage} />
      <Button title="Apply" onClick={() => void load()} />
      {hasActiveFilters ? <Button title="Clear filters" variant="ghost" onClick={clearFilters} /> : null}

      {loading ? (
        <p style={text.callout}>Loading sales…</p>
      ) : rows.length === 0 ? (
        hasActiveFilters ? (
          <div className="history-empty">
            <p style={text.headline}>No sales match these filters</p>
            <p style={text.callout}>Try another date range, or clear the filters.</p>
          </div>
        ) : (
          <div className="history-empty">
            <p style={text.headline}>No sales yet</p>
            <p style={text.callout}>Completed checkouts appear here for this device.</p>
            <Button title="Open new sale" onClick={() => navigate('/pos')} />
          </div>
        )
      ) : (
        <div className="stack">
          {rows.map((sale) => {
            const label = sale.receipt_number ?? sale.id.slice(0, 8).toUpperCase();
            const printing = printingSaleId === sale.id;
            return (
              <article key={sale.id} className="history-card">
                <div className="history-main">
                  <div className="history-top">
                    <p style={text.headline}>{label}</p>
                    {sale.synced_at ? <span className="badge">Synced</span> : null}
                  </div>
                  <p className="history-meta" style={text.footnote}>
                    {sale.sold_at.slice(0, 16)} · GHS {Number(sale.total_amount).toFixed(2)} · {sale.payment_method ?? ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="print-mini"
                  disabled={printingSaleId !== null}
                  aria-busy={printing}
                  aria-label={`Print receipt ${label}`}
                  onClick={() => printSale(sale.id)}
                >
                  {printing ? '…' : 'Print'}
                </button>
                {offer?.saleId === sale.id ? (
                  <div className="history-offer">
                    <p className="banner-error" role="alert" style={text.footnote}>
                      {offer.message}
                    </p>
                    <Button title="Print with browser" variant="secondary" disabled={printingSaleId !== null} onClick={() => printBrowser(sale.id)} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      </div>
    </Screen>
  );
}
