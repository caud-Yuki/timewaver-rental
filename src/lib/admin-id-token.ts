'use client';

/**
 * @fileOverview Client helper for calling admin-only Server Actions.
 *
 * Server Actions are public HTTP endpoints — Next.js attaches no session to
 * them. Privileged actions therefore take a Firebase ID token as their first
 * argument and verify it server-side (see src/lib/admin-auth.ts). This helper
 * produces that token from the currently signed-in user.
 */

import { getAuth } from 'firebase/auth';
import { getApp, getApps } from 'firebase/app';

/**
 * Get a Firebase ID token for the signed-in user.
 *
 * @param forceRefresh Pass true right after a role change so freshly granted
 *   custom claims are present without requiring a re-login.
 * @throws when nobody is signed in — the caller should surface a sign-in prompt.
 */
export async function getAdminIdToken(forceRefresh = false): Promise<string> {
  if (getApps().length === 0) {
    throw new Error('Firebase が初期化されていません。ページを再読み込みしてください。');
  }
  const user = getAuth(getApp()).currentUser;
  if (!user) {
    throw new Error('ログインが必要です。再度ログインしてください。');
  }
  return user.getIdToken(forceRefresh);
}
