import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { colors, text } from '@/theme';

type Props = {
  label: string;
  error?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'children'>;

export function TextField({ label, error, leftIcon, rightSlot, id, ...rest }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="field">
      <label className="field-label" style={text.footnote} htmlFor={inputId}>
        {label}
      </label>
      <div className={`field-shell${error ? ' field-shell-error' : ''}`}>
        {leftIcon ? <span className="field-icon">{leftIcon}</span> : null}
        <input
          {...rest}
          id={inputId}
          className="field-input"
          style={text.body}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
        {rightSlot ? <span className="field-slot">{rightSlot}</span> : null}
      </div>
      {error ? (
        <p className="field-error" id={errorId} style={{ ...text.caption, color: colors.error }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
