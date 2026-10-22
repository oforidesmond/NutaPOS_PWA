/** Subset of WebUSB and Web Bluetooth used by the thermal printer. Not in this project's DOM lib. */

interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
  serialNumber?: string;
}

interface USBDeviceRequestOptions {
  filters: USBDeviceFilter[];
}

interface USBEndpoint {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
}

interface USBAlternateInterface {
  alternateSetting: number;
  endpoints: USBEndpoint[];
}

interface USBInterface {
  interfaceNumber: number;
  alternate: USBAlternateInterface;
  alternates: USBAlternateInterface[];
}

interface USBConfiguration {
  configurationValue: number;
  interfaces: USBInterface[];
}

interface USBOutTransferResult {
  bytesWritten: number;
  status: 'ok' | 'stall' | 'babble';
}

interface USBDevice {
  vendorId: number;
  productId: number;
  serialNumber?: string;
  opened: boolean;
  configuration: USBConfiguration | null;
  configurations: USBConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array<ArrayBufferLike>): Promise<USBOutTransferResult>;
}

interface USB {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>;
}

interface BluetoothCharacteristicProperties {
  write: boolean;
  writeWithoutResponse: boolean;
}

interface BluetoothRemoteGATTCharacteristic {
  properties: BluetoothCharacteristicProperties;
  writeValue(value: Uint8Array<ArrayBufferLike>): Promise<void>;
  writeValueWithoutResponse(value: Uint8Array<ArrayBufferLike>): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRequestDeviceOptions {
  acceptAllDevices?: boolean;
  optionalServices?: string[];
}

interface Bluetooth {
  getDevices(): Promise<BluetoothDevice[]>;
  requestDevice(options: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  readonly usb?: USB;
  readonly bluetooth?: Bluetooth;
}
