/** Human-readable receipt id: RCP-YYYYMMDD-XXXXXX (backend stores this on `POST /staff/sales`). */
export function generateReceiptNumber(): string {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RCP-${date}-${random}`;
}
