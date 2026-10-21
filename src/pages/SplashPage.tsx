import { Button } from '@/components/Button';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { text } from '@/theme';

export function SplashPage() {
  return (
    <Screen header={<GlassHeader title="NutaPOS Staff" />}>
      <div className="hero">
        <img className="hero-mark" src="/icons/icon-192.png" width={80} height={80} alt="" />
        <p style={text.largeTitle}>NutaPOS Staff</p>
        <p style={text.callout}>Cashier</p>
      </div>
      <Button title="Sign in" to="/login" />
    </Screen>
  );
}
