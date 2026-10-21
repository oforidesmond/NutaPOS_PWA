import { bindStaffDevice } from '@/api/deviceApi';
import { prefsRepository } from '@/db/prefsRepository';
import { assertApiConfigured } from '@/lib/authErrors';
import { buildSaleDeviceInfo } from '@/lib/saleDeviceInfo';
import { buildDeviceFingerprint, hashFingerprintCanonical } from '@/services/deviceFingerprint';

export async function isDeviceBindingCompleted(): Promise<boolean> {
  const value = await prefsRepository.get<unknown>(prefsRepository.keys.deviceBindingCompleted);
  return value === true || value === '1';
}

export async function markDeviceBindingCompleted(): Promise<void> {
  await prefsRepository.set(prefsRepository.keys.deviceBindingCompleted, true);
}

export async function clearDeviceBindingFlag(): Promise<void> {
  await prefsRepository.delete(prefsRepository.keys.deviceBindingCompleted);
}

export async function ensureDeviceBound(): Promise<void> {
  if (await isDeviceBindingCompleted()) return;
  assertApiConfigured();
  const fingerprint = await buildDeviceFingerprint();
  const fingerprintHash = await hashFingerprintCanonical(fingerprint);
  const { deviceUuid } = await buildSaleDeviceInfo();
  const timestamp = new Date().toISOString();
  await bindStaffDevice({
    deviceFingerprint: fingerprint,
    deviceUuid,
    fingerprintHash,
    timestamp,
  });
  await markDeviceBindingCompleted();
}
