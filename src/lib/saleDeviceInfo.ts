import { buildDeviceFingerprint, hashFingerprintCanonical } from '@/services/deviceFingerprint';

export type SaleDeviceInfo = {
  deviceUuid: string;
  model?: string;
  systemVersion?: string;
  appVersion?: string;
  fingerprintHash?: string;
};

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
