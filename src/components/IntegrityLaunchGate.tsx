import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { databaseIntegrityService, type IntegrityReport } from '@/services/databaseIntegrityService';
import { text } from '@/theme';

/** Runs once after the database is open. A healthy database does not block POS. */
export function IntegrityLaunchGate() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [report, setReport] = useState<IntegrityReport | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void databaseIntegrityService.checkFull()
      .then((result) => {
        if (!result.healthy) setReport(result);
      })
      .catch((error: unknown) => {
        setReport({
          healthy: false,
          pragmaCorrupt: false,
          errors: [error instanceof Error ? error.message : 'Database check failed'],
        });
      });
  }, []);

  if (!report) return null;

  return (
    <Sheet open title="Database issue detected" onClose={() => setReport(null)} align="center" dismissible={false}>
      <p style={text.body}>
        This browser database has no SQLite PRAGMA integrity_check. {report.errors.join('\n')}
      </p>
      <div className="sheet-actions">
        <Button title="Continue anyway" variant="secondary" onClick={() => setReport(null)} />
        <Button
          title="Open backups"
          onClick={() => {
            setReport(null);
            navigate('/backups');
          }}
        />
      </div>
    </Sheet>
  );
}
