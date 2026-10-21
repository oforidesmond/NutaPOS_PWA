import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { typography } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'dangerOutline';

type Props = {
  title: string;
  variant?: Variant;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  to?: string;
};

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  dangerOutline: 'btn-danger-outline',
};

export function Button({ title, variant = 'primary', disabled = false, type = 'button', onClick, to }: Props) {
  const className = `btn ${variantClass[variant]}`;
  const style: CSSProperties = typography.button;

  if (to && !disabled) {
    return (
      <Link className={className} style={style} to={to}>
        {title}
      </Link>
    );
  }

  return (
    <button className={className} style={style} type={type} disabled={disabled} onClick={onClick}>
      {title}
    </button>
  );
}
