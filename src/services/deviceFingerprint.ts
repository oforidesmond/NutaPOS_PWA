import { prefsRepository } from '@/db/prefsRepository';

export const APP_VERSION = '2.5.0';

export type DeviceFingerprint = {
  installationId: string;
  deviceId: string;
  model: string;
  systemVersion: string;
  buildNumber: string;
  appVersion: string;
};

export async function getOrCreateInstallationId(): Promise<string> {
  const existing = await prefsRepository.get<string>(prefsRepository.keys.installationId);
  if (typeof existing === 'string' && existing.trim()) return existing;
  const id = crypto.randomUUID();
  await prefsRepository.set(prefsRepository.keys.installationId, id);
  return id;
}

/** Stable browser-profile fingerprint. `deviceId` and `deviceUuid` are the installation id. */
export async function buildDeviceFingerprint(): Promise<DeviceFingerprint> {
  const installationId = await getOrCreateInstallationId();
  return {
    installationId,
    deviceId: installationId,
    model: 'Web',
    systemVersion: readSystemVersion(),
    buildNumber: 'pwa',
    appVersion: APP_VERSION,
  };
}

export function readSystemVersion(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const platform = navigator.platform?.trim();
  if (platform) return platform;
  const ua = navigator.userAgent ?? '';
  const match = ua.match(/\(([^)]+)\)/);
  return match?.[1]?.trim() || 'unknown';
}

/**
 * SHA-256 hex of `JSON.stringify(deviceFingerprint)` with this key order:
 * installationId, deviceId, model, systemVersion, buildNumber, appVersion.
 */
export async function hashFingerprintCanonical(fp: DeviceFingerprint): Promise<string> {
  const canonical = JSON.stringify(fp);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
