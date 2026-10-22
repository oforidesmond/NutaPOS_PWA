import { useEffect, useMemo, useState } from 'react';
import type { StaffSalePayload } from '@/api/salesApi';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { Sheet } from '@/components/Sheet';
import type { DiscountSettings } from '@/lib/checkoutSettings';
import {
  computeDiscountPercent,
  computeTotalWithDiscount,
  maxDiscountAmount,
  roundMoney,
  validateDiscount,
} from '@/lib/discount';
import { text } from '@/theme';

type Props = {
  open: boolean;
  body: StaffSalePayload | null;
  discountCfg: DiscountSettings;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (discountAmount: number) => void;
};

function parseAmountInput(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return roundMoney(n);
}

export function EditDiscountSheet({ open, body, discountCfg, submitting = false, onCancel, onConfirm }: Props) {
  const [discountText, setDiscountText] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !body) return;
    setDiscountText(body.discountAmount > 0 ? body.discountAmount.toFixed(2) : '');
    setValidationMessage(null);
  }, [open, body]);

  const subtotal = body?.subtotal ?? 0;
  const taxAmount = body?.taxAmount ?? 0;
  const discountAmount = useMemo(() => parseAmountInput(discountText), [discountText]);
  const safeDiscount = Number.isFinite(discountAmount) && discountAmount > 0 ? discountAmount : 0;
  const totalAmount = computeTotalWithDiscount(subtotal, taxAmount, safeDiscount);
  const discountPercent = safeDiscount > 0 ? computeDiscountPercent(safeDiscount, subtotal) : 0;
  const cap = maxDiscountAmount(subtotal, discountCfg.maxPercent);

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

  const confirm = () => {
    if (submitting) return;
    if (!discountValidation.ok) {
      setValidationMessage(discountValidation.message);
      return;
    }
    onConfirm(safeDiscount);
  };

  const receipt = body ? String(body.receiptNumber ?? body.receipt_number ?? body.id.slice(0, 8)) : '';

  return (
    <Sheet open={open} title="Edit discount" onClose={onCancel} dismissible={!submitting}>
      <h2 style={text.title2}>Edit discount</h2>
      <p className="sheet-copy" style={text.callout}>
        {receipt} · cap {discountCfg.enabled ? `GHS ${cap.toFixed(2)}` : 'discounts off'}
      </p>
      <FeedbackBanner message={validationMessage} />
      <label className="field">
        <span className="field-label" style={text.footnote}>
          Discount amount
        </span>
        <input
          className="field-input money-input"
          inputMode="decimal"
          value={discountText}
          disabled={submitting}
          onChange={(event) => {
            setDiscountText(event.target.value);
            if (validationMessage) setValidationMessage(null);
          }}
        />
      </label>
      <p style={text.callout}>
        {discountPercent.toFixed(2)}% · new total GHS {totalAmount.toFixed(2)}
      </p>
      <div className="sheet-row">
        <Button title="Cancel" variant="secondary" onClick={onCancel} disabled={submitting} />
        <Button title={submitting ? 'Saving…' : 'Save and resend'} onClick={confirm} disabled={submitting} />
      </div>
    </Sheet>
  );
}
