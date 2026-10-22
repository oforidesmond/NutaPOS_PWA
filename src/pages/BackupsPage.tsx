import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { showToast } from '@/components/toast';
import {
  databaseBackupService,
  formatBackupSize,
  type LocalBackupInfo,
} from '@/services/databaseBackupService';
import { text } from '@/theme';

export function BackupsPage() {
  const [rows, setRows] = useState<LocalBackupInfo[]>([]);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setRows(await databaseBackupService.listLocalBackups());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restoreNamed = async (name: string) => {
    setBusyName(name);
    try {
      await databaseBackupService.restoreFromBackup(name);
      showToast('Database restored', 'Reload the app if anything looks wrong.');
      setPendingRestore(null);
    } catch (error) {
      showToast('Restore failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusyName(null);
    }
  };

  const restoreFile = async (file: File) => {
    setBusyName(file.name);
    try {
      await databaseBackupService.restoreFromFileContents(await file.text());
      showToast('Database restored', 'Reload the app if anything looks wrong.');
    } catch (error) {
      showToast('Restore failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusyName(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (name: string) => {
    setBusyName(name);
    try {
      await databaseBackupService.deleteLocalBackup(name);
      setPendingDelete(null);
      await refresh();
    } catch (error) {
      showToast('Delete failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusyName(null);
    }
  };

  return (
    <Screen header={<GlassHeader title="Backups" backTo="/settings" />}>
      <p className="hint">Local copies of your database. Cloud upload runs in the background when online.</p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Backup file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void restoreFile(file);
        }}
      />
      <Button title="Restore a backup file" variant="secondary" onClick={() => fileRef.current?.click()} />
      {rows.length === 0 ? (
        <div className="history-empty">
          <p style={text.headline}>No backups yet</p>
          <p style={text.callout}>Create one from Settings.</p>
        </div>
      ) : (
        rows.map((row) => (
          <article key={row.name} className="backup-card">
            <h2 style={text.subheadline}>{row.name}</h2>
            <p className="hint">
              {new Date(row.createdAt).toLocaleString()} · {formatBackupSize(row.size)}
            </p>
            <div className="backup-actions">
              <Button
                title="Restore"
                onClick={() => setPendingRestore(row.name)}
                disabled={busyName != null}
              />
              <Button
                title="Delete"
                variant="dangerOutline"
                onClick={() => setPendingDelete(row.name)}
                disabled={busyName != null}
              />
            </div>
          </article>
        ))
      )}

      <Sheet
        open={pendingRestore != null}
        title="Restore backup?"
        onClose={() => setPendingRestore(null)}
        align="center"
      >
        <p style={text.body}>
          This replaces the local database with this backup. Close other screens, then continue. You may need to reload
          the app after restore.
        </p>
        <div className="sheet-actions">
          <Button title="Cancel" variant="secondary" onClick={() => setPendingRestore(null)} />
          <Button
            title="Restore"
            variant="dangerOutline"
            disabled={busyName != null}
            onClick={() => {
              if (pendingRestore) void restoreNamed(pendingRestore);
            }}
          />
        </div>
      </Sheet>

      <Sheet open={pendingDelete != null} title="Delete backup?" onClose={() => setPendingDelete(null)} align="center">
        <p style={text.body}>{pendingDelete}</p>
        <div className="sheet-actions">
          <Button title="Cancel" variant="secondary" onClick={() => setPendingDelete(null)} />
          <Button
            title="Delete"
            variant="dangerOutline"
            disabled={busyName != null}
            onClick={() => {
              if (pendingDelete) void remove(pendingDelete);
            }}
          />
        </div>
      </Sheet>
    </Screen>
  );
}
