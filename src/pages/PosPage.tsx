import { EmptyState } from '@/components/EmptyState';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { text } from '@/theme';

export function PosPage() {
  return (
    <Screen layout="pos" header={<GlassHeader title="New Sale" backTo="/" />}>
      <section className="pane" aria-label="Catalog and search">
        <h2 style={text.title2}>Catalog and search</h2>
        <EmptyState />
      </section>
      <section className="pane" aria-label="Cart and checkout">
        <h2 style={text.title2}>Cart and checkout</h2>
        <EmptyState />
      </section>
    </Screen>
  );
}
