import axios from 'axios';
import { api } from '@/api/client';
import { buildApiPath, buildRootPath } from '@/lib/env';

export async function getServerTime(): Promise<string | null> {
  const url = buildRootPath('/time');
  try {
    const { data } = await api.get<{ timestamp?: string }>(url);
    const timestamp = data?.timestamp;
    if (timestamp) return timestamp;
  } catch {
    // Fall through to the public request.
  }
  try {
    const { data } = await axios.get<{ timestamp?: string }>(url, { timeout: 15_000 });
    return data?.timestamp ?? null;
  } catch {
    return null;
  }
}

export type TimeWarningPayload = {
  staff_id: string;
  device_time: string;
  offset_minutes: number;
  device_model: string;
};

export async function postTimeWarning(body: TimeWarningPayload): Promise<void> {
  await api.post(buildApiPath('/staff/time-warning'), body);
}
