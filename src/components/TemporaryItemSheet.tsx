import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { text } from '@/theme';

export type TemporaryItemSheetMode = 'scanned' | 'manual';

type Props = {
  open: boolean;
  mode: TemporaryItemSheetMode;
  barcode?: string;
  initialName?: string;
  onCancel: () => void;
  onSubmit: (values: { name: string; price: number }) => void;
};

const COPY = {
  scanned: {
    title: 'Unknown barcode',
    hint: 'Add a one-off item for this sale. The owner can add it to inventory later.',
  },
  manual: {
    title: 'One-off item',
    hint: "Sell something that isn't in your catalog yet. The owner can add it to inventory later.",
  },
} as const;

export function TemporaryItemSheet({ open, mode, barcode, initialName = '', onCancel, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const trimmedName = name.trim();
  const trimmedPrice = price.trim();
  const parsedPrice = trimmedPrice === '' ? Number.NaN : Number(trimmedPrice);
  const nameError = submitAttempted && !trimmedName ? 'Name is required.' : undefined;
  const priceError =
    submitAttempted && (!Number.isFinite(parsedPrice) || parsedPrice < 0) ? 'Valid price is required.' : undefined;
  const submittable = trimmedName.length > 0 && Number.isFinite(parsedPrice) && parsedPrice >= 0;
  const copy = COPY[mode];

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setPrice('');
    setError(null);
    setSubmitAttempted(false);
  }, [open, initialName]);

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (!submittable) {
      setError(!trimmedName ? 'Name is required.' : 'Enter a valid price to continue.');
      return;
    }
    setError(null);
    onSubmit({ name: trimmedName, price: parsedPrice });
  };

  return (
    <Sheet open={open} title={copy.title} onClose={onCancel}>
      <h2 style={text.title2}>{copy.title}</h2>
      <p className="sheet-copy" style={text.callout}>
        {copy.hint}
      </p>
      {mode === 'scanned' && barcode ? (
        <p className="sheet-copy" style={text.body}>
          <span style={text.footnote}>Barcode</span>
          <br />
          {barcode}
        </p>
      ) : null}
      <TextField
        label="Name"
        value={name}
        placeholder="Item name"
        autoFocus
        error={nameError}
        onChange={(event) => {
          setName(event.target.value);
          if (error) setError(null);
        }}
      />
      <TextField
        label="Price"
        value={price}
        placeholder="0.00"
        inputMode="decimal"
        error={priceError}
        onChange={(event) => {
          setPrice(event.target.value);
          if (error) setError(null);
        }}
      />
      <FeedbackBanner message={error} />
      <div className="sheet-actions">
        <Button title="Add to cart" onClick={handleSubmit} disabled={!submittable} />
        <Button title="Cancel" variant="ghost" onClick={onCancel} />
      </div>
    </Sheet>
  );
}
