import { db, type Sale, type SaleItem } from '@/db/schema';
import { formatQty } from '@/lib/quantity';

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** UTC calendar day (`YYYY-MM-DD`), matching SQLite `date()`. */
export function utcDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC calendar day `days` before `now`, matching `date('now', '-N days')`. */
export function utcDaysAgo(days: number, now = new Date()): string {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function defaultExportRange(now = new Date()): { start: string; end: string } {
  const start = new Date(now.getTime());
  start.setDate(start.getDate() - 30);
  return { start: localDateString(start), end: localDateString(now) };
}

export function validateExportRange(start: string, end: string): string | null {
  if (!isRealDate(start) || !isRealDate(end)) {
    return 'Enter both dates in YYYY-MM-DD format.';
  }
  if (start > end) return 'Export start date cannot be after the end date.';
  return null;
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export const batchOperationsService = {
  /**
   * Deletes synced sales whose UTC sync date is older than 90 days.
   * Unsynced sales stay, including old ones. Returns the number of sales removed.
   */
  async clearOldSales(now = new Date()): Promise<number> {
    const cutoff = utcDaysAgo(90, now);
    return db.transaction('rw', db.sales, db.sale_items, db.sync_queue, async () => {
      const sales = await db.sales.filter((sale) => isOldSyncedSale(sale, cutoff)).toArray();
      if (sales.length === 0) return 0;
      const ids = sales.map((sale) => sale.id);
      await db.sale_items.where('sale_id').anyOf(ids).delete();
      await db.sync_queue
        .where('entity_id')
        .anyOf(ids)
        .and((row) => row.entity_type === 'sale')
        .delete();
      await db.sales.bulkDelete(ids);
      return ids.length;
    });
  },

  /**
   * One CSV row per sale line. A sale with no items still emits one row.
   * Returns are excluded. `date(sold_at)` is the UTC calendar day.
   */
  async exportSalesCSV(dateRange: { start: string; end: string }): Promise<string> {
    const sales = (await db.sales.filter((sale) => sale.is_return === 0).toArray())
      .filter((sale) => {
        const day = utcDay(sale.sold_at);
        return day != null && day >= dateRange.start && day <= dateRange.end;
      })
      .sort((a, b) => (a.sold_at < b.sold_at ? 1 : a.sold_at > b.sold_at ? -1 : 0));

    const headers = [
      'Receipt',
      'Sold at',
      'Product',
      'Qty',
      'Unit price',
      'Sale total',
      'Sale tax',
      'Payment',
      'Synced',
    ];
    const lines = [headers.map(csvEscape).join(',')];
    for (const sale of sales) {
      const items = await db.sale_items.where('sale_id').equals(sale.id).toArray();
      const rows = items.length > 0 ? items : [null];
      for (const item of rows) {
        const productName = item ? ((await db.products.get(item.product_id))?.name ?? '') : '';
        lines.push(csvRow(sale, item, productName));
      }
    }
    return lines.join('\n');
  },
};

function isOldSyncedSale(sale: Sale, cutoff: string): boolean {
  if (!sale.synced_at) return false;
  const day = utcDay(sale.synced_at);
  return day != null && day < cutoff;
}

function csvRow(sale: Sale, item: SaleItem | null, productName: string): string {
  return [
    sale.receipt_number,
    sale.sold_at,
    productName,
    formatQty(item?.quantity ?? Number.NaN),
    item?.unit_price,
    sale.total_amount,
    sale.tax_amount,
    sale.payment_method,
    sale.synced_at ? 'yes' : 'no',
  ]
    .map(csvEscape)
    .join(',');
}
