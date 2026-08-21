import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";

/**
 * Require an authenticated admin caller for the mail callables.
 *
 * Mirrors requireAdmin() in functions/src/index.ts: admin state is the Firebase
 * Auth custom claim (written only by setUserRole via the Admin SDK), never the
 * users/{uid}.role Firestore field, which is display metadata for the admin UI.
 * See docs/SECURITY-V1-URGENT-FIXES.md for the migration record.
 */
export async function requireAdmin(request: CallableRequest<unknown>): Promise<{ uid: string }> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  const token = (request.auth?.token ?? {}) as { admin?: unknown; role?: unknown };
  if (token.admin !== true && token.role !== "admin") {
    throw new HttpsError("permission-denied", "Admin role required.");
  }
  return { uid };
}
