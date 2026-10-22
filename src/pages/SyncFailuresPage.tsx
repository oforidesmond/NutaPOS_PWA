import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StaffSalePayload } from '@/api/salesApi';
import { Button } from '@/components/Button';
import { EditDiscountSheet } from '@/components/EditDiscountSheet';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { StockVarianceModal } from '@/components/StockVarianceModal';
import { showToast } from '@/components/toast';
import { syncQueueRepository, type SyncQueueRow } from '@/db/syncQueueRepository';
import type { Product } from '@/db/schema';
import { discountSettings, type DiscountSettings } from '@/lib/checkoutSettings';
import { isDiscountSyncError, repairFailedSaleDiscount } from '@/services/discountRepairService';
import { pullSyncFailureResolutions } from '@/services/syncFailureResolutionPull';
import type { StockShortage } from '@/services/stockVarianceService';
import { syncWorker } from '@/services/syncWorker';
import { text } from '@/theme';
import type { VarianceByLineKey, VarianceReason } from '@/types/stockVariance';

type FailedSale = {
  row: SyncQueueRow;
  body: StaffSalePayload;
};

function decodeFailedSale(row: SyncQueueRow): FailedSale | null {
  const payload = row.payload;
  if (!payload || typeof payload !== 'object') return null;
  const body = (payload as { body?: StaffSalePayload }).body;
  if (!body) return null;
  return { row, body };
}

function shortagesFromBody(body: StaffSalePayload): StockShortage[] {
  return body.items.map((item) => {
    const stub: Product = {
      id: item.productId,
      barcode: null,
      sku: null,
      name: item.productName,
      price: item.unitPrice,
      cost_price: item.unitCost,
      stock_quantity: 0,
      category_id: null,
      is_temporary: 0,
      auto_convert_json: null,
      synced_at: null,
      updated_at: '',
    };
    return {
      key: item.id,
      product: stub,
      orderedQty: item.quantity,
      availableQty: 0,
    };
  });
}

function initialValuesFromBody(body: StaffSalePayload): VarianceByLineKey {
  const out: VarianceByLineKey = {};
  for (const item of body.items) {
    if (!item.varianceReason) continue;
    out[item.id] = {
      varianceReason: item.varianceReason,
      ...(item.varianceNote ? { varianceNote: item.varianceNote } : {}),
    };
  }
  return out;
}

function receiptLabel(body: StaffSalePayload): string {
  return String(body.receiptNumber ?? body.receipt_number ?? body.id.slice(0, 8));
}

