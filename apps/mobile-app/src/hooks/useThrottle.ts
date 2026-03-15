import { useState, useEffect, useRef } from "react";

/**
 * Throttles a rapidly-changing value so the returned value updates
 * at most once every `interval` ms. The first value is emitted
 * immediately; subsequent values are rate-limited.
 *
 * @param value   The source value (e.g. progress from socket events)
 * @param interval  Minimum ms between updates (e.g. 1500)
 * @param bypassFn  Optional predicate — when true the value is emitted
 *                  immediately regardless of throttle (e.g. terminal progress)
 */
export function useThrottle<T>(
  value: T,
  interval: number,
  bypassFn?: (v: T) => boolean,
): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Bypass throttle for terminal values
    if (bypassFn?.(value)) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      lastUpdated.current = Date.now();
      setThrottledValue(value);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastUpdated.current;

    if (elapsed >= interval) {
      // Enough time passed — emit immediately
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      // Schedule a trailing update
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
        timerRef.current = null;
      }, interval - elapsed);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, interval, bypassFn]);

  return throttledValue;
}
