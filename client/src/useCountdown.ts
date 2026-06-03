import { useEffect, useState } from 'react';
import { getServerNow } from './socket';

// Returns milliseconds remaining until `targetTs` (server epoch ms), ticking on
// animation frames against the clock-synced server time. Clamps at 0.
export function useCountdown(targetTs: number | null): number {
  const [remaining, setRemaining] = useState(() =>
    targetTs == null ? 0 : Math.max(0, targetTs - getServerNow()),
  );

  useEffect(() => {
    if (targetTs == null) {
      setRemaining(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setRemaining(Math.max(0, targetTs - getServerNow()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetTs]);

  return remaining;
}
