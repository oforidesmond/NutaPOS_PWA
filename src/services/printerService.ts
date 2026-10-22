import { prefsRepository, type DefaultPrinter } from '@/db/prefsRepository';
import { receiptToEscPos, receiptToPrintDocument } from '@/lib/escpos';
import { buildTestThermalReceipt, buildThermalReceipt } from '@/lib/receiptLayout';

export type { DefaultPrinter };

export type PrintResult = {
  ok: boolean;
  message: string;
  offerBrowser: boolean;
  printedVia?: 'usb' | 'ble' | 'browser';
};

const BROWSER_ID = 'browser';

const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
];

function pathError(label: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  if (!detail || detail === label || detail.startsWith(`${label}.`)) return new Error(detail || label);
  return new Error(`${label}. ${detail}`);
}

function usbApi(): USB | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.usb ?? null;
}

function bluetoothApi(): Bluetooth | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.bluetooth ?? null;
}

export function usbSupported(): boolean {
  return usbApi()?.requestDevice != null;
}

export function bluetoothSupported(): boolean {
  return bluetoothApi()?.requestDevice != null;
}

function isPrinter(value: unknown): value is DefaultPrinter {
  if (!value || typeof value !== 'object') return false;
  const row = value as DefaultPrinter;
  return (
    (row.transport === 'usb' || row.transport === 'ble' || row.transport === 'browser') &&
    typeof row.id === 'string' &&
    row.id.length > 0
  );
}

export async function getSavedPrinter(): Promise<DefaultPrinter | null> {
  const value = await prefsRepository.get<unknown>(prefsRepository.keys.defaultPrinter);
  return isPrinter(value) ? { transport: value.transport, id: value.id } : null;
}

async function remember(printer: DefaultPrinter): Promise<void> {
  await prefsRepository.set(prefsRepository.keys.defaultPrinter, printer);
}

export function describePrinter(printer: DefaultPrinter | null): string {
  if (!printer) return 'No default printer';
  if (printer.transport === 'usb') return `USB ${printer.id}`;
  if (printer.transport === 'ble') return `Bluetooth ${printer.id}`;
  return 'Browser printing';
}

function usbDeviceId(device: USBDevice): string {
  const serial = device.serialNumber?.trim();
  if (serial) return serial;
  return `${device.vendorId}:${device.productId}`;
}

function usbMatches(device: USBDevice, id: string): boolean {
  if (device.serialNumber && device.serialNumber === id) return true;
  return `${device.vendorId}:${device.productId}` === id;
}

function findBulkOut(device: USBDevice): { interfaceNumber: number; alternateSetting: number; endpointNumber: number } | null {
  const config = device.configuration ?? device.configurations[0];
  if (!config) return null;
  for (const iface of config.interfaces) {
    for (const alt of iface.alternates) {
      for (const endpoint of alt.endpoints) {
        if (endpoint.direction === 'out' && endpoint.type === 'bulk') {
          return {
            interfaceNumber: iface.interfaceNumber,
            alternateSetting: alt.alternateSetting,
            endpointNumber: endpoint.endpointNumber,
          };
        }
      }
    }
  }
  return null;
}

async function printUsbBytes(device: USBDevice, payload: Uint8Array): Promise<void> {
  try {
    if (!device.opened) await device.open();
    if (device.configuration == null && device.configurations[0]) {
      await device.selectConfiguration(device.configurations[0].configurationValue);
    }
    const out = findBulkOut(device);
    if (!out) throw new Error('no bulk OUT endpoint');
    const current = device.configuration?.interfaces.find((iface) => iface.interfaceNumber === out.interfaceNumber);
    if (current && current.alternate.alternateSetting !== out.alternateSetting) {
      await device.selectAlternateInterface(out.interfaceNumber, out.alternateSetting);
    }
    await device.claimInterface(out.interfaceNumber);
    try {
      const chunk = 64;
      for (let offset = 0; offset < payload.length; offset += chunk) {
        const result = await device.transferOut(out.endpointNumber, payload.subarray(offset, offset + chunk));
        if (result.status !== 'ok') throw new Error(result.status || 'transfer failed');
      }
    } finally {
      await device.releaseInterface(out.interfaceNumber).catch(() => undefined);
    }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'SecurityError' || name === 'NotAllowedError') throw pathError('USB permission', error);
    throw pathError('USB connect error', error);
  } finally {
    if (device.opened) await device.close().catch(() => undefined);
  }
}

