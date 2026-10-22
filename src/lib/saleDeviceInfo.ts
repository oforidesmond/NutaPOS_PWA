import { buildDeviceFingerprint, hashFingerprintCanonical } from '@/services/deviceFingerprint';

export type SaleDeviceInfo = {
  deviceUuid: string;
  model?: string;
  systemVersion?: string;
  appVersion?: string;
  fingerprintHash?: string;
};

/** Keeps an existing deviceUuid. Fills deviceInfo only when it is missing. */
export async function ensureSaleDeviceInfo<T extends { deviceInfo?: SaleDeviceInfo }>(payload: T): Promise<T> {
  const existing = payload.deviceInfo?.deviceUuid?.trim();
  if (existing) return payload;
  const deviceInfo = await buildSaleDeviceInfo();
  return { ...payload, deviceInfo };
}

/** Same device identity sent in `POST /auth/staff/bind-device`. */
export async function buildSaleDeviceInfo(): Promise<SaleDeviceInfo> {
  const fingerprint = await buildDeviceFingerprint();
  const fingerprintHash = await hashFingerprintCanonical(fingerprint);
  return {
    deviceUuid: fingerprint.installationId,
    model: fingerprint.model,
    systemVersion: fingerprint.systemVersion,
    appVersion: fingerprint.appVersion,
    fingerprintHash,
  };
}
