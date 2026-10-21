import { useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, text } from '@/theme';

export function LoginPage() {
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <Screen header={<GlassHeader title="Sign in" backTo="/" />}>
      <div className="hero hero-compact">
        <img className="hero-mark" src="/icons/icon-192.png" width={80} height={80} alt="" />
        <p style={text.title1}>NutaPOS</p>
        <p style={text.callout}>Sign in</p>
      </div>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <TextField
          label="Staff ID"
          name="staffId"
          placeholder="Your Staff ID"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
          leftIcon={<PersonIcon />}
        />
        <TextField
          label="Password"
          name="password"
          placeholder="Enter your password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          leftIcon={<LockIcon />}
          rightSlot={
            <button
              type="button"
              className="icon-button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          }
        />
        <Button title="Sign in" type="submit" disabled />
      </form>
    </Screen>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke={colors.zinc500} strokeWidth="1.7" />
      <path d="M5.5 19.2c1.4-2.6 3.6-3.7 6.5-3.7s5.1 1.1 6.5 3.7" stroke={colors.zinc500} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
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
