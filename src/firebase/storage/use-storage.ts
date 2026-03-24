'use client';

import { useFirebase } from '@/firebase/provider';

/**
 * Custom hook to get the Firebase Storage instance.
 * @returns The Firebase Storage instance.
 */
export function useStorage() {
  return useFirebase().storage;
}
