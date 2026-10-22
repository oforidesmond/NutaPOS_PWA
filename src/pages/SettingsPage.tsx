import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { showToast } from '@/components/toast';
import { prefsRepository } from '@/db/prefsRepository';
import { syncQueueRepository } from '@/db/syncQueueRepository';
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

export function SettingsPage() {
  const navigate = useNavigate();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [adminReview, setAdminReview] = useState(0);
  const [transportFailed, setTransportFailed] = useState(0);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    const stored = await prefsRepository.get<string>(prefsRepository.keys.lastSyncTime);
    setLastSync(typeof stored === 'string' ? stored : null);
    setAdminReview(await syncQueueRepository.countPendingAdminReview());
    setTransportFailed(await syncQueueRepository.countTransportFailures());
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

  return (
    <Screen header={<GlassHeader title="Settings" backTo="/pos" />}>
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
    </Screen>
  );
}