export function SyncFailuresPage() {
  const [transportRows, setTransportRows] = useState<FailedSale[]>([]);
  const [adminReviewRows, setAdminReviewRows] = useState<FailedSale[]>([]);
  const [editing, setEditing] = useState<FailedSale | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<FailedSale | null>(null);
  const [discountRepairLoading, setDiscountRepairLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [discountCfg, setDiscountCfg] = useState<DiscountSettings>({ enabled: false, maxPercent: 0 });

  const refresh = useCallback(async () => {
    const transport = (await syncQueueRepository.listFailedSales(50))
      .map(decodeFailedSale)
      .filter((row): row is FailedSale => row !== null);
    const adminReview = (await syncQueueRepository.listPendingAdminReviewSales(50))
      .map(decodeFailedSale)
      .filter((row): row is FailedSale => row !== null);
    setTransportRows(transport);
    setAdminReviewRows(adminReview);
  }, []);

  useEffect(() => {
    void refresh();
    void discountSettings().then(setDiscountCfg);
  }, [refresh]);

  const editingShortages = useMemo(() => (editing ? shortagesFromBody(editing.body) : []), [editing]);
  const editingInitial = useMemo(() => (editing ? initialValuesFromBody(editing.body) : undefined), [editing]);

  const onConfirmRepair = async (variance: VarianceByLineKey) => {
    if (!editing) return;
    const updated: StaffSalePayload = {
      ...editing.body,
      items: editing.body.items.map((item) => {
        const next = variance[item.id];
        const cleaned = { ...item };
        delete cleaned.varianceReason;
        delete cleaned.varianceNote;
        if (next?.varianceReason) {
          cleaned.varianceReason = next.varianceReason as VarianceReason;
          if (next.varianceNote) cleaned.varianceNote = next.varianceNote;
        }
        return cleaned;
      }),
    };
    await syncQueueRepository.updateSalePayloadAndRetry(editing.body.id, {
      idempotencyKey: editing.body.id,
      body: updated,
    });
    setEditing(null);
    syncWorker.trigger();
    showToast('Variance updated', 'Re-queued for sync.');
    window.setTimeout(() => void refresh(), 400);
  };

  const onConfirmDiscountRepair = async (newDiscountAmount: number) => {
    if (!editingDiscount) return;
    setDiscountRepairLoading(true);
    try {
      await repairFailedSaleDiscount(editingDiscount.body.id, newDiscountAmount);
      setEditingDiscount(null);
      syncWorker.trigger();
      showToast('Discount updated', 'Re-queued for sync.');
      window.setTimeout(() => void refresh(), 400);
    } catch (error) {
      showToast('Could not update discount', error instanceof Error ? error.message : String(error));
    } finally {
      setDiscountRepairLoading(false);
    }
  };

  const checkAdminUpdates = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const applied = await pullSyncFailureResolutions();
      showToast(applied ? 'Admin updates applied' : 'No new admin updates');
    } catch (error) {
      showToast('Could not check for admin updates', error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
      window.setTimeout(() => void refresh(), 200);
    }
  };

  const empty = adminReviewRows.length === 0 && transportRows.length === 0;

  return (
    <Screen header={<GlassHeader title="Failed sales" backTo="/pos" />}>
      {empty ? (
        <section className="settings-card">
          <h2 style={text.headline}>All clear</h2>
          <p className="hint" style={text.callout}>
            Nothing needs repair right now. Sales that fail after three upload attempts appear here so you can fix them
            and resend. Items pending admin review also show in this list when applicable.
          </p>
        </section>
      ) : null}

      {adminReviewRows.length > 0 ? (
        <section className="settings-card settings-card-warn">
          <h2 style={text.headline}>Pending admin review</h2>
          <p className="hint" style={text.callout}>
            These sales were flagged and sent to an admin. You do not need to retry them; pull updates when ready.
          </p>
          <Button
            title={checking ? 'Checking…' : 'Check admin updates'}
            onClick={() => void checkAdminUpdates()}
            disabled={checking}
          />
          {adminReviewRows.map(({ row, body }) => (
            <article key={row.id} className="repair-card">
              <div className="repair-head">
                <p style={text.headline}>{receiptLabel(body)}</p>
                <span className="admin-badge">Admin</span>
              </div>
              <p style={text.title2}>
                {body.currency} {body.totalAmount.toFixed(2)}
              </p>
              {row.admin_message ? (
                <p className="admin-note" style={text.callout}>
                  {row.admin_message}
                </p>
              ) : (
                <p className="hint" style={text.caption}>
                  An admin has been notified. This list updates automatically.
                </p>
              )}
              <p style={text.caption}>
                {body.items.length} item(s)
                {row.error_code ? ` · ${row.error_code}` : ''}
              </p>
              {isDiscountSyncError(row.error_code) ? (
                <Button title="Edit discount & resend" onClick={() => setEditingDiscount({ row, body })} />
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {transportRows.length > 0 ? (
        <section className="settings-card">
          <h2 style={text.headline}>Needs your attention</h2>
          <p className="hint" style={text.callout}>
            Fix the issue below, then edit variance and resend so the sale can upload successfully.
          </p>
          {transportRows.map(({ row, body }) => (
            <article key={row.id} className="repair-card">
              <p style={text.headline}>{receiptLabel(body)}</p>
              <p style={text.title2}>
                {body.currency} {body.totalAmount.toFixed(2)}
              </p>
              {row.last_error ? (
                <p className="banner-error" style={text.callout}>
                  {row.last_error}
                </p>
              ) : (
                <p className="hint" style={text.caption}>
                  No server message was captured for the last attempt.
                </p>
              )}
              <p style={text.caption}>
                {body.items.length} item(s) · {row.attempt_count} attempt(s)
              </p>
              <Button title="Edit variance & resend" onClick={() => setEditing({ row, body })} />
            </article>
          ))}
        </section>
      ) : null}

      <StockVarianceModal
        open={editing !== null}
        shortages={editingShortages}
        initialValues={editingInitial}
        onCancel={() => setEditing(null)}
        onConfirm={(variance) => void onConfirmRepair(variance)}
      />
      <EditDiscountSheet
        open={editingDiscount !== null}
        body={editingDiscount?.body ?? null}
        discountCfg={discountCfg}
        submitting={discountRepairLoading}
        onCancel={() => {
          if (!discountRepairLoading) setEditingDiscount(null);
        }}
        onConfirm={(amount) => void onConfirmDiscountRepair(amount)}
      />
    </Screen>
  );
}
