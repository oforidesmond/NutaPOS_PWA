import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import { postStaffSale, type StaffSalePayload, type StaffSalePostOutcome } from '@/api/salesApi';

vi.mock('@/api/client', () => ({
  api: { post: vi.fn() },
}));

vi.mock('@/lib/env', () => ({
  buildApiPath: (p: string) => p,
}));

const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

function makeBody(): StaffSalePayload {
  return {
    id: 'sale-1',
    receiptNumber: 'R-1',
    receipt_number: 'R-1',
    organizationId: 'org-1',
    createdById: 'staff-1',
    subtotal: 10,
    taxRate: 0,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: 10,
    paymentMethod: 'CASH',
    currency: 'GHS',
    soldAt: '2025-01-01T00:00:00.000Z',
    items: [],
  };
}

beforeEach(() => {
  mockPost.mockReset();
});

describe('postStaffSale outcome classification', () => {
  it('classifies 2xx as success', async () => {
    mockPost.mockResolvedValueOnce({
      status: 201,
      data: { syncedAt: '2025-01-01T00:00:00.000Z' },
    });
    const out: StaffSalePostOutcome = await postStaffSale(makeBody());
    expect(out.kind).toBe('success');
    if (out.kind === 'success') {
      expect(out.syncedAt).toBe('2025-01-01T00:00:00.000Z');
    }
  });

  it('classifies 409 with syncedAt and no errorCode as duplicate-success', async () => {
    mockPost.mockResolvedValueOnce({
      status: 409,
      data: { syncedAt: '2025-02-02T00:00:00.000Z' },
    });
    const out = await postStaffSale(makeBody());
    expect(out.kind).toBe('duplicate-success');
    if (out.kind === 'duplicate-success') {
      expect(out.syncedAt).toBe('2025-02-02T00:00:00.000Z');
    }
  });

  it('classifies 409 with synced_at (snake_case) and no errorCode as duplicate-success', async () => {
    mockPost.mockResolvedValueOnce({
      status: 409,
      data: { synced_at: '2025-02-03T00:00:00.000Z' },
    });
    const out = await postStaffSale(makeBody());
    expect(out.kind).toBe('duplicate-success');
    if (out.kind === 'duplicate-success') {
      expect(out.syncedAt).toBe('2025-02-03T00:00:00.000Z');
    }
  });

  it('classifies structured 400 with errorCode+failureId as dlq-failure', async () => {
    mockPost.mockResolvedValueOnce({
      status: 400,
      data: {
        statusCode: 400,
        errorCode: 'SALE_PRODUCT_MISSING',
        failureId: 'failure-1',
        message: 'Product not found. Sent to Admin for review.',
        retryable: false,
        entityType: 'SALE',
        entityId: 'sale-1',
      },
    });
    const out = await postStaffSale(makeBody());
    expect(out.kind).toBe('dlq-failure');
    if (out.kind === 'dlq-failure') {
      expect(out.status).toBe(400);
      expect(out.failure.errorCode).toBe('SALE_PRODUCT_MISSING');
      expect(out.failure.failureId).toBe('failure-1');
      expect(out.failure.message).toContain('Sent to Admin');
    }
  });

  it('classifies structured 403 with errorCode+failureId as dlq-failure', async () => {
    mockPost.mockResolvedValueOnce({
      status: 403,
      data: {
        statusCode: 403,
        errorCode: 'SALE_CREATED_BY_INVALID',
        failureId: 'failure-2',
        message: 'Created-by user not allowed',
        retryable: false,
      },
    });
    const out = await postStaffSale(makeBody());
    expect(out.kind).toBe('dlq-failure');
    if (out.kind === 'dlq-failure') {
      expect(out.status).toBe(403);
      expect(out.failure.errorCode).toBe('SALE_CREATED_BY_INVALID');
      expect(out.failure.failureId).toBe('failure-2');
    }
  });

  it('classifies structured 409 with errorCode+failureId as dlq-failure (not duplicate-success)', async () => {
    mockPost.mockResolvedValueOnce({
      status: 409,
      data: {
        statusCode: 409,
        errorCode: 'SALE_RECEIPT_CONFLICT',
        failureId: 'failure-3',
        message: 'Receipt already used for a different sale',
        retryable: false,
      },
    });
    const out = await postStaffSale(makeBody());
    expect(out.kind).toBe('dlq-failure');
    if (out.kind === 'dlq-failure') {
      expect(out.status).toBe(409);
      expect(out.failure.errorCode).toBe('SALE_RECEIPT_CONFLICT');
    }
  });

  it('throws on 409 without syncedAt and without errorCode (unrecognised)', async () => {
    mockPost.mockResolvedValueOnce({
      status: 409,
      data: { message: 'conflict' },
    });
    await expect(postStaffSale(makeBody())).rejects.toThrow(/unrecognised 409/);
  });

  it('throws on 400 without DLQ shape (unrecognised legacy)', async () => {
    mockPost.mockResolvedValueOnce({
      status: 400,
      data: { message: 'validation error' },
    });
    await expect(postStaffSale(makeBody())).rejects.toThrow(
      'postStaffSale: unrecognised 400 response without DLQ fields: validation error',
    );
  });

  it('joins array validation messages into the thrown 400 error', async () => {
    mockPost.mockResolvedValueOnce({
      status: 400,
      data: { message: ['quantity must be positive', '  ', 'price is required'] },
    });
    await expect(postStaffSale(makeBody())).rejects.toThrow(
      /unrecognised 400 response without DLQ fields: quantity must be positive · price is required/,
    );
  });

  it('propagates 5xx as a thrown error so the worker retries (transport failure path)', async () => {
    const err = new Error('Request failed with status code 500');
    mockPost.mockRejectedValueOnce(err);
    await expect(postStaffSale(makeBody())).rejects.toThrow(err);
  });

  it('only treats truthy errorCode + failureId as DLQ', async () => {
    mockPost.mockResolvedValueOnce({
      status: 400,
      data: { errorCode: '', failureId: '' },
    });
    await expect(postStaffSale(makeBody())).rejects.toThrow(/unrecognised 400/);
  });
});
