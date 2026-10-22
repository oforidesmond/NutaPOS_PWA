export type DiscountValidationInput = {
  discountAmount: number;
  subtotal: number;
  maxPercent: number;
  enabled: boolean;
};

export type DiscountValidationResult = { ok: true } | { ok: false; message: string };

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeDiscountPercent(discountAmount: number, subtotal: number): number {
  if (subtotal <= 0) {
    return discountAmount > 0 ? 100 : 0;
  }
  return (discountAmount / subtotal) * 100;
}

export function maxDiscountAmount(subtotal: number, maxPercent: number): number {
  if (subtotal <= 0 || maxPercent <= 0) return 0;
  return roundMoney(subtotal * (maxPercent / 100));
}

export function validateDiscount(input: DiscountValidationInput): DiscountValidationResult {
  const { discountAmount, subtotal, maxPercent, enabled } = input;

  if (discountAmount <= 0) {
    return { ok: true };
  }

  if (!enabled || maxPercent <= 0) {
    return {
      ok: false,
      message: 'Discounts are not permitted. Contact your administrator.',
    };
  }

  if (subtotal <= 0) {
    return {
      ok: false,
      message: 'Discounts are not permitted. Contact your administrator.',
    };
  }

  const discountPercentApplied = computeDiscountPercent(discountAmount, subtotal);
  const appliedRounded = Math.round(discountPercentApplied * 100) / 100;
  const limitRounded = Math.round(maxPercent * 100) / 100;

  if (appliedRounded > limitRounded) {
    return {
      ok: false,
      message: `Maximum discount is ${limitRounded}%. Contact your administrator to request a higher limit.`,
    };
  }

  return { ok: true };
}

export function computeTotalWithDiscount(subtotal: number, taxAmount: number, discountAmount: number): number {
  return roundMoney(subtotal + taxAmount - discountAmount);
}
