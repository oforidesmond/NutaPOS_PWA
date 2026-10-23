import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { Sheet } from '@/components/Sheet';
import { useOnline } from '@/components/useOnline';
import type { DiscountSettings } from '@/lib/checkoutSettings';
import { computeDiscountPercent, computeTotalWithDiscount, roundMoney, validateDiscount } from '@/lib/discount';
import type { CheckoutTotalsPreview } from '@/lib/checkoutTotals';
import { text } from '@/theme';

const DENOMS = [10, 20, 50, 100, 200] as const;

type UiPayment = 'cash' | 'momo' | 'card' | 'split';

const UI_TO_BACKEND: Record<UiPayment, string> = {
  cash: 'CASH',
  momo: 'MOBILE_MONEY',
  card: 'CARD',
  split: 'MIXED',
};

const TILES: { key: UiPayment; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'momo', label: 'MoMo' },
  { key: 'card', label: 'Card' },
  { key: 'split', label: 'Split' },
];

function parseAmountInput(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return roundMoney(n);
}

type Props = {
  open: boolean;
  checkoutLoading: boolean;
  totals: CheckoutTotalsPreview;
  discountSettings: DiscountSettings;
  onCancel: () => void;
  onConfirm: (paymentMethod: string, discountAmount: number) => void;
};

