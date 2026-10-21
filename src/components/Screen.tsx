import type { CSSProperties, ReactNode } from 'react';
import { cssVars } from '@/theme';

type Layout = 'column' | 'pos';

type Props = {
  header: ReactNode;
  children: ReactNode;
  layout?: Layout;
};

export function Screen({ header, children, layout = 'column' }: Props) {
  return (
    <div className="screen" style={cssVars as CSSProperties}>
      {header}
      <main className={layout === 'pos' ? 'pos-frame' : 'page-column'}>{children}</main>
    </div>
  );
}
