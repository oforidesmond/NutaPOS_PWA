import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  dismissible?: boolean;
  align?: 'end' | 'center';
  children: ReactNode;
};

export function Sheet({ open, title, onClose, dismissible = true, align = 'end', children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className={`sheet-backdrop${align === 'center' ? ' sheet-backdrop-center' : ''}`}
      onMouseDown={() => {
        if (dismissible) onClose();
      }}
    >
      <div
        className={`sheet${align === 'center' ? ' sheet-center' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
