import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/toast';
import { prefsRepository } from '@/db/prefsRepository';
import { syncQueueRepository } from '@/db/syncQueueRepository';
import { useAuth } from '@/context/AuthContext';
import {
  batchOperationsService,
  defaultExportRange,
  validateExportRange,
} from '@/services/batchOperationsService';
import { databaseBackupService } from '@/services/databaseBackupService';
import { downloadTextFile } from '@/lib/downloadFile';
import { pullSyncFailureResolutions } from '@/services/syncFailureResolutionPull';
import { syncWorker } from '@/services/syncWorker';
import { text } from '@/theme';

function formatAgo(iso: string | null): string {
  if (!iso) return 'Not yet';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'Not yet';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return new Date(then).toLocaleString();
}

function staffInitials(staffId: string): string {
  const alnum = staffId.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase();
  if (alnum.length === 1) return `${alnum.toUpperCase()}${alnum.toUpperCase()}`;
  return '••';
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [adminReview, setAdminReview] = useState(0);
  const [transportFailed, setTransportFailed] = useState(0);
  const [checking, setChecking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exportStart, setExportStart] = useState(() => defaultExportRange().start);
  const [exportEnd, setExportEnd] = useState(() => defaultExportRange().end);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [lastBackup, setLastBackup] = useState('-');
  const [backingUp, setBackingUp] = useState(false);

  const refresh = useCallback(async () => {
    const stored = await prefsRepository.get<string>(prefsRepository.keys.lastSyncTime);
    setLastSync(typeof stored === 'string' ? stored : null);
    setAdminReview(await syncQueueRepository.countPendingAdminReview());
    setTransportFailed(await syncQueueRepository.countTransportFailures());
    setLastBackup(await databaseBackupService.getLastBackupDateLabel());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const retrySync = async () => {
    await syncQueueRepository.resetAllFailed();
    syncWorker.trigger();
    showToast('Retrying sync…');
    window.setTimeout(() => void refresh(), 500);
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

  const clearOldSales = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const removed = await batchOperationsService.clearOldSales();
      showToast(`Removed ${removed} sale(s)`);
      setConfirmClear(false);
    } catch (error) {
      showToast('Clear failed', error instanceof Error ? error.message : String(error));
    } finally {
      setClearing(false);
    }
  };

  const exportCsv = async () => {
    const error = validateExportRange(exportStart.trim(), exportEnd.trim());
    if (error) {
      setExportError(error);
      return;
    }
    setExportError(null);
    setExporting(true);
    try {
      const csv = await batchOperationsService.exportSalesCSV({
        start: exportStart.trim(),
        end: exportEnd.trim(),
      });
      downloadTextFile(`sales_export_${Date.now()}.csv`, csv, 'text/csv');
      showToast('Export ready');
    } catch (error) {
      showToast('Export failed', error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  const createBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      await databaseBackupService.createBackup({ download: true });
      showToast('Backup created');
      setLastBackup(await databaseBackupService.getLastBackupDateLabel());
    } catch (error) {
      showToast('Backup failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBackingUp(false);
    }
  };

  const staffId = user?.staffId ?? '';

  return (
    <Screen header={<GlassHeader title="Settings" backTo="/pos" />}>
      <section className="settings-card">
        <div className="account-row">
          <span className="account-avatar" aria-hidden="true">
            {staffInitials(staffId)}
          </span>
          <div>
            <p className="hint" style={text.caption}>
              Staff ID
            </p>
            <p style={text.headline}>{staffId || '-'}</p>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2 style={text.headline}>Sync</h2>
        <p style={text.title2}>{formatAgo(lastSync)}</p>
        <p className="hint" style={text.caption}>
          Last synced
        </p>
        <p className="hint" style={text.callout}>
          Master data refreshes about every 30 minutes while you are online.
        </p>
      </section>

      {adminReview > 0 ? (
        <section className="settings-card settings-card-warn">
          <h2 style={text.headline}>Admin review</h2>
          <p style={text.callout}>
            {adminReview} sale(s) are pending admin review. They were flagged on the server - you do not need to retry
            them.
          </p>
          <div className="sheet-actions">
            <Button
              title={checking ? 'Checking…' : 'Check admin updates'}
              onClick={() => void checkAdminUpdates()}
              disabled={checking}
            />
            <Button title="Review failed sales" variant="secondary" onClick={() => navigate('/sync-failures')} />
          </div>
        </section>
      ) : null}

      {transportFailed > 0 ? (
        <section className="settings-card settings-card-warn">
          <h2 style={text.headline}>Sync issues</h2>
          <p style={text.callout}>{transportFailed} item(s) failed to upload after three attempts.</p>
          <div className="sheet-actions">
            <Button title="Retry failed uploads" onClick={() => void retrySync()} />
            <Button title="Review failed sales" variant="secondary" onClick={() => navigate('/sync-failures')} />
          </div>
        </section>
      ) : null}

      <section className="settings-card">
        <h2 style={text.headline}>Data maintenance</h2>
        <p style={text.callout}>Free space on this device by removing old, fully synced sale records (local only).</p>
        <p className="hint">90+ days after server sync</p>
        <Button title="Clear old synced sales" variant="dangerOutline" onClick={() => setConfirmClear(true)} />
      </section>

      <section className="settings-card">
        <h2 style={text.headline}>Export sales</h2>
        <p className="hint">Date range uses local calendar dates (sold_at).</p>
        <div className="filter-pair">
          <TextField
            label="Start"
            value={exportStart}
            placeholder="YYYY-MM-DD"
            autoComplete="off"
            onChange={(event) => {
              setExportStart(event.target.value);
              if (exportError) setExportError(null);
            }}
          />
          <TextField
            label="End"
            value={exportEnd}
            placeholder="YYYY-MM-DD"
            autoComplete="off"
            onChange={(event) => {
              setExportEnd(event.target.value);
              if (exportError) setExportError(null);
            }}
          />
        </div>
        {exportError ? (
          <p className="field-error" style={{ color: 'var(--error)' }}>
            {exportError}
          </p>
        ) : null}
        <Button
          title={exporting ? 'Exporting CSV…' : 'Export & share CSV'}
          onClick={() => void exportCsv()}
          disabled={exporting}
        />
      </section>

      <section className="settings-card">
        <h2 style={text.headline}>Backup & restore</h2>
        <p style={text.title2}>{lastBackup}</p>
        <p className="hint" style={text.caption}>
          Last backup
        </p>
        <p className="hint">A daily backup runs when you open the app; you can create one anytime.</p>
        <div className="sheet-actions">
          <Button
            title={backingUp ? 'Creating backup…' : 'Create backup now'}
            onClick={() => void createBackup()}
            disabled={backingUp}
          />
          <Button title="Restore from backup" variant="dangerOutline" onClick={() => navigate('/backups')} />
        </div>
      </section>

      <Sheet open={confirmClear} title="Clear old sales?" onClose={() => setConfirmClear(false)} align="center">
        <p style={text.body}>
          This deletes local rows for fully synced sales older than 90 days. This cannot be undone.
        </p>
        <div className="sheet-actions">
          <Button title="Cancel" variant="secondary" onClick={() => setConfirmClear(false)} />
          <Button
            title={clearing ? 'Deleting…' : 'Delete'}
            variant="dangerOutline"
            onClick={() => void clearOldSales()}
            disabled={clearing}
          />
        </div>
      </Sheet>
    </Screen>
  );
}
