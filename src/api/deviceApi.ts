import type { AxiosError } from 'axios';
import { api } from '@/api/client';
import { buildApiPath } from '@/lib/env';
import type { DeviceFingerprint } from '@/services/deviceFingerprint';

export type BindDeviceBody = {
  deviceFingerprint: DeviceFingerprint;
  deviceUuid: string;
  fingerprintHash: string;
  timestamp: string;
};

function responseMessage(error: unknown): string | undefined {
  const data = (error as AxiosError<{ message?: unknown }>).response?.data;
  return typeof data?.message === 'string' ? data.message : undefined;
}

export async function bindStaffDevice(body: BindDeviceBody): Promise<{ deviceId?: string } | void> {
  const url = buildApiPath('/auth/staff/bind-device');
  try {
    const { data } = await api.post(url, body);
    return data as { deviceId?: string };
  } catch (e) {
    const err = e as AxiosError;
    const status = err.response?.status;
    const message = responseMessage(e);
    if (status === 400 && (message === 'Malformed body' || message === 'Bad Request')) {
      const flattenedBody = {
        ...body.deviceFingerprint,
        deviceUuid: body.deviceUuid,
        fingerprintHash: body.fingerprintHash,
        timestamp: body.timestamp,
      };
      const { data } = await api.post(url, flattenedBody);
      return data as { deviceId?: string };
    }
    throw e;
  }
}
