import { useEffect } from 'react';
import { Button } from '@/components/Button';
import { showToast } from '@/components/toast';
import { colors, text } from '@/theme';

type Props = {
  visible: boolean;
  stepLabel: string;
  progress: number;
  error: string | null;
  onRetry: () => void;
  onBackToSignIn: () => void;
};

export function InitialSyncOverlay({ visible, stepLabel, progress, error, onRetry, onBackToSignIn }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  useEffect(() => {
    if (!visible || !error) return;
    const trap = () => {
      window.history.pushState(null, '', window.location.href);
      showToast('Setup paused', 'Use Retry or Back to sign in to continue.');
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', trap);
    return () => window.removeEventListener('popstate', trap);
  }, [visible, error]);

  if (!visible) return null;

  return (
    <div className="sync-overlay">
      <div className="sync-overlay-inner">
        <h1 style={text.title2}>Setting up NutaPOS</h1>
        <p className="sync-step" style={text.body}>
          {stepLabel}
        </p>
        <div
          className="sync-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={stepLabel}
        >
          <div className="sync-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="sync-pct" style={{ ...text.footnote, color: colors.zinc500 }}>
          {pct}%
        </p>
        {error ? (
          <div className="sync-error">
            <p role="alert" style={{ ...text.callout, color: colors.error }}>
              {error}
            </p>
            <p style={{ ...text.footnote, color: colors.zinc600 }}>
              You can try setup again, or sign out and sign back in.
            </p>
            <Button title="Retry" variant="secondary" onClick={onRetry} />
            <Button title="Back to sign in" variant="ghost" onClick={onBackToSignIn} />
          </div>
        ) : (
          <div className="sync-spinner" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
