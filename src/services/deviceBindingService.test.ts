import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { db } from '@/db/schema';
import * as env from '@/lib/env';
import { ensureDeviceBound, isDeviceBindingCompleted } from '@/services/deviceBindingService';

describe('ensureDeviceBound', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(env, 'getApiBaseUrl').mockReturnValue('https://api.example');
    await db.delete();
    await db.open();
  });

  it.each(['Malformed body', 'Bad Request'])('retries once with a flattened fingerprint on %s', async (message) => {
    const bodies: unknown[] = [];
    vi.spyOn(api, 'post').mockImplementation(async (_url, body) => {
      bodies.push(body);
      if (bodies.length === 1) {
        const error = new AxiosError('bad request');
        error.response = { status: 400, data: { message }, statusText: 'Bad Request', headers: {}, config: {} as never };
        throw error;
      }
      return { data: { deviceId: 'device-1' }, status: 200, statusText: 'OK', headers: {}, config: {} } as never;
    });

    await ensureDeviceBound();

    expect(bodies).toHaveLength(2);
    const nested = bodies[0] as { deviceFingerprint: { installationId: string; model: string }; deviceUuid: string };
    const flat = bodies[1] as Record<string, unknown>;
    expect(nested.deviceUuid).toBe(nested.deviceFingerprint.installationId);
    expect(nested.deviceFingerprint.model).toBe('Web');
    expect(flat.deviceFingerprint).toBeUndefined();
    expect(flat.deviceUuid).toBe(nested.deviceFingerprint.installationId);
    expect(flat.installationId).toBe(nested.deviceFingerprint.installationId);
    expect(flat.model).toBe('Web');
    expect(flat.buildNumber).toBe('pwa');
    expect(flat.appVersion).toBe('2.5.0');
    expect(typeof flat.fingerprintHash).toBe('string');
    expect(await isDeviceBindingCompleted()).toBe(true);

    await ensureDeviceBound();
    expect(bodies).toHaveLength(2);
  });

  it('does not mark the device bound when bind fails', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('nope'));
    await expect(ensureDeviceBound()).rejects.toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
    expect(await isDeviceBindingCompleted()).toBe(false);
  });
});
