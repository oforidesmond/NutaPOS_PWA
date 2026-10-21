import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/toast';
import { useAuth } from '@/context/AuthContext';
import { colors, text } from '@/theme';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const trimmedCurrent = current.trim();
  const trimmedNext = next.trim();
  const trimmedConfirm = confirm.trim();

  if (user && !user.needsPasswordChange) return <Navigate to="/" replace />;

  const currentError = attemptedSubmit && !trimmedCurrent ? 'Current password is required.' : undefined;
  const nextError =
    attemptedSubmit && trimmedNext.length < 8 ? 'New password must be at least 8 characters.' : undefined;
  const confirmError =
    attemptedSubmit && trimmedConfirm.length > 0 && trimmedNext !== trimmedConfirm
      ? 'Passwords do not match.'
      : attemptedSubmit && trimmedConfirm.length === 0
        ? 'Please confirm the new password.'
        : undefined;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setAttemptedSubmit(true);

    if (!trimmedCurrent) {
      setError('Enter your current password to continue.');
      return;
    }
    if (trimmedNext.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (!trimmedConfirm) {
      setError('Please confirm the new password.');
      return;
    }
    if (trimmedNext !== trimmedConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(trimmedCurrent, trimmedNext);
      showToast('Password updated', 'You can continue to the register.');
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<GlassHeader title="Change password" />}>
      <div className="password-intro">
        <h2 style={text.title2}>Set a new password</h2>
        <p style={text.body}>For security, you must change your temporary password before using the register.</p>
      </div>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <TextField
          label="Current password"
          name="currentPassword"
          type={showCurrent ? 'text' : 'password'}
          autoComplete="current-password"
          value={current}
          disabled={loading}
          error={currentError}
          onChange={(event) => {
            setCurrent(event.target.value);
            if (error) setError(null);
          }}
          leftIcon={<LockIcon />}
          rightSlot={
            <PasswordToggle
              shown={showCurrent}
              label="current password"
              onToggle={() => setShowCurrent((value) => !value)}
            />
          }
        />
        <TextField
          label="New password"
          name="newPassword"
          type={showNext ? 'text' : 'password'}
          autoComplete="new-password"
          value={next}
          disabled={loading}
          error={nextError}
          onChange={(event) => {
            setNext(event.target.value);
            if (error) setError(null);
          }}
          leftIcon={<LockIcon />}
          rightSlot={
            <PasswordToggle shown={showNext} label="new password" onToggle={() => setShowNext((value) => !value)} />
          }
        />
        <TextField
          label="Confirm new password"
          name="confirmPassword"
          type={showConfirm ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          disabled={loading}
          error={confirmError}
          onChange={(event) => {
            setConfirm(event.target.value);
            if (error) setError(null);
          }}
          leftIcon={<LockIcon />}
          rightSlot={
            <PasswordToggle
              shown={showConfirm}
              label="confirmed password"
              onToggle={() => setShowConfirm((value) => !value)}
            />
          }
        />
        <div className="error-slot">
          <FeedbackBanner message={error} />
        </div>
        <Button title={loading ? 'Updating password...' : 'Update password'} type="submit" disabled={loading} />
      </form>
    </Screen>
  );
}

function PasswordToggle({ shown, label, onToggle }: { shown: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" className="icon-button" aria-label={shown ? `Hide ${label}` : `Show ${label}`} onClick={onToggle}>
      {shown ? 'Hide' : 'Show'}
    </button>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="10.5" width="12" height="8.5" rx="2" stroke={colors.zinc500} strokeWidth="1.7" />
      <path d="M8.5 10.5V8.2a3.5 3.5 0 0 1 7 0v2.3" stroke={colors.zinc500} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
