import { db } from '@/db/schema';

/**
 * Tokens and the user profile live in IndexedDB because the browser has no Keychain.
 * This is weaker than the mobile secure store: any script on this origin can read it.
 * Do not copy tokens to localStorage. Do not log token values.
 */
const ACCESS_TOKEN = 'access_token';

export async function getSecret(key: string): Promise<string | null> {
  const row = await db.secrets.get(key);
  return row?.value ?? null;
}

export async function setSecret(key: string, value: string): Promise<void> {
  await db.secrets.put({ key, value });
}

export async function deleteSecret(key: string): Promise<void> {
  await db.secrets.delete(key);
}

export async function getAccessToken(): Promise<string | null> {
  return getSecret(ACCESS_TOKEN);
}

export async function setAccessToken(token: string): Promise<void> {
  await setSecret(ACCESS_TOKEN, token);
}

export async function clearAccessToken(): Promise<void> {
  await deleteSecret(ACCESS_TOKEN);
}
