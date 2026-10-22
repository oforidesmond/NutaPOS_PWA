import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { Sheet } from '@/components/Sheet';
import { formatQty } from '@/lib/quantity';
import type { StockShortage } from '@/services/stockVarianceService';
import { text } from '@/theme';
import {
  VARIANCE_REASONS,
  VARIANCE_REASON_LABELS,
  varianceDraftMessage,
  type LineVariance,
  type VarianceByLineKey,
  type VarianceDraftEntry,
  type VarianceReason,
} from '@/types/stockVariance';

type Props = {
  open: boolean;
  shortages: StockShortage[];
  initialValues?: VarianceByLineKey;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (variance: VarianceByLineKey) => void;
};

function buildDraft(shortages: StockShortage[], initial?: VarianceByLineKey): Record<string, VarianceDraftEntry> {
  const draft: Record<string, VarianceDraftEntry> = {};
  for (const shortage of shortages) {
    const seeded = initial?.[shortage.key];
    draft[shortage.key] = {
      reason: seeded?.varianceReason ?? null,
      note: seeded?.varianceNote ?? '',
    };
  }
  return draft;
}

export function StockVarianceModal({
  open,
  shortages,
  initialValues,
  submitting = false,
  onCancel,
  onConfirm,
}: Props) {
  const [draft, setDraft] = useState<Record<string, VarianceDraftEntry>>({});
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(buildDraft(shortages, initialValues));
    setValidationMessage(null);
  }, [open, shortages, initialValues]);

  const confirm = () => {
    if (submitting) return;
    const firstInvalid = shortages.find((shortage) => varianceDraftMessage(shortage.product.name, draft[shortage.key]));
    if (firstInvalid) {
      setValidationMessage(varianceDraftMessage(firstInvalid.product.name, draft[firstInvalid.key]));
      return;
    }
    const out: VarianceByLineKey = {};
    for (const shortage of shortages) {
      const entry = draft[shortage.key];
      if (!entry?.reason) continue;
      const trimmedNote = entry.note.trim();
      const value: LineVariance = { varianceReason: entry.reason };
      if (trimmedNote.length > 0) value.varianceNote = trimmedNote;
      out[shortage.key] = value;
    }
    onConfirm(out);
  };

  return (
    <Sheet open={open} title="Insufficient system stock" onClose={onCancel} dismissible={!submitting}>
      <h2 style={text.title2}>Insufficient system stock</h2>
      <p className="sheet-copy" style={text.callout}>
        Confirm a reason for each item being sold past current system stock. Your owner will see this in the product
        activity review.
      </p>
      <FeedbackBanner variant="warning" message={validationMessage} />
      {shortages.map((shortage) => {
        const entry = draft[shortage.key];
        const noteRequired = entry?.reason === 'OTHER';
        const showNoteError = noteRequired && (entry?.note ?? '').trim().length === 0;
        return (
          <section key={shortage.key} className="variance-card">
            <p style={text.headline}>{shortage.product.name}</p>
            {shortage.product.sku ? (
              <p style={text.caption}>SKU {shortage.product.sku}</p>
            ) : null}
            <div className="qty-compare">
              <div>
                <p style={text.caption}>Selling</p>
                <p style={text.headline}>{formatQty(shortage.orderedQty)}</p>
              </div>
              <div>
                <p style={text.caption}>System has</p>
                <p className="change-short" style={text.headline}>
                  {formatQty(shortage.availableQty)}
                </p>
              </div>
            </div>
            <p className="section-label" style={text.footnote}>
              Reason
            </p>
            <div className="reason-list">
              {VARIANCE_REASONS.map((reason) => {
                const selected = entry?.reason === reason;
                return (
                  <label key={reason} className={`reason-row${selected ? ' reason-row-on' : ''}`}>
                    <input
                      type="radio"
                      name={`variance-${shortage.key}`}
                      checked={selected}
                      disabled={submitting}
                      onChange={() => {
                        setDraft((prev) => ({
                          ...prev,
                          [shortage.key]: { ...(prev[shortage.key] ?? { note: '' }), reason: reason as VarianceReason },
                        }));
                        if (validationMessage) setValidationMessage(null);
                      }}
                    />
                    <span>{VARIANCE_REASON_LABELS[reason]}</span>
                  </label>
                );
              })}
            </div>
            {entry?.reason ? (
              <label className="field">
                <span className="field-label" style={text.footnote}>
                  Note {noteRequired ? '*' : '(optional)'}
                </span>
                <textarea
                  className={`note-input${showNoteError ? ' money-input-error' : ''}`}
                  value={entry.note}
                  disabled={submitting}
                  placeholder={
                    noteRequired ? 'Describe what happened (required)' : 'Add context for the owner (optional)'
                  }
                  onChange={(event) => {
                    const note = event.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      [shortage.key]: { ...(prev[shortage.key] ?? { reason: null }), note },
                    }));
                    if (validationMessage) setValidationMessage(null);
                  }}
                />
                {showNoteError ? (
                  <p className="field-error" style={text.caption}>
                    A note is required when reason is “Other”.
                  </p>
                ) : null}
              </label>
            ) : null}
          </section>
        );
      })}
      <div className="sheet-row">
        <Button title="Cancel" variant="secondary" onClick={onCancel} disabled={submitting} />
        <button type="button" className="btn btn-primary" aria-label="Confirm and complete sale" onClick={confirm}>
          Confirm
        </button>
      </div>
    </Sheet>
  );
}
