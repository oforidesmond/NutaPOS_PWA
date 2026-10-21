import { useEffect, useState } from 'react';
import { subscribeToast } from '@/components/toast';
import { text } from '@/theme';

type Item = { id: number; title: string; body?: string };

export function ToastHost() {
  const [item, setItem] = useState<Item | null>(null);

  useEffect(() => subscribeToast(setItem), []);

  useEffect(() => {
    if (!item) return;
    const timer = window.setTimeout(() => setItem(null), 4000);
    return () => window.clearTimeout(timer);
  }, [item]);

  if (!item) return null;

  return (
    <div className="toast" role="status" style={text.footnote}>
      <p style={text.subheadline}>{item.title}</p>
      {item.body ? <p>{item.body}</p> : null}
    </div>
  );
}
