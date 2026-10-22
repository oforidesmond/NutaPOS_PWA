import { useSyncExternalStore } from 'react';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import {
  dismissClockWarning,
  getClockWarning,
  subscribeClockWarning,
} from '@/services/timeValidationService';
import { text } from '@/theme';

export function ClockWarningHost() {
  const warning = useSyncExternalStore(subscribeClockWarning, getClockWarning, getClockWarning);
  if (!warning) return null;
  const minutes = Math.abs(warning.offsetMinutes);
  return (
    <Sheet open title="Device Time Incorrect" onClose={dismissClockWarning} align="center">
      <p style={text.body}>
        Your device time is off by {minutes} minutes. Sales timestamps may be inaccurate. Please correct it in
        Settings.
      </p>
      <Button title="Continue Anyway" onClick={dismissClockWarning} />
    </Sheet>
  );
}
