import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { FinalizeSaleModal } from '@/components/FinalizeSaleModal';
import { GlassHeader } from '@/components/GlassHeader';
import { ProductResultList } from '@/components/ProductResultList';
import { SaleCompleteSheet } from '@/components/SaleCompleteSheet';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { StockVarianceModal } from '@/components/StockVarianceModal';
import { TemporaryItemSheet } from '@/components/TemporaryItemSheet';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/toast';
import { UpgradeModal } from '@/components/UpgradeModal';
import { useAuth } from '@/context/AuthContext';
import { productRepository } from '@/db/productRepository';
import { syncQueueRepository } from '@/db/syncQueueRepository';
import { prefsRepository } from '@/db/prefsRepository';
import { getSaleWithItems } from '@/db/saleRepository';
import { useProductSearch } from '@/hooks/useProductSearch';
import { useWedgeScanner } from '@/hooks/useWedgeScanner';
import { formatAutoConvertTipFromJson } from '@/lib/autoConvertTip';
import type { DiscountSettings } from '@/lib/checkoutSettings';
import { discountSettings } from '@/lib/checkoutSettings';
import type { CheckoutTotalsPreview } from '@/lib/checkoutTotals';
import { previewTotals } from '@/lib/checkoutTotals';
import { QTY_HALF, QTY_QUARTER, formatQty, normalizeQty, parseQtyInput } from '@/lib/quantity';
import { pullMasterData } from '@/services/masterDataPull';
import { saleService } from '@/services/saleService';
import { syncWorker } from '@/services/syncWorker';
import { computeStockShortages, type StockShortage } from '@/services/stockVarianceService';
import { createTemporaryProduct } from '@/services/temporaryProductService';
import { trialManager } from '@/services/trialManager';
import { useCartStore, type CartLine } from '@/stores/cartStore';
import { text } from '@/theme';
import type { VarianceByLineKey } from '@/types/stockVariance';

const emptyTotals: CheckoutTotalsPreview = {
  subtotal: 0,
  taxAmount: 0,
  discountAmount: 0,
  totalAmount: 0,
};