async function writableCharacteristic(
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic | null> {
  const services = await server.getPrimaryServices().catch(() => [] as BluetoothRemoteGATTService[]);
  for (const service of services) {
    const characteristics = await service.getCharacteristics().catch(() => [] as BluetoothRemoteGATTCharacteristic[]);
    const match = characteristics.find((item) => item.properties.writeWithoutResponse || item.properties.write);
    if (match) return match;
  }
  return null;
}

async function printBleBytes(device: BluetoothDevice, payload: Uint8Array): Promise<void> {
  try {
    const server = device.gatt ? await device.gatt.connect() : null;
    if (!server) throw new Error('could not connect');
    const characteristic = await writableCharacteristic(server);
    if (!characteristic) throw new Error('no writable characteristic');
    const chunk = 20;
    for (let offset = 0; offset < payload.length; offset += chunk) {
      const slice = payload.subarray(offset, offset + chunk);
      if (characteristic.properties.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(slice);
      } else {
        await characteristic.writeValue(slice);
      }
    }
    device.gatt?.disconnect();
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotFoundError' || name === 'NotSupportedError' || name === 'SecurityError') {
      throw pathError('Bluetooth unavailable', error);
    }
    throw pathError('Bluetooth connect error', error);
  }
}

/** Receipt-only document. Tags are rendered; the 32-column lines are not reflowed. */
export function openBrowserPrint(tagged: string): void {
  if (typeof document === 'undefined') throw new Error('Browser print is unavailable');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Receipt');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    throw new Error('Browser print is unavailable');
  }
  doc.open();
  doc.write(receiptToPrintDocument(tagged));
  doc.close();
  win.addEventListener('afterprint', () => window.setTimeout(() => iframe.remove(), 500), { once: true });
  win.focus();
  win.print();
}

async function listUsb(): Promise<USBDevice[]> {
  const usb = usbApi();
  if (!usb?.getDevices) return [];
  return usb.getDevices().catch(() => []);
}

async function listBle(): Promise<BluetoothDevice[]> {
  const bluetooth = bluetoothApi();
  if (!bluetooth?.getDevices) return [];
  return bluetooth.getDevices().catch(() => []);
}

function failure(error: unknown, fallback: string): PrintResult {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallback,
    offerBrowser: true,
  };
}

/**
 * Saved default first, when that API still exists and the device is still permitted.
 * Then an already permitted USB device, then Bluetooth, then the browser sheet.
 * `requestDevice` is not called here — choosing a printer is a settings action.
 */
