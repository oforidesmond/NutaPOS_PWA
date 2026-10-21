import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { showToast } from '@/components/toast';
import { useAuth } from '@/context/AuthContext';
import { text } from '@/theme';

export function PosPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const onSignOut = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      showToast('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  return (
    <Screen
      layout="pos"
      header={
        <GlassHeader
          title="New Sale"
          trailing={
            <button type="button" className="header-action" onClick={() => void onSignOut()}>
              Sign out
            </button>
          }
        />
      }
    >
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