export function FinalizeSaleModal({
  open,
  checkoutLoading,
  totals,
  discountSettings: discountCfg,
  onCancel,
  onConfirm,
}: Props) {
  const online = useOnline();
  const [selected, setSelected] = useState<UiPayment>('cash');
  const [cashText, setCashText] = useState('');
  const [discountText, setDiscountText] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected('cash');
    setCashText('');
    setDiscountText('');
    setValidationMessage(null);
  }, [open]);

  const { subtotal, taxAmount } = totals;
  const discountAmount = useMemo(() => parseAmountInput(discountText), [discountText]);
  const safeDiscount = Number.isFinite(discountAmount) && discountAmount > 0 ? discountAmount : 0;
  const totalAmount = useMemo(
    () => computeTotalWithDiscount(subtotal, taxAmount, safeDiscount),
    [subtotal, taxAmount, safeDiscount],
  );
  const discountPercent = safeDiscount > 0 ? computeDiscountPercent(safeDiscount, subtotal) : 0;

  const discountValidation = useMemo(() => {
    if (!Number.isFinite(discountAmount)) {
      return { ok: false as const, message: 'Enter a valid discount amount.' };
    }
    if (totalAmount < 0) {
      return { ok: false as const, message: 'Discount exceeds sale total.' };
    }
    return validateDiscount({
      discountAmount: safeDiscount,
      subtotal,
      maxPercent: discountCfg.maxPercent,
      enabled: discountCfg.enabled,
    });
  }, [discountAmount, safeDiscount, subtotal, totalAmount, discountCfg.maxPercent, discountCfg.enabled]);

  const discountValid = discountValidation.ok;
  const discountOverCap = safeDiscount > 0 && !discountValidation.ok;
  const received = useMemo(() => parseAmountInput(cashText), [cashText]);
  const change = roundMoney(received - totalAmount);
  const cashSufficient =
    selected !== 'cash' || (Number.isFinite(received) && Math.round(received * 100) >= Math.round(totalAmount * 100));
  const canConfirmSale = cashSufficient && discountValid;
  const showOfflineDiscountNote = !online && safeDiscount > 0 && discountCfg.enabled;

  const addDenom = (amount: number) => {
    const base = Number.isFinite(received) ? received : 0;
    setCashText(roundMoney(base + amount).toFixed(2));
  };

  const onConfirmPress = () => {
    if (checkoutLoading) return;
    if (!discountValid) {
      setValidationMessage(
        !Number.isFinite(discountAmount) || !('message' in discountValidation)
          ? 'Enter a valid discount amount.'
          : discountValidation.message,
      );
      return;
    }
    if (!canConfirmSale) {
      setValidationMessage(!Number.isFinite(received) ? 'Enter a valid cash amount.' : 'Cash received is still short.');
      return;
    }
    setValidationMessage(null);
    onConfirm(UI_TO_BACKEND[selected], safeDiscount);
  };

  return (
    <Sheet open={open} title="Finalize Sale" onClose={onCancel} dismissible={!checkoutLoading}>
      <h2 style={text.title2}>Finalize Sale</h2>
      <div className="breakdown">
        <div className="breakdown-row">
          <span>Subtotal</span>
          <span>GHS {subtotal.toFixed(2)}</span>
        </div>
        {safeDiscount > 0 ? (
          <div className="breakdown-row">
            <span>Discount</span>
            <span className="discount-value">−GHS {safeDiscount.toFixed(2)}</span>
          </div>
        ) : null}
        {taxAmount > 0 ? (
          <div className="breakdown-row">
            <span>Tax</span>
            <span>GHS {taxAmount.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="breakdown-row breakdown-total">
          <span>Total due</span>
          <span>GHS {totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {discountCfg.enabled ? (
        <div className="field">
          <div className="section-head">
            <span style={text.footnote}>Discount</span>
            <span style={text.caption}>Max {discountCfg.maxPercent}%</span>
          </div>
          <input
            className={`money-input${discountOverCap || (!Number.isFinite(discountAmount) && discountText.trim() !== '') ? ' money-input-error' : ''}`}
            value={discountText}
            placeholder="0.00"
            inputMode="decimal"
            aria-label="Discount amount in Ghana cedis"
            disabled={checkoutLoading}
            onChange={(event) => {
              setDiscountText(event.target.value);
              if (validationMessage) setValidationMessage(null);
            }}
          />
          {safeDiscount > 0 && Number.isFinite(discountAmount) ? (
            <p className={discountOverCap ? 'field-error' : 'hint'} style={text.caption}>
              {discountOverCap && !discountValidation.ok
                ? discountValidation.message
                : `That's ${discountPercent.toFixed(1)}% of subtotal`}
            </p>
          ) : (
            <p className="hint" style={text.caption}>
              Enter amount in GHS
            </p>
          )}
        </div>
      ) : null}

      <p className="section-label" style={text.footnote}>
        Payment method
      </p>
      <div className="pay-grid" role="group" aria-label="Payment method">
        {TILES.map((tile) => {
          const selectedTile = selected === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              className={`pay-tile${selectedTile ? ' pay-tile-on' : ''}`}
              aria-pressed={selectedTile}
              disabled={checkoutLoading}
              onClick={() => {
                setSelected(tile.key);
                setValidationMessage(null);
              }}
            >
              {tile.label}
            </button>
          );
        })}
      </div>

      {selected === 'cash' ? (
        <div>
          <label className="section-label" style={text.footnote} htmlFor="cash-received">
            Cash received
          </label>
          <input
            id="cash-received"
            className="money-input"
            value={cashText}
            placeholder="0.00"
            inputMode="decimal"
            aria-label="Cash received amount"
            disabled={checkoutLoading}
            onChange={(event) => {
              setCashText(event.target.value);
              if (validationMessage) setValidationMessage(null);
            }}
          />
          <p className="section-label" style={text.footnote}>
            Quick add (GHS)
          </p>
          <div className="chip-row">
            {DENOMS.map((amount) => (
              <button
                key={amount}
                type="button"
                className="chip"
                disabled={checkoutLoading}
                onClick={() => {
                  addDenom(amount);
                  if (validationMessage) setValidationMessage(null);
                }}
              >
                {amount}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="chip chip-exact"
            disabled={checkoutLoading}
            onClick={() => {
              setCashText(roundMoney(totalAmount).toFixed(2));
              if (validationMessage) setValidationMessage(null);
            }}
          >
            Exact amount
          </button>
          <div className="breakdown-row">
            <span>Change to give</span>
            <span className={!Number.isFinite(received) || change < 0 ? 'change-short' : 'change-ok'}>
              GHS {Number.isFinite(received) ? (change < 0 ? '0.00' : change.toFixed(2)) : '-'}
            </span>
          </div>
          {!Number.isFinite(received) ? (
            <p className="field-error" style={text.caption}>
              Enter a valid amount
            </p>
          ) : change < 0 ? (
            <p className="field-error" style={text.caption}>
              Still need GHS {Math.abs(change).toFixed(2)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="sheet-notes">
        {showOfflineDiscountNote ? (
          <FeedbackBanner variant="warning" message="Discount limits are checked again when this sale syncs." />
        ) : null}
        <FeedbackBanner message={validationMessage} />
      </div>
      <div className="sheet-row">
        <Button title="Cancel" variant="secondary" onClick={onCancel} disabled={checkoutLoading} />
        <button
          type="button"
          className={`btn btn-success${canConfirmSale ? '' : ' btn-muted'}`}
          aria-label="Confirm sale"
          aria-busy={checkoutLoading}
          onClick={onConfirmPress}
        >
          Confirm sale
        </button>
      </div>
    </Sheet>
  );
}
