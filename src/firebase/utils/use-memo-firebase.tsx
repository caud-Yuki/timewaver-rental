'use client';

import { useMemo, useRef } from 'react';

/**
 * A hook to stabilize Firebase references (CollectionReference, DocumentReference, Query)
 * across renders. It only recalculates the reference if the dependencies change.
 */
export function useMemoFirebase<T>(factory: () => T, deps: React.DependencyList): T {
  // Use a ref to store the actual object but useMemo to handle the dependency logic.
  // This is a common pattern for objects that don't have stable identity but have stable structure.
  return useMemo(factory, deps);
}
