import { EmptyState } from '@/components/EmptyState';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';

type Props = {
  title: string;
};

export function LaterPhasePage({ title }: Props) {
  return (
    <Screen header={<GlassHeader title={title} backTo="/" />}>
      <EmptyState />
    </Screen>
  );
}
