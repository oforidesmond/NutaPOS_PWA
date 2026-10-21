import { text } from '@/theme';

type Props = {
  message?: string;
};

export function EmptyState({ message = 'Available in a later phase.' }: Props) {
  return (
    <div className="empty">
      <p style={text.callout}>{message}</p>
    </div>
  );
}
