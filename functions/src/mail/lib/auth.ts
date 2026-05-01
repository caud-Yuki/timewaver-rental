import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";

export async function requireAdmin(request: CallableRequest<unknown>): Promise<{ uid: string }> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  const db = getFirestore();
  const snap = await db.collection("users").doc(uid).get();
  const role = snap.exists ? (snap.data()?.role as string | undefined) : undefined;
  if (role !== "admin") {
    throw new HttpsError("permission-denied", "Admin role required.");
  }
  return { uid };
}
