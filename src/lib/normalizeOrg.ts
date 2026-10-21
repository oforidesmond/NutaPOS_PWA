import type { OrganizationDto } from '@/types/organization';

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : null;
}

/** Normalize org DTO from initial-pull / master-data (dual-key sell fields). */
export function normalizeOrg(o: OrganizationDto | undefined | null): OrganizationDto | null {
  if (!o) return null;
  return {
    id: o.id,
    name: o.name,
    phone: trimOrNull(o.phone),
    businessLocation: trimOrNull(o.businessLocation ?? o.business_location),
    planType: o.planType ?? o.plan_type,
    planStatus: o.planStatus ?? o.plan_status,
    salesLimit: o.salesLimit ?? o.sales_limit ?? null,
    salesCount: o.salesCount ?? o.sales_count,
    defaultTaxRate: o.defaultTaxRate ?? o.default_tax_rate,
    taxEnabled: o.taxEnabled ?? o.tax_enabled,
    currency: o.currency ?? 'GHS',
  };
}
