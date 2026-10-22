import { useEffect, useRef } from 'react';

const GAP_MS = 50;
const MIN_LENGTH = 3;

/** USB keyboard-wedge scans: a fast burst of characters ending in Enter. */
export function useWedgeScanner(enabled: boolean, onScan: (code: string) => void): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let last = 0;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (event.key === 'Enter') {
        const code = buffer.trim();
        buffer = '';
        last = 0;
        if (code.length >= MIN_LENGTH) {
          event.preventDefault();
          onScanRef.current(code);
        }
        return;
      }
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      const now = Date.now();
      if (now - last > GAP_MS) buffer = '';
      buffer += event.key;
      last = now;
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