export function PosPage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const lines = useCartStore((state) => state.lines);
  const addProduct = useCartStore((state) => state.addProduct);
  const addQty = useCartStore((state) => state.addQty);
  const removeLine = useCartStore((state) => state.removeLine);
  const clearCart = useCartStore((state) => state.clear);
  const rehydrateFromDb = useCartStore((state) => state.rehydrateFromDb);

  const [menuOpen, setMenuOpen] = useState(false);
  const [qtyLine, setQtyLine] = useState<CartLine | null>(null);
  const [nameLine, setNameLine] = useState<CartLine | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [varianceOpen, setVarianceOpen] = useState(false);
  const [shortages, setShortages] = useState<StockShortage[]>([]);
  const [pendingPayment, setPendingPayment] = useState<string | null>(null);
  const [pendingDiscount, setPendingDiscount] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [complete, setComplete] = useState<{ saleId: string; receiptLabel: string; totalAmount: number } | null>(null);
  const [totals, setTotals] = useState<CheckoutTotalsPreview>(emptyTotals);
  const [discountCfg, setDiscountCfg] = useState<DiscountSettings>({ enabled: false, maxPercent: 0 });
  const [search, setSearch] = useState('');
  const [syncAdminReview, setSyncAdminReview] = useState(0);
  const [syncTransportFailed, setSyncTransportFailed] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef<number | null>(null);
  const [temp, setTemp] = useState<{ barcode?: string; initialName?: string; mode: 'scanned' | 'manual' } | null>(null);
  const { results, settled } = useProductSearch(search);

  const blocking =
    menuOpen ||
    payOpen ||
    upgradeOpen ||
    varianceOpen ||
    complete != null ||
    qtyLine != null ||
    nameLine != null ||
    temp != null;

  const refreshSyncBanners = useCallback(async () => {
    setSyncAdminReview(await syncQueueRepository.countPendingAdminReview());
    setSyncTransportFailed(await syncQueueRepository.countTransportFailures());
  }, []);

  const onPosRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const master = await pullMasterData();
      if (master.outcome === 'failed') {
        showToast('Could not refresh catalog', 'Check your connection and try again.');
      }
      await syncWorker.processQueue();
      await refreshSyncBanners();
      setDiscountCfg(await discountSettings());
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshSyncBanners]);

  useEffect(() => {
    void rehydrateFromDb();
    void refreshSyncBanners();
  }, [rehydrateFromDb, refreshSyncBanners]);

  useEffect(() => {
    let cancelled = false;
    void previewTotals(lines).then((next) => {
      if (!cancelled) setTotals(next);
    });
    return () => {
      cancelled = true;
    };
  }, [lines]);

  const onWedge = useCallback(
    (code: string) => {
      void (async () => {
        const product = await productRepository.findByBarcode(code);
        if (product) {
          addProduct(product);
          return;
        }
        setTemp({ mode: 'scanned', barcode: code });
      })();
    },
    [addProduct],
  );
  useWedgeScanner(!blocking, onWedge);

  const subtotal = lines.reduce((sum, line) => sum + line.product.price * normalizeQty(line.quantity), 0);

  const onSignOut = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      showToast('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const openCheckout = async () => {
    const trial = await trialManager.checkLimit();
    if (trial.trialActive && !trial.allowed) {
      setUpgradeOpen(true);
      return;
    }
    if (!lines.length) {
      showToast('Cart empty', 'Scan or add items before checkout.');
      return;
    }
    setDiscountCfg(await discountSettings());
    setTotals(await previewTotals(lines));
    setPayOpen(true);
  };

  const commitSale = async (paymentMethod: string, stockVarianceByLineKey?: VarianceByLineKey, discountAmount = 0) => {
    if (!user) return;
    setCheckoutLoading(true);
    try {
      const { saleId } = await saleService.completeSale({
        lines,
        paymentMethod,
        staffUserId: user.userId,
        branchId: user.branchId,
        stockVarianceByLineKey,
        discountAmount,
      });
      clearCart();
      setNameLine(null);
      setPayOpen(false);
      setVarianceOpen(false);
      setShortages([]);
      setPendingPayment(null);
      setPendingDiscount(0);
      const saleData = await getSaleWithItems(saleId);
      setComplete({
        saleId,
        receiptLabel: saleData?.sale.receipt_number ?? saleId.slice(0, 8).toUpperCase(),
        totalAmount: Number(saleData?.sale.total_amount ?? 0),
      });
      syncWorker.trigger();
      const after = await trialManager.checkLimit();
      if (after.trialActive && after.remaining === 10) {
        const shown = await prefsRepository.get(prefsRepository.keys.trialWarningShown);
        if (!shown) {
          showToast('Trial', '10 sales remaining on trial. Contact support to upgrade.');
          await prefsRepository.set(prefsRepository.keys.trialWarningShown, true);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'TRIAL_LIMIT') {
        setPayOpen(false);
        setVarianceOpen(false);
        setUpgradeOpen(true);
      } else {
        showToast('Checkout failed', err instanceof Error ? err.message : String(err));
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  const completeWithPayment = async (paymentMethod: string, discountAmount = 0) => {
    const result = await computeStockShortages(lines);
    if (!result.ok) {
      showToast(
        'Product missing locally',
        `${result.productName} isn't in the local catalog yet - re-sync inventory before selling.`,
      );
      return;
    }
    if (result.shortages.length === 0) {
      await commitSale(paymentMethod, undefined, discountAmount);
      return;
    }
    setShortages(result.shortages);
    setPendingPayment(paymentMethod);
    setPendingDiscount(discountAmount);
    setVarianceOpen(true);
  };

  const submitTemporary = async (values: { name: string; price: number }) => {
    try {
      const product = await createTemporaryProduct({
        name: values.name,
        price: values.price,
        barcode: temp?.barcode ?? null,
      });
      addProduct(product);
      setTemp(null);
      setSearch('');
    } catch (err) {
      showToast('Could not add item', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  return (
    <Screen
      layout="pos"
      header={
        <GlassHeader
          title="New Sale"
          trailing={
            <div className="header-tools">
              <button
                type="button"
                className="header-action"
                aria-label="Refresh catalog"
                disabled={refreshing}
                onClick={() => void onPosRefresh()}
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <Link to="/notifications" className="icon-button" aria-label="Notifications">
                <BellIcon />
              </Link>
              <button type="button" className="icon-button" aria-label="Menu" onClick={() => setMenuOpen(true)}>
                <MenuIcon />
              </button>
            </div>
          }
        />
      }
    >
      <section
        className="pane pos-catalog"
        aria-label="Catalog and search"
        onTouchStart={(event) => {
          if (event.currentTarget.scrollTop <= 0) pullStart.current = event.touches[0]?.clientY ?? null;
          else pullStart.current = null;
        }}
        onTouchEnd={(event) => {
          const start = pullStart.current;
          pullStart.current = null;
          if (start == null) return;
          const end = event.changedTouches[0]?.clientY ?? start;
          if (end - start > 72) void onPosRefresh();
        }}
      >
        {syncAdminReview > 0 ? (
          <button type="button" className="sync-banner" onClick={() => navigate('/sync-failures')}>
            {syncAdminReview} sale(s) pending admin review - tap to view
          </button>
        ) : syncTransportFailed > 0 ? (
          <button type="button" className="sync-banner" onClick={() => navigate('/settings')}>
            Sync issue: {syncTransportFailed} item(s) need attention - tap to retry
          </button>
        ) : null}
        <Link to="/scanner" className="pos-card pos-card-primary">
          <span style={text.headline}>Scan barcode</span>
          <span style={text.caption}>Camera - add by barcode</span>
        </Link>
        <div className="pos-two">
          <Link to="/product-search" className="pos-card">
            <span style={text.subheadline}>Search products</span>
            <span style={text.caption}>SKU, name, or barcode</span>
          </Link>
          <Link to="/returns" className="pos-card">
            <span style={text.subheadline}>Returns</span>
            <span style={text.caption}>Search receipt & refund</span>
          </Link>
        </div>
        <Link to="/sales-history" className="pos-card pos-card-row">
          <span style={text.subheadline}>Sales history & filters</span>
        </Link>
        <p className="wedge-hint" style={text.caption}>
          A USB barcode scanner can type into this screen.
        </p>
        <div className="pos-inline-search">
          <TextField
            label="Search"
            value={search}
            placeholder="SKU, name, or barcode"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) {
                event.preventDefault();
                addProduct(results[0]);
                setSearch('');
              }
            }}
          />
          <ProductResultList
            products={results}
            onPick={(product) => {
              addProduct(product);
              setSearch('');
            }}
          />
          {search.trim() && settled && results.length === 0 ? (
            <p className="hint" style={text.caption}>
              No matches. Try a shorter name or the exact SKU/barcode, or add a one-off item below.
            </p>
          ) : null}
          <button
            type="button"
            className="pos-card"
            onClick={() => setTemp({ mode: 'manual', initialName: search.trim() })}
          >
            <span style={text.subheadline}>One-off item</span>
            <span style={text.caption}>Not in catalog - add name & price</span>
          </button>
        </div>
      </section>

      <section className="pane pos-cart" aria-label="Cart and checkout">
        <div className="cart-head">
          <h2 style={text.title2}>Cart</h2>
          {lines.length > 0 ? <span className="cart-count">{lines.length}</span> : null}
        </div>
        {lines.length === 0 ? (
          <div className="cart-empty">
            <p style={text.headline}>No items yet</p>
            <p style={text.caption}>Scan or search to add products</p>
            <Link to="/scanner" className="btn btn-primary cart-scan">
              Scan barcode
            </Link>
          </div>
        ) : (
          <ul className="cart-lines">
            {lines.map((line) => (
              <li key={line.key} className="cart-line">
                <button type="button" className="cart-name" onClick={() => setNameLine(line)}>
                  <span style={text.headline}>{line.product.name}</span>
                  <span style={text.caption}>GHS {Number(line.product.price).toFixed(2)} each</span>
                  <span style={text.subheadline}>
                    GHS {(line.product.price * normalizeQty(line.quantity)).toFixed(2)}
                  </span>
                </button>
                <div className="qty-row">
                  <button type="button" className="qty-btn" aria-label="Decrease quantity" onClick={() => addQty(line.key, -1)}>
                    −
                  </button>
                  <button type="button" className="qty-value" onClick={() => setQtyLine(line)}>
                    {formatQty(line.quantity)}
                  </button>
                  <button type="button" className="qty-btn" aria-label="Increase quantity" onClick={() => addQty(line.key, 1)}>
                    +
                  </button>
                  <button type="button" className="chip" onClick={() => addQty(line.key, QTY_QUARTER)}>
                    ¼
                  </button>
                  <button type="button" className="chip" onClick={() => addQty(line.key, QTY_HALF)}>
                    ½
                  </button>
                  <button type="button" className="qty-btn qty-remove" aria-label="Remove" onClick={() => removeLine(line.key)}>
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="breakdown-row cart-subtotal">
          <span>Subtotal</span>
          <span>GHS {subtotal.toFixed(2)}</span>
        </div>
      </section>

      <button
        type="button"
        className="btn btn-primary complete-sale"
        disabled={!lines.length || checkoutLoading}
        aria-label="Complete sale"
        onClick={() => void openCheckout()}
      >
        Complete sale • GHS {totals.totalAmount.toFixed(2)}
      </button>

      <Sheet open={menuOpen} title="Menu" onClose={() => setMenuOpen(false)}>
        <h2 style={text.title2}>Menu</h2>
        <div className="sheet-actions">
          <Button title="Settings" variant="secondary" onClick={() => navigate('/settings')} />
          <Button title="Printer" variant="secondary" onClick={() => navigate('/printer-settings')} />
          <Button title="Sign out" variant="dangerOutline" onClick={() => void onSignOut()} />
          <Button title="Cancel" variant="ghost" onClick={() => setMenuOpen(false)} />
        </div>
      </Sheet>

      {qtyLine ? <QuantityEditor line={qtyLine} onClose={() => setQtyLine(null)} /> : null}
      {nameLine ? (
        <Sheet open title="Product name" onClose={() => setNameLine(null)} align="center">
          <h2 style={text.title2}>Product name</h2>
          <p style={text.body}>{nameLine.product.name}</p>
          {formatAutoConvertTipFromJson(nameLine.product.auto_convert_json) ? (
            <p className="sheet-copy" style={text.callout}>
              {formatAutoConvertTipFromJson(nameLine.product.auto_convert_json)}
            </p>
          ) : null}
          <p className="hint" style={text.caption}>
            Or tap outside the card
          </p>
          <Button title="Done" variant="secondary" onClick={() => setNameLine(null)} />
        </Sheet>
      ) : null}

      <FinalizeSaleModal
        open={payOpen}
        checkoutLoading={checkoutLoading}
        totals={totals}
        discountSettings={discountCfg}
        onCancel={() => {
          if (!checkoutLoading) setPayOpen(false);
        }}
        onConfirm={(paymentMethod, discountAmount) => void completeWithPayment(paymentMethod, discountAmount)}
      />
      <StockVarianceModal
        open={varianceOpen}
        shortages={shortages}
        submitting={checkoutLoading}
        onCancel={() => {
          if (checkoutLoading) return;
          setVarianceOpen(false);
          setShortages([]);
          setPendingPayment(null);
          setPendingDiscount(0);
        }}
        onConfirm={(variance) => {
          if (!pendingPayment) return;
          void commitSale(pendingPayment, variance, pendingDiscount);
        }}
      />
      <UpgradeModal open={upgradeOpen} onDismiss={() => setUpgradeOpen(false)} />
      <SaleCompleteSheet
        open={complete != null}
        saleId={complete?.saleId ?? ''}
        receiptLabel={complete?.receiptLabel ?? ''}
        totalAmount={complete?.totalAmount ?? 0}
        onDismiss={() => {
          setComplete(null);
          showToast('Sale complete');
        }}
      />
      <TemporaryItemSheet
        open={temp != null}
        mode={temp?.mode ?? 'manual'}
        barcode={temp?.barcode}
        initialName={temp?.initialName ?? ''}
        onCancel={() => setTemp(null)}
        onSubmit={(values) => void submitTemporary(values)}
      />
    </Screen>
  );
}

function QuantityEditor({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const setQty = useCartStore((state) => state.setQty);
  const [draft, setDraft] = useState(formatQty(line.quantity));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const parsed = parseQtyInput(draft);
    if (parsed == null) {
      setError('Enter a valid quantity');
      return;
    }
    setQty(line.key, parsed);
    onClose();
  };

  return (
    <Sheet open title="Quantity" onClose={onClose} align="center">
      <h2 style={text.title2}>Quantity</h2>
      <p style={text.body}>{line.product.name}</p>
      <input
        className="money-input"
        value={draft}
        inputMode="decimal"
        autoFocus
        aria-label="Quantity"
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onFocus={(event) => event.target.select()}
      />
      <div className="chip-row">
        <button type="button" className="chip" onClick={() => setDraft('0.25')}>
          ¼
        </button>
        <button type="button" className="chip" onClick={() => setDraft('0.5')}>
          ½
        </button>
      </div>
      <FeedbackBanner message={error} />
      <div className="sheet-row">
        <Button title="Cancel" variant="secondary" onClick={onClose} />
        <Button title="Set" onClick={apply} />
      </div>
    </Sheet>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="5" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
