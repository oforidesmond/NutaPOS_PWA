import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, readActiveBranchId } from '@/lib/jwtClaims';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${body}.signature`;
}

describe('jwtClaims', () => {
  it('decodes a JWT payload', () => {
    const token = makeJwt({ sub: 'user-1', activeBranchId: 'branch-a' });
    expect(decodeJwtPayload(token)).toMatchObject({
      sub: 'user-1',
      activeBranchId: 'branch-a',
    });
  });

  it('reads activeBranchId from token', () => {
    const token = makeJwt({ activeBranchId: 'branch-b' });
    expect(readActiveBranchId(token)).toBe('branch-b');
  });

  it('returns null when activeBranchId is null', () => {
    const token = makeJwt({ activeBranchId: null });
    expect(readActiveBranchId(token)).toBeNull();
  });

  it('returns undefined for malformed tokens', () => {
    expect(readActiveBranchId('not-a-jwt')).toBeUndefined();
  });
});