export async function printTaggedReceipt(tagged: string): Promise<PrintResult> {
  const bytes = receiptToEscPos(tagged);
  const saved = await getSavedPrinter();

  if (saved?.transport === 'browser') {
    openBrowserPrint(tagged);
    return {
      ok: true,
      message: 'Receipt opened in the browser print sheet.',
      offerBrowser: false,
      printedVia: 'browser',
    };
  }

  if (saved?.transport === 'usb' && usbApi()) {
    const devices = await listUsb();
    const device = devices.find((item) => usbMatches(item, saved.id));
    if (device) {
      try {
        await printUsbBytes(device, bytes);
        await remember(saved);
        return {
          ok: true,
          message: 'Receipt sent to the thermal printer (USB).',
          offerBrowser: false,
          printedVia: 'usb',
        };
      } catch (error) {
        return failure(error, 'USB connect error');
      }
    }
  }

  if (saved?.transport === 'ble' && bluetoothApi()) {
    const devices = await listBle();
    const device = devices.find((item) => item.id === saved.id);
    if (device) {
      try {
        await printBleBytes(device, bytes);
        await remember(saved);
        return {
          ok: true,
          message: 'Receipt sent to the thermal printer (Bluetooth).',
          offerBrowser: false,
          printedVia: 'ble',
        };
      } catch (error) {
        return failure(error, 'Bluetooth connect error');
      }
    }
  }

  const usbDevices = await listUsb();
  const nextUsb = usbDevices.find((device) => saved?.transport !== 'usb' || !usbMatches(device, saved.id));
  if (nextUsb) {
    try {
      await printUsbBytes(nextUsb, bytes);
      await remember({ transport: 'usb', id: usbDeviceId(nextUsb) });
      return {
        ok: true,
        message: 'Receipt sent to the thermal printer (USB).',
        offerBrowser: false,
        printedVia: 'usb',
      };
    } catch (error) {
      return failure(error, 'USB connect error');
    }
  }

  const bleDevices = await listBle();
  const nextBle = bleDevices.find((device) => saved?.transport !== 'ble' || device.id !== saved.id);
  if (nextBle) {
    try {
      await printBleBytes(nextBle, bytes);
      await remember({ transport: 'ble', id: nextBle.id });
      return {
        ok: true,
        message: 'Receipt sent to the thermal printer (Bluetooth).',
        offerBrowser: false,
        printedVia: 'ble',
      };
    } catch (error) {
      return failure(error, 'Bluetooth connect error');
    }
  }

  openBrowserPrint(tagged);
  return {
    ok: true,
    message: 'Receipt opened in the browser print sheet.',
    offerBrowser: false,
    printedVia: 'browser',
  };
}

export async function printSaleReceipt(saleId: string): Promise<PrintResult> {
  return printTaggedReceipt(await buildThermalReceipt(saleId));
}

export async function testPrint(): Promise<PrintResult> {
  return printTaggedReceipt(await buildTestThermalReceipt());
}

export async function printSaleWithBrowser(saleId: string): Promise<void> {
  openBrowserPrint(await buildThermalReceipt(saleId));
}

export async function printTestWithBrowser(): Promise<void> {
  openBrowserPrint(await buildTestThermalReceipt());
}

/** User gesture. Opens the WebUSB picker and stores vendor/product or the serial. */
export async function chooseUsbPrinter(): Promise<DefaultPrinter> {
  const usb = usbApi();
  if (!usb?.requestDevice) throw new Error('USB permission. This browser does not expose WebUSB.');
  try {
    const device = await usb.requestDevice({ filters: [] });
    const printer: DefaultPrinter = { transport: 'usb', id: usbDeviceId(device) };
    await remember(printer);
    return printer;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotFoundError' || name === 'SecurityError' || name === 'NotAllowedError') {
      throw pathError('USB permission', error);
    }
    throw pathError('USB connect error', error);
  }
}

/** User gesture. Opens the Web Bluetooth picker and stores the device id. */
export async function chooseBluetoothPrinter(): Promise<DefaultPrinter> {
  const bluetooth = bluetoothApi();
  if (!bluetooth?.requestDevice) throw new Error('Bluetooth unavailable. This browser does not expose Web Bluetooth.');
  try {
    const device = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICES,
    });
    const printer: DefaultPrinter = { transport: 'ble', id: device.id };
    await remember(printer);
    return printer;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotFoundError' || name === 'NotSupportedError' || name === 'SecurityError' || name === 'NotAllowedError') {
      throw pathError('Bluetooth unavailable', error);
    }
    throw pathError('Bluetooth connect error', error);
  }
}

export async function useBrowserPrinting(): Promise<DefaultPrinter> {
  const printer: DefaultPrinter = { transport: 'browser', id: BROWSER_ID };
  await remember(printer);
  return printer;
}

export const printerService = {
  usbSupported,
  bluetoothSupported,
  getSavedPrinter,
  describePrinter,
  printTaggedReceipt,
  printSaleReceipt,
  testPrint,
  printSaleWithBrowser,
  printTestWithBrowser,
  chooseUsbPrinter,
  chooseBluetoothPrinter,
  useBrowserPrinting,
};
