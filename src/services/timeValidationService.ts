import { getServerTime, postTimeWarning } from '@/api/timeApi';
import { prefsRepository } from '@/db/prefsRepository';

export const CLOCK_SKEW_THRESHOLD_MIN = 5;

export type ClockWarning = { offsetMinutes: number };

let current: ClockWarning | null = null;
const listeners = new Set<() => void>();

export function clockOffsetMinutes(deviceNowMs: number, serverIso: string): number {
  return Math.round((deviceNowMs - new Date(serverIso).getTime()) / 60000);
}

export function isClockSkewed(offsetMinutes: number): boolean {
  return Math.abs(offsetMinutes) > CLOCK_SKEW_THRESHOLD_MIN;
}

export function subscribeClockWarning(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getClockWarning(): ClockWarning | null {
  return current;
}

export function dismissClockWarning(): void {
  current = null;
  for (const listener of listeners) listener();
}

function publishClockWarning(offsetMinutes: number): void {
  current = { offsetMinutes };
  for (const listener of listeners) listener();
}

/**
 * Warn-only. Never blocks sales.
 * The mobile app opens system settings from "Fix Now". Browsers cannot, so the sheet only continues.
 * Callers pass `user.userId`, matching the mobile checkout and splash call sites.
 */
export async function warnDeviceTimeIfNeeded(staffId: string | undefined): Promise<void> {
  const server = await getServerTime();
  if (!server) return;
  const offsetMinutes = clockOffsetMinutes(Date.now(), server);
  if (!isClockSkewed(offsetMinutes)) return;

  if (staffId) {
    void postTimeWarning({
      staff_id: staffId,
      device_time: new Date().toISOString(),
      offset_minutes: offsetMinutes,
      device_model: typeof navigator === 'undefined' ? 'unknown' : 'Web',
    }).catch(() => {
      // A failed warning post must not block checkout.
    });
  }

  publishClockWarning(offsetMinutes);
}

/** Extra check once per UTC day. The immediate check still runs on its own. */
export async function maybeDailyMidnightCheck(staffId: string | undefined): Promise<void> {
  const now = new Date().toISOString().slice(0, 10);
  const last = await prefsRepository.get<string>(prefsRepository.keys.lastTimeCheck);
  if (last === now) return;
  await prefsRepository.set(prefsRepository.keys.lastTimeCheck, now);
  if (staffId) await warnDeviceTimeIfNeeded(staffId);
}
