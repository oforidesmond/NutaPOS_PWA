import { afterEach, describe, expect, it, vi } from 'vitest';
import { installSetupBackTrap } from '@/components/InitialSyncOverlay';

describe('installSetupBackTrap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pushes the captured overlay URL on popstate', () => {
    const pushes: string[] = [];
    const listeners: Array<{ type: string; fn: () => void; capture?: boolean }> = [];
    vi.stubGlobal('window', {
      history: {
        pushState: (_state: unknown, _title: string, url?: string | URL | null) => {
          pushes.push(String(url));
        },
      },
      addEventListener: (type: string, fn: () => void, capture?: boolean) => {
        listeners.push({ type, fn, capture });
      },
      removeEventListener: (type: string, fn: () => void) => {
        const index = listeners.findIndex((item) => item.type === type && item.fn === fn);
        if (index >= 0) listeners.splice(index, 1);
      },
    });

    const onTrapped = vi.fn();
    const remove = installSetupBackTrap('http://localhost/', onTrapped);
    const pop = listeners.find((item) => item.type === 'popstate');

    expect(pushes).toEqual(['http://localhost/']);
    expect(pop?.capture).toBe(true);
    pop?.fn();
    expect(pushes).toEqual(['http://localhost/', 'http://localhost/']);
    expect(onTrapped).toHaveBeenCalledOnce();

    remove();
    expect(listeners.some((item) => item.type === 'popstate')).toBe(false);
  });
});
