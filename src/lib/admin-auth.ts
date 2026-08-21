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
 * Admin determination reads the `admin` / `role` Firebase Auth custom claim and
 * nothing else. The claim can only be written by the Admin SDK (setUserRole in
 * functions/src/index.ts), so it cannot be forged from the client and does not
 * depend on Firestore rules. The `users/{uid}.role` Firestore field is display
 * metadata for the admin UI; it was accepted as a fallback until 2026-08-21,
 * when every admin had been given the claim (docs/SECURITY-V1-URGENT-FIXES.md).
 */

import { adminAuth } from '@/lib/firebase-admin';

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

  if (decoded.admin !== true && decoded.role !== 'admin') {
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
