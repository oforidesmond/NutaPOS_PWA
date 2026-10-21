/**
 * Best-effort JWT payload decode for client-side session metadata only.
 * Never use for authorization - the server validates tokens on every request.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Reads `activeBranchId` from an access token (re-resolved by the backend on
 * login/refresh). Returns `undefined` when the token cannot be decoded.
 */
export function readActiveBranchId(token: string): string | null | undefined {
  const payload = decodeJwtPayload(token);
  if (!payload) return undefined;
  const id = payload.activeBranchId;
  if (id === null) return null;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}
