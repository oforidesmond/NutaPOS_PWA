import { settingsRepository } from '@/db/settingsRepository';
import { trialRepository } from '@/db/trialRepository';
import type { OrganizationDto } from '@/types/organization';

export type TrialCheckResult = {
  allowed: boolean;
  remaining: number;
  trialActive: boolean;
};

function isTrialPlan(org: OrganizationDto | null): boolean {
  const named = org?.planType ?? org?.plan_type;
  const plan = named?.toUpperCase() ?? 'TRIAL';
  return plan === 'TRIAL';
}

export const trialManager = {
  /**
   * Local trial gate only.
   * `GET /staff/trial/status` runs with master data, not inside checkout.
   */
  async checkLimit(): Promise<TrialCheckResult> {
    const org = await settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
    const trialActive = isTrialPlan(org);
    if (!trialActive) {
      return { allowed: true, remaining: Number.POSITIVE_INFINITY, trialActive: false };
    }

    const row = await trialRepository.get();
    if (!row) {
      return { allowed: true, remaining: 50, trialActive: true };
    }

    const salesCount = row.sales_count;
    const limit = row.trial_limit;
    const remaining = Math.max(0, limit - salesCount);
    const allowed = salesCount < limit;
    return { allowed, remaining, trialActive: true };
  },
};
