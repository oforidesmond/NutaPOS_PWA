import type { SaleDeviceInfo } from '@/lib/saleDeviceInfo';
import type { VarianceReason } from '@/types/stockVariance';

export type { SaleDeviceInfo } from '@/lib/saleDeviceInfo';

/**
 * Payload aligned with Prisma Sale + SaleItem.
 * Phase 3 stores this on the sync queue. `POST /staff/sales` is Phase 5.
 */
export type StaffSalePayload = {
  id: string;
  receiptNumber: string;
  /** Snake_case duplicate for NestJS / Prisma JSON bodies. */
  receipt_number: string;
  organizationId: string;
  createdById: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string;
  currency: string;
  soldAt: string;
  syncedAt?: string;
  deviceInfo?: SaleDeviceInfo;
  items: StaffSaleItemPayload[];
};

export type StaffSaleItemPayload = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  /**
   * Required by server iff the line was sold past local system stock at sale time.
   * Omit entirely on sufficient-stock or excluded lines.
   */
  varianceReason?: VarianceReason;
  /**
   * Required iff `varianceReason === 'OTHER'` (non-empty after trim).
   * Optional otherwise; omit when empty after trim.
   */
  varianceNote?: string;
};
