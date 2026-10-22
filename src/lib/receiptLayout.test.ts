import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/saleRepository', () => ({
  getSaleWithItems: vi.fn(),
}));

vi.mock('@/db/productRepository', () => ({
  productRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('@/db/settingsRepository', () => ({
  settingsRepository: {
    getJson: vi.fn(),
    keys: { organization: 'organization', taxSettings: 'tax_settings', categories: 'categories' },
  },
}));

import { productRepository } from '@/db/productRepository';
import { getSaleWithItems } from '@/db/saleRepository';
import { settingsRepository } from '@/db/settingsRepository';
import {
  RECEIPT_BRANDING,
  RECEIPT_PAPER_WIDTH,
  buildTestThermalReceipt,
  buildThermalReceipt,
  formatPaymentMethod,
  formatReceiptDateTime,
  padReceiptLine,
} from '@/lib/receiptLayout';

const mockedGetSale = vi.mocked(getSaleWithItems);
const mockedFindProduct = vi.mocked(productRepository.findById);
const mockedGetJson = vi.mocked(settingsRepository.getJson);

const sampleSale = {
  sale: {
    id: 'sale-1',
    total_amount: 5.63,
    tax_amount: 0.63,
    discount_amount: 0,
    payment_method: 'CASH',
    sold_at: '2026-06-27T14:14:00.000Z',
    receipt_number: 'RCP-20260627-ABC123',
    synced_at: null,
    staff_id: 'staff-1',
    branch_id: null,
    is_return: 0 as const,
    original_sale_id: null,
  },
  items: [
    {
      id: 'item-1',
      sale_id: 'sale-1',
      product_id: 'prod-1',
      quantity: 1,
      unit_price: 5,
      total_price: 5,
      is_temporary_product: 0 as const,
      variance_reason: null,
      variance_note: null,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mockedGetJson.mockResolvedValue({ id: 'org-1', name: 'Acme Retail Ltd', currency: 'GHS' });
  mockedFindProduct.mockResolvedValue({
    id: 'prod-1',
    barcode: null,
    sku: null,
    name: 'Cerelac',
    price: 5,
    cost_price: null,
    stock_quantity: 1,
    category_id: null,
    is_temporary: 0,
    synced_at: null,
    updated_at: '',
    auto_convert_json: null,
  });
});

describe('padReceiptLine', () => {
  it('right-aligns values within paper width', () => {
    const line = padReceiptLine('Subtotal', '5.00', RECEIPT_PAPER_WIDTH);
    expect(line.length).toBe(RECEIPT_PAPER_WIDTH);
    expect(line.endsWith('5.00')).toBe(true);
    expect(line.startsWith('Subtotal')).toBe(true);
  });

  it('truncates long left labels with ellipsis', () => {
    const line = padReceiptLine('Very Long Product Name That Exceeds Width', '9.99', RECEIPT_PAPER_WIDTH);
    expect(line.length).toBe(RECEIPT_PAPER_WIDTH);
    expect(line).toContain('…');
    expect(line.endsWith('9.99')).toBe(true);
  });
});

describe('formatPaymentMethod', () => {
  it('maps backend payment codes to display labels', () => {
    expect(formatPaymentMethod('CASH')).toBe('Cash');
    expect(formatPaymentMethod('MOBILE_MONEY')).toBe('MoMo');
    expect(formatPaymentMethod('CARD')).toBe('Card');
    expect(formatPaymentMethod('MIXED')).toBe('Split');
  });

  it('returns raw value for unknown methods', () => {
    expect(formatPaymentMethod('VOUCHER')).toBe('VOUCHER');
  });
});

describe('formatReceiptDateTime', () => {
  it('formats a valid ISO timestamp', () => {
    const formatted = formatReceiptDateTime('2026-06-27T14:14:00.000Z');
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/Jun/);
  });

  it('returns empty string for invalid dates', () => {
    expect(formatReceiptDateTime('not-a-date')).toBe('');
  });
});

describe('buildThermalReceipt', () => {
  it('uses organization name in header, not app branding', async () => {
    mockedGetSale.mockResolvedValue(sampleSale);
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain('<CB>Acme Retail Ltd</CB>');
    expect(text).not.toContain('NutaPOS');
  });

  it('prints phone and location under the name when set', async () => {
    mockedGetJson.mockResolvedValue({
      id: 'org-1',
      name: 'SS Ventures',
      phone: '+233244123456',
      businessLocation: 'Accra, Ghana',
    });
    mockedGetSale.mockResolvedValue(sampleSale);
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain('<CB>SS Ventures</CB>');
    expect(text).toContain('<C>+233244123456</C>');
    expect(text).toContain('<C>Accra, Ghana</C>');
    expect(text.indexOf('<CB>SS Ventures</CB>')).toBeLessThan(text.indexOf('<C>+233244123456</C>'));
    expect(text.indexOf('<C>+233244123456</C>')).toBeLessThan(text.indexOf('<C>Accra, Ghana</C>'));
  });

  it('accepts snake_case business_location alias', async () => {
    mockedGetJson.mockResolvedValue({
      id: 'org-1',
      name: 'SS Ventures',
      business_location: 'Kumasi',
    });
    mockedGetSale.mockResolvedValue(sampleSale);
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain('<C>Kumasi</C>');
  });

  it('omits phone and location lines when missing or blank', async () => {
    mockedGetJson.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Retail Ltd',
      phone: '  ',
      businessLocation: null,
    });
    mockedGetSale.mockResolvedValue(sampleSale);
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain('<CB>Acme Retail Ltd</CB>');
    expect(text).not.toContain('<C>+233');
    expect(text).not.toMatch(/<C>\s*<\/C>/);
    // Only name + rule after header — no contact lines between name and RULE
    expect(text).toMatch(/<CB>Acme Retail Ltd<\/CB><\/C>\n-{32}/);
  });

  it('includes receipt number, date, items, totals, and payment', async () => {
    mockedGetSale.mockResolvedValue(sampleSale);
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain('RCP-20260627-ABC123');
    expect(text).toContain('Cerelac x1');
    expect(text).toContain(padReceiptLine('Subtotal', '5.00'));
    expect(text).toContain(padReceiptLine('Tax', '0.63'));
    expect(text).toContain(padReceiptLine('Total', '5.63'));
    expect(text).toContain(padReceiptLine('Paid', 'Cash'));
  });

  it('formats fractional item quantities without trailing zeros', async () => {
    mockedGetSale.mockResolvedValue({
      ...sampleSale,
      items: [{ ...sampleSale.items[0], quantity: 0.25, total_price: 1.25 }],
    });
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain('Cerelac x0.25');
    expect(text).not.toContain('x0.250');
  });

  it('includes compact NutaSolutions footer', async () => {
    mockedGetSale.mockResolvedValue(sampleSale);
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain(`Built by ${RECEIPT_BRANDING.company}`);
    expect(text).toContain(RECEIPT_BRANDING.contactLine);
  });

  it('omits tax line when tax is zero', async () => {
    mockedGetSale.mockResolvedValue({
      ...sampleSale,
      sale: { ...sampleSale.sale, tax_amount: 0, total_amount: 5 },
    });
    const text = await buildThermalReceipt('sale-1');
    expect(text).not.toContain(padReceiptLine('Tax', '0.00'));
  });

  it('includes discount line when discount is applied', async () => {
    mockedGetSale.mockResolvedValue({
      ...sampleSale,
      sale: { ...sampleSale.sale, discount_amount: 1.5, total_amount: 4.13 },
    });
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain(padReceiptLine('Discount', '-1.50'));
  });

  it('falls back to Store header when org name is missing', async () => {
    mockedGetJson.mockResolvedValue({ id: 'org-1' });
    mockedGetSale.mockResolvedValue(sampleSale);
    const text = await buildThermalReceipt('sale-1');
    expect(text).toContain('<CB>Store</CB>');
  });
});

describe('buildTestThermalReceipt', () => {
  it('includes org header, test message, and footer', async () => {
    const text = await buildTestThermalReceipt();
    expect(text).toContain('<CB>Acme Retail Ltd</CB>');
    expect(text).toContain('Test print');
    expect(text).toContain(RECEIPT_BRANDING.contactLine);
    expect(text).not.toContain('NutaPOS');
  });

  it('includes phone and location when set', async () => {
    mockedGetJson.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Retail Ltd',
      phone: '0541298861',
      businessLocation: 'Tamale',
    });
    const text = await buildTestThermalReceipt();
    expect(text).toContain('<C>0541298861</C>');
    expect(text).toContain('<C>Tamale</C>');
  });
});
