import { text } from '@/theme';

type Props = {
  message: string | null;
};

export function FeedbackBanner({ message }: Props) {
  if (!message) return null;
  return (
    <p className="banner-error" role="alert" style={text.footnote}>
      {message}
    </p>
  );
}
