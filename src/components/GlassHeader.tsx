import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ConnectionIcon } from '@/components/ConnectionIcon';
import { useOnline } from '@/components/useOnline';
import { text } from '@/theme';

type Props = {
  title: string;
  backTo?: string;
  trailing?: ReactNode;
};

export function GlassHeader({ title, backTo, trailing }: Props) {
  const online = useOnline();

  return (
    <header className="glass-header">
      <div className="glass-header-row">
        <div className="glass-header-left">
          {backTo ? (
            <Link to={backTo} className="header-back" aria-label="Back">
              <BackIcon />
            </Link>
          ) : null}
          <ConnectionIcon online={online} />
          <h1 className="glass-title" style={text.headline}>
            {title}
          </h1>
        </div>
        {trailing ? <div className="glass-header-trailing">{trailing}</div> : null}
      </div>
    </header>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
