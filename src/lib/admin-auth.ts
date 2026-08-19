/**
 * @fileOverview Authorization guard for privileged Next.js Server Actions.
 *
 * SERVER-ONLY — do not import from client components.
 *
 * Background: every function exported from a `'use server'` file is registered
 * by Next.js as a publicly reachable RPC endpoint. Being "in the admin UI" is
 * therefore NOT an access control — any unauthenticated visitor can invoke the
 * action directly. Privileged server actions must call `requireAdmin()` with an
 * ID token minted by the caller's signed-in session.
 *
 * Admin determination is checked in two places, in order:
 *   1. The `admin` / `role` Firebase Auth custom claim (target state — cannot be
 *      forged from the client, and does not depend on Firestore rules).
 *   2. The `users/{uid}.role` Firestore field (current state — kept as a
 *      fallback so this works before claims have been backfilled).
 * Once every admin has the custom claim, delete step 2 (see setUserRole in
 * functions/src/index.ts, which writes both).
 */

import { adminAuth, adminFirestore } from '@/lib/firebase-admin';

/** Thrown when the caller is not a signed-in admin. Message is user-facing. */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export interface AdminIdentity {
  uid: string;
  email?: string;
}

/**
 * Verify that `idToken` belongs to a currently signed-in admin.
 * Throws AuthorizationError on any failure. Never returns for a non-admin.
 */
export async function requireAdmin(idToken: string | null | undefined): Promise<AdminIdentity> {
  if (!idToken || typeof idToken !== 'string') {
    throw new AuthorizationError('この操作には管理者としてのログインが必要です。');
  }

  let decoded;
  try {
    // checkRevoked: an admin whose session was revoked must lose access at once.
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    throw new AuthorizationError('認証情報が無効か、有効期限が切れています。再度ログインしてください。');
  }

  // 1. Custom claims.
  if (decoded.admin === true || decoded.role === 'admin') {
    return { uid: decoded.uid, email: decoded.email };
  }

  // 2. Firestore role fallback. Read with the Admin SDK so it does not depend
  //    on the caller-side security rules.
  const snap = await adminFirestore().collection('users').doc(decoded.uid).get();
  if (!snap.exists || snap.data()?.role !== 'admin') {
    throw new AuthorizationError('この操作には管理者権限が必要です。');
  }

  return { uid: decoded.uid, email: decoded.email };
}

/**
 * Wrap requireAdmin for actions that report failure as a value rather than by
 * throwing, so the admin UI can render the message inline.
 */
export async function checkAdmin(
  idToken: string | null | undefined,
): Promise<{ ok: true; identity: AdminIdentity } | { ok: false; error: string }> {
  try {
    return { ok: true, identity: await requireAdmin(idToken) };
  } catch (error: any) {
    return { ok: false, error: error?.message || '管理者権限が確認できませんでした。' };
  }
}
