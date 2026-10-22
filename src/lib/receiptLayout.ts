import { productRepository } from '@/db/productRepository';
import { getSaleWithItems } from '@/db/saleRepository';
import { settingsRepository } from '@/db/settingsRepository';
import { formatQty } from '@/lib/quantity';
import type { OrganizationDto } from '@/types/organization';

/** Character width for 58mm thermal paper (ESC/POS default). */
export const RECEIPT_PAPER_WIDTH = 32;

export const RECEIPT_BRANDING = {
  company: 'NutaSolutions',
  contactLine: '0541298861 · Call / WhatsApp',
} as const;

const RULE = '-'.repeat(RECEIPT_PAPER_WIDTH);

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  MOBILE_MONEY: 'MoMo',
  CARD: 'Card',
  MIXED: 'Split',
};

async function orgSettings(): Promise<OrganizationDto | null> {
  return settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
}

async function orgName(): Promise<string> {
  const name = (await orgSettings())?.name?.trim();
  if (!name) {
    console.warn('Receipt', 'organization name missing — using fallback header');
    return 'Store';
  }
  return name;
}

async function orgHeaderLines(): Promise<string[]> {
  const org = await orgSettings();
  const lines = [`<C><CB>${await orgName()}</CB></C>`];
  const phone = org?.phone?.trim();
  if (phone) lines.push(`<C>${phone}</C>`);
  const location = (org?.businessLocation ?? org?.business_location)?.trim();
  if (location) lines.push(`<C>${location}</C>`);
  return lines;
}

function formatMoney(amount: number): string {
  return Number(amount).toFixed(2);
}

/**
 * Compact local date/time for thermal receipts, e.g. "27 Jun 2026, 2:14 PM".
 */
export function formatReceiptDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

export function formatPaymentMethod(raw: string): string {
  const key = raw.trim().toUpperCase();
  return PAYMENT_LABELS[key] ?? raw.trim();
}

/**
 * Left label + right-aligned value on a fixed-width line. Truncates the left side when needed.
 */
export function padReceiptLine(left: string, right: string, width = RECEIPT_PAPER_WIDTH): string {
  const minGap = 1;
  const rightLen = right.length;
  if (rightLen >= width) return right.slice(0, width);
  const maxLeft = width - rightLen - minGap;
  let l = left;
  if (l.length > maxLeft) {
    l = maxLeft > 1 ? `${l.slice(0, maxLeft - 1)}…` : l.slice(0, maxLeft);
  }
  const gap = width - l.length - rightLen;
  return l + ' '.repeat(Math.max(minGap, gap)) + right;
}

function footerBlock(): string[] {
  return [
    RULE,
    `<C>Built by ${RECEIPT_BRANDING.company}</C>`,
    `<C>${RECEIPT_BRANDING.contactLine}</C>`,
    '',
  ];
}

/** Sample receipt for printer connection tests — mirrors production layout. */
export async function buildTestThermalReceipt(): Promise<string> {
  const lines = [
    ...(await orgHeaderLines()),
    RULE,
    '<C>Test print</C>',
    '<C>Connection OK</C>',
    RULE,
    ...footerBlock(),
  ];
  return lines.join('\n');
}

/**
 * Builds ESC/POS-tagged receipt text for a completed sale.
 * Tags are interpreted at print time (`<C>` center, `<CB>` bold center, `<L>` left).
 * Dexie reads are async; the mobile SQLite helpers were synchronous.
 */
export async function buildThermalReceipt(saleId: string): Promise<string> {
  const data = await getSaleWithItems(saleId);
  if (!data) {
    return `<L>Sale ${saleId}\n(not found locally)\n</L>`;
  }

  const { sale, items } = data;
  const receiptNo = sale.receipt_number ?? sale.id.slice(0, 8).toUpperCase();
  const subtotal = items.reduce((sum, i) => sum + Number(i.total_price), 0);
  const discount = Number(sale.discount_amount);
  const tax = Number(sale.tax_amount);
  const total = Number(sale.total_amount);
  const paidLabel = formatPaymentMethod(sale.payment_method ?? '');

  const lines: string[] = [
    ...(await orgHeaderLines()),
    RULE,
    padReceiptLine('Receipt', receiptNo),
    formatReceiptDateTime(sale.sold_at),
    RULE,
  ];

  for (const item of items) {
    const product = await productRepository.findById(item.product_id);
    const label = product?.name ?? item.product_id.slice(0, 8);
    lines.push(padReceiptLine(`${label} x${formatQty(item.quantity)}`, formatMoney(item.total_price)));
  }

  lines.push(RULE, padReceiptLine('Subtotal', formatMoney(subtotal)));

  if (discount > 0) {
    lines.push(padReceiptLine('Discount', `-${formatMoney(discount)}`));
  }
  if (tax > 0) {
    lines.push(padReceiptLine('Tax', formatMoney(tax)));
  }

  lines.push(
    padReceiptLine('Total', formatMoney(total)),
    padReceiptLine('Paid', paidLabel),
    ...footerBlock(),
  );

  return lines.join('\n');
}
