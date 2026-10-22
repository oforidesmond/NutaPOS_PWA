// Matches NutaPOS Staff SQLite user_version 9.
// Final shape after migrations v1–v9. Do not replay the SQLite ALTER statements.
// sync_queue.payload is a JSON object here. The mobile app stores a JSON string.

import Dexie, { type Table } from 'dexie';

export type Flag = 0 | 1;

export interface Product {
  id: string;
  barcode: string | null;
  sku: string | null;
  name: string;
  price: number;
  cost_price: number | null;
  stock_quantity: number;
  category_id: string | null;
  is_temporary: Flag;
  synced_at: string | null;
  updated_at: string;
  auto_convert_json: string | null;
}

export interface Sale {
  id: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  payment_method: string | null;
  sold_at: string;
  synced_at: string | null;
  staff_id: string;
  branch_id: string | null;
  is_return: Flag;
  original_sale_id: string | null;
  receipt_number: string | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_temporary_product: Flag;
  variance_reason: string | null;
  variance_note: string | null;
}

/** Status values are not enforced by the database. */
export type SyncStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PENDING_SUPER_ADMIN'
  | 'CLEARED_ADMIN';

export interface SyncQueueRow {
  id?: number;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload: Record<string, unknown>;
  status: SyncStatus | string;
  attempt_count: number;
  created_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
  failure_id: string | null;
  error_code: string | null;
  admin_message: string | null;
  last_failed_at: string | null;
  resolution_action: string | null;
  resolution_status: string | null;
  resolved_at: string | null;
  admin_applied_sale_id: string | null;
}

export interface TrialUsage {
  id: number;
  sales_count: number;
  trial_limit: number;
  device_fingerprint_hash: string;
  last_updated: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

export interface PrefRow {
  key: string;
  value: unknown;
}

export interface SecretRow {
  key: string;
  value: string;
}

/** Web-only. The mobile app stores backup files on disk instead. */
export interface LocalBackupRow {
  file_name: string;
  created_at: string;
  payload: unknown;
}

export class NutaPosDatabase extends Dexie {
  products!: Table<Product, string>;
  sales!: Table<Sale, string>;
  sale_items!: Table<SaleItem, string>;
  sync_queue!: Table<SyncQueueRow, number>;
  trial_usage!: Table<TrialUsage, number>;
  settings!: Table<SettingRow, string>;
  prefs!: Table<PrefRow, string>;
  secrets!: Table<SecretRow, string>;
  local_backups!: Table<LocalBackupRow, string>;

  constructor() {
    super('nutapos_staff');
    // Version 1 matches nutapos_staff.db at PRAGMA user_version 9.
    this.version(1).stores({
      products: 'id, barcode, sku, name',
      sales: 'id, receipt_number, sold_at, synced_at',
      sale_items: 'id, sale_id, product_id',
      sync_queue: '++id, status, failure_id, entity_id, created_at',
      trial_usage: 'id',
      settings: 'key',
      prefs: 'key',
      secrets: 'key',
    });
    // Version 2 is web-only. It keeps local JSON backups. Do not treat it as a SQLite migration.
    this.version(2).stores({
      local_backups: 'file_name, created_at',
    });
  }
}

export const db = new NutaPosDatabase();

export const REQUIRED_TABLES = [
  'products',
  'sales',
  'sale_items',
  'sync_queue',
  'trial_usage',
  'settings',
  'prefs',
] as const;
