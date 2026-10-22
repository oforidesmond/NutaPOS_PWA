import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { showToast } from '@/components/toast';
import { printSaleReceipt, printSaleWithBrowser } from '@/services/printerService';
import { colors, text } from '@/theme';

type Props = {
  open: boolean;
  saleId: string;
  receiptLabel: string;
  totalAmount: number;
  onDismiss: () => void;
};

/** Sale is already saved. Not now does not print and does not undo the sale. */
export function SaleCompleteSheet({ open, saleId, receiptLabel, totalAmount, onDismiss }: Props) {
  const [printing, setPrinting] = useState(false);
  const [offer, setOffer] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPrinting(false);
      setOffer(null);
    }
  }, [open]);

  const onPrint = async () => {
    if (!saleId || printing) return;
    setPrinting(true);
    setOffer(null);
    try {
      const result = await printSaleReceipt(saleId);
      if (result.ok) {
        showToast(result.printedVia === 'browser' ? 'Print sheet opened' : 'Receipt printed', result.message);
      } else {
        setOffer(result.message);
        showToast('Print failed', result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print failed';
      setOffer(message);
      showToast('Print failed', message);
    } finally {
      setPrinting(false);
    }
  };

  const onBrowser = async () => {
    if (!saleId || printing) return;
    setPrinting(true);
    try {
      await printSaleWithBrowser(saleId);
      setOffer(null);
      showToast('Print sheet opened', 'Receipt opened in the browser print sheet.');
    } catch (error) {
      showToast('Print failed', error instanceof Error ? error.message : 'Print failed');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Sheet open={open} title="Sale complete" onClose={onDismiss} dismissible={!printing}>
      <div className="sale-mark" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={colors.success} strokeWidth="1.8" />
          <path d="M8 12.2 10.8 15 16 9.5" stroke={colors.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 style={{ ...text.title2, textAlign: 'center' }}>Sale complete</h2>
      <p className="sale-subtitle" style={text.callout}>
        Would you like to print a receipt for this sale?
      </p>
      <div className="sale-summary">
        <div className="breakdown-row">
          <span style={{ ...text.callout, color: colors.zinc600 }}>Receipt</span>
          <span style={text.headline}>{receiptLabel}</span>
        </div>
        <div className="breakdown-row">
          <span style={{ ...text.callout, color: colors.zinc600 }}>Total</span>
          <span style={text.title2}>GHS {totalAmount.toFixed(2)}</span>
        </div>
      </div>
      <div className="sheet-row">
        <Button title="Not now" variant="secondary" disabled={printing} onClick={onDismiss} />
        <Button title={printing ? 'Printing…' : 'Print receipt'} disabled={printing || !saleId} onClick={() => void onPrint()} />
      </div>
      {offer ? (
        <div className="stack">
          <p className="banner-error" role="alert" style={text.footnote}>
            {offer}
          </p>
          <Button title="Print with browser" variant="secondary" disabled={printing} onClick={() => void onBrowser()} />
        </div>
      ) : null}
      <p className="sale-hint" style={text.footnote}>
        USB, Bluetooth, or the browser print sheet. Skipping print does not undo the sale.
      </p>
    </Sheet>
  );
}
