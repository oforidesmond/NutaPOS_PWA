import { text } from '@/theme';

type Props = {
  message: string | null;
  variant?: 'error' | 'warning';
};

export function FeedbackBanner({ message, variant = 'error' }: Props) {
  if (!message) return null;
  return (
    <p className={variant === 'warning' ? 'banner-warning' : 'banner-error'} role="alert" style={text.footnote}>
      {message}
    </p>
  );
}
