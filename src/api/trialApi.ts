import { api } from '@/api/client';
import { buildApiPath } from '@/lib/env';

export type TrialStatusDto = {
  sales_count?: number;
  salesCount?: number;
  trial_limit?: number;
  trialLimit?: number;
  allowed?: boolean;
};

export async function fetchTrialStatus(): Promise<TrialStatusDto | null> {
  const url = buildApiPath('/staff/trial/status');
  try {
    const { data } = await api.get<TrialStatusDto>(url);
    return data;
  } catch {
    return null;
  }
}
