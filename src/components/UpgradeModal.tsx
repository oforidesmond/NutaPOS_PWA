import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { text } from '@/theme';

type Props = {
  open: boolean;
  onDismiss: () => void;
};

export function UpgradeModal({ open, onDismiss }: Props) {
  return (
    <Sheet open={open} title="Trial limit reached" onClose={onDismiss} align="center">
      <h2 style={text.title2}>Trial limit reached</h2>
      <p className="sheet-copy" style={text.body}>
        You have reached your 50-sale trial limit on this device. Contact support to upgrade your plan and continue
        recording sales.
      </p>
      <Button title="Dismiss" variant="secondary" onClick={onDismiss} />
    </Sheet>
  );
}
