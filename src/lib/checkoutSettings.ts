import { settingsRepository } from '@/db/settingsRepository';
import type { OrganizationDto } from '@/types/organization';

export type DiscountSettings = {
  maxPercent: number;
  enabled: boolean;
};

function orgSettings(): Promise<OrganizationDto | null> {
  return settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
}

/**
 * Tax rate and enabled flag.
 * The initial-pull path stores camelCase. The fallback tax GET stores the raw
 * payload, which may be snake_case. Organization fields are camelCase after normalizeOrg.
 * The mobile reader only checks camelCase on the tax blob.
 */
export async function taxSettings(): Promise<{ rate: number; enabled: boolean }> {
  const raw = await settingsRepository.getJson<Record<string, unknown>>(settingsRepository.keys.taxSettings);
  const org = await orgSettings();
  const rate = Number(raw?.defaultTaxRate ?? raw?.tax_rate ?? org?.defaultTaxRate ?? 0);
  const enabled = Boolean(raw?.taxEnabled ?? raw?.tax_enabled ?? org?.taxEnabled ?? false);
  return { rate: Number.isFinite(rate) ? rate : 0, enabled };
}

/** Cached staff discount cap. Enabled only when the flag is strictly true. No organization fallback. */
export async function discountSettings(): Promise<DiscountSettings> {
  const raw = await settingsRepository.getJson<Record<string, unknown>>(settingsRepository.keys.taxSettings);
  const enabledFlag = raw?.discountEnabled ?? raw?.discount_enabled;
  const enabled = enabledFlag === true;
  const maxPercent = enabled ? Number(raw?.maxDiscountPercent ?? raw?.max_discount_percent ?? 0) : 0;
  return {
    enabled,
    maxPercent: Number.isFinite(maxPercent) ? maxPercent : 0,
  };
}
