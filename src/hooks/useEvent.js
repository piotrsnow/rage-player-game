import { useCallback, useLayoutEffect, useRef } from 'react';

// Stable callback that always invokes the latest fn. Effects can depend on
// it without re-firing when captured state changes. Polyfill for React's
// upcoming useEffectEvent — swap to the native hook once it stabilises.
export function useEvent(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args) => ref.current(...args), []);
}
