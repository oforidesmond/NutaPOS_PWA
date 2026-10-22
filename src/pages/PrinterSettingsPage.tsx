import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { showToast } from '@/components/toast';
import {
  bluetoothSupported,
  chooseBluetoothPrinter,
  chooseUsbPrinter,
  describePrinter,
  getSavedPrinter,
  printTestWithBrowser,
  testPrint,
  usbSupported,
  useBrowserPrinting,
  type DefaultPrinter,
} from '@/services/printerService';
import { text } from '@/theme';

type Busy = 'usb' | 'ble' | 'browser' | 'test';

function printerCaption(printer: DefaultPrinter): string {
  if (printer.transport === 'usb') return 'USB thermal printer';
  if (printer.transport === 'ble') return 'Bluetooth thermal printer';
  return 'System print dialog';
}

export function PrinterSettingsPage() {
  const [saved, setSaved] = useState<DefaultPrinter | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [offer, setOffer] = useState<string | null>(null);

  useEffect(() => {
    void getSavedPrinter().then(setSaved);
  }, []);

  const run = async (kind: Busy, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const chooseUsb = () =>
    void run('usb', async () => {
      if (!usbSupported()) {
        showToast('USB permission', 'This browser does not expose WebUSB.');
        return;
      }
      try {
        const printer = await chooseUsbPrinter();
        setSaved(printer);
        setOffer(null);
        showToast('Default printer updated', describePrinter(printer));
      } catch (error) {
        showToast('USB permission', error instanceof Error ? error.message : 'USB permission');
      }
    });

  const chooseBluetooth = () =>
    void run('ble', async () => {
      if (!bluetoothSupported()) {
        showToast('Bluetooth unavailable', 'This browser does not expose Web Bluetooth.');
        return;
      }
      try {
        const printer = await chooseBluetoothPrinter();
        setSaved(printer);
        setOffer(null);
        showToast('Default printer updated', describePrinter(printer));
      } catch (error) {
        showToast('Bluetooth unavailable', error instanceof Error ? error.message : 'Bluetooth unavailable');
      }
    });

  const chooseBrowser = () =>
    void run('browser', async () => {
      const printer = await useBrowserPrinting();
      setSaved(printer);
      setOffer(null);
      showToast('Default printer updated', describePrinter(printer));
    });

  const onTest = () =>
    void run('test', async () => {
      setOffer(null);
      try {
        const result = await testPrint();
        if (result.ok) {
          showToast('Test print sent', result.message);
          setSaved(await getSavedPrinter());
          return;
        }
        setOffer(result.message);
        showToast('Print failed', result.message);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Print failed';
        setOffer(message);
        showToast('Print failed', message);
      }
    });

  const onBrowser = () =>
    void run('test', async () => {
      try {
        await printTestWithBrowser();
        setOffer(null);
        showToast('Print sheet opened', 'Test print opened in the browser print sheet.');
      } catch (error) {
        showToast('Print failed', error instanceof Error ? error.message : 'Print failed');
      }
    });

  const locked = busy !== null;

  return (
    <Screen header={<GlassHeader title="Printer" backTo="/pos" />}>
      <div className="stack">
        <p style={text.callout}>
          Choose a USB or Bluetooth thermal printer, or use the browser print sheet. Nothing connects until you tap a
          button.
        </p>
        <div className="printer-card">
          <div className="history-top">
            <p style={text.headline}>{saved ? describePrinter(saved) : 'No default printer'}</p>
            {saved ? <span className="badge">Default</span> : null}
          </div>
          <p style={text.caption}>{saved ? printerCaption(saved) : 'No printer saved on this browser'}</p>
        </div>
        <div className="stack">
          <Button title={busy === 'usb' ? 'Working…' : 'Choose USB'} variant="secondary" disabled={locked} onClick={chooseUsb} />
          <Button
            title={busy === 'ble' ? 'Working…' : 'Choose Bluetooth'}
            variant="secondary"
            disabled={locked}
            onClick={chooseBluetooth}
          />
          <Button
            title={busy === 'browser' ? 'Working…' : 'Use browser printing'}
            variant="secondary"
            disabled={locked}
            onClick={chooseBrowser}
          />
          <Button title={busy === 'test' ? 'Working…' : 'Test print'} disabled={locked} onClick={onTest} />
          {offer ? (
            <>
              <p className="banner-error" role="alert" style={text.footnote}>
                {offer}
              </p>
              <Button title="Print with browser" variant="secondary" disabled={locked} onClick={onBrowser} />
            </>
          ) : null}
        </div>
        <p className="printer-note" style={text.footnote}>
          Characters outside ASCII are replaced with ? on USB and Bluetooth. The browser sheet keeps them. There is no
          80mm mode and no network printer.
        </p>
      </div>
    </Screen>
  );
}
