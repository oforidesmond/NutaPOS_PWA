import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { text } from '@/theme';

type Props = {
  open: boolean;
  receiptLabel: string;
  totalAmount: number;
  onDismiss: () => void;
};

/** Phase 3 sheet. Print receipt is added in Phase 4. */
export function SaleCompleteSheet({ open, receiptLabel, totalAmount, onDismiss }: Props) {
  return (
    <Sheet open={open} title="Sale complete" onClose={onDismiss}>
      <h2 style={text.title2}>Sale complete</h2>
      <div className="breakdown">
        <div className="breakdown-row">
          <span>Receipt</span>
          <span>{receiptLabel}</span>
        </div>
        <div className="breakdown-row breakdown-total">
          <span>Total</span>
          <span>GHS {totalAmount.toFixed(2)}</span>
        </div>
      </div>
      <Button title="Not now" variant="secondary" onClick={onDismiss} />
    </Sheet>
  );
}
