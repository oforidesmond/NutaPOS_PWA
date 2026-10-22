import type { AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { api, getStoredAccessToken } from '@/api/client';
import { buildApiPath } from '@/lib/env';

export type StaffBackupMeta = {
  device_id: string;
  app_version: string;
  build_number?: string;
};

export function buildStaffBackupForm(
  file: Blob,
  fileName: string,
  meta: StaffBackupMeta,
  createdAt: string,
): FormData {
  const form = new FormData();
  form.append('device_id', meta.device_id);
  form.append('app_version', meta.app_version);
  if (meta.build_number) form.append('build_number', meta.build_number);
  form.append('created_at', createdAt);
  form.append('backup', file, fileName);
  return form;
}

function dropJsonContentType(data: unknown, headers: InternalAxiosRequestConfig['headers']): unknown {
  (headers as AxiosHeaders).delete('Content-Type');
  return data;
}

/** Best-effort multipart upload. Skips when there is no access token. */
export async function postStaffBackup(file: Blob, fileName: string, meta: StaffBackupMeta): Promise<void> {
  if (!(await getStoredAccessToken())) return;
  const form = buildStaffBackupForm(file, fileName, meta, new Date().toISOString());
  await api.post(buildApiPath('/staff/backup'), form, {
    transformRequest: [dropJsonContentType],
  });
}
