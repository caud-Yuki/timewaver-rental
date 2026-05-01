import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { log } from "firebase-functions/logger";
import axios from "axios";
import { requireAdmin } from "./lib/auth";
import { decryptString } from "./lib/kms";
import type { MailAccount, MailGmailToken } from "./types";

const REGION = "us-central1";

export const revokeGmailAuth = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request);
  const { accountId } = request.data as { accountId?: string };
  if (!accountId) throw new HttpsError("invalid-argument", "accountId is required.");

  const db = getFirestore();
  const accountRef = db.collection("mail_accounts").doc(accountId);
  const tokenRef = db.collection("mail_gmail_tokens").doc(accountId);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw new HttpsError("not-found", "Account not found.");
  const account = accountSnap.data() as MailAccount;
  if (account.provider !== "gmail_oauth") {
    throw new HttpsError("failed-precondition", "Account is not gmail_oauth.");
  }

  const tokenSnap = await tokenRef.get();
  if (tokenSnap.exists) {
    const t = tokenSnap.data() as MailGmailToken;
    try {
      const refresh = await decryptString(t.encryptedRefreshToken);
      await axios.post("https://oauth2.googleapis.com/revoke", null, {
        params: { token: refresh },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      });
    } catch (err: any) {
      log("[revokeGmailAuth] Google revoke failed (continuing):", err?.message || err);
    }
  }

  const batch = db.batch();
  batch.delete(tokenRef);
  batch.update(accountRef, {
    status: "revoked",
    isDefault: false,
    consecutiveFailures: 0,
    lastError: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  // 既定が消えた場合は最古 active を昇格
  if (account.isDefault) {
    const candidates = await db
      .collection("mail_accounts")
      .where("status", "==", "active")
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();
    if (!candidates.empty) {
      await candidates.docs[0].ref.update({
        isDefault: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  log(`[mail.gmail.revoke] accountId=${accountId} email=${account.email}`);
  return { success: true };
});
