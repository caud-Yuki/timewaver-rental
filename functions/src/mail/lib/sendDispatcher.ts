import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { log } from "firebase-functions/logger";
import { GmailAuthError, sendViaGmail } from "./gmail";
import { SmtpAuthError, sendViaSmtp } from "./smtp";
import type { MailAccount } from "../types";

const SMTP_FAILURE_THRESHOLD = 3;

export interface DispatchInput {
  accountId?: string;
  to: string;
  subject: string;
  body: string;
  isAdmin?: boolean;
}

export interface DispatchResult {
  accountId: string;
  provider: "gmail_oauth" | "smtp";
  email: string;
}

async function loadAccount(accountId: string): Promise<MailAccount & { id: string }> {
  const db = getFirestore();
  const snap = await db.collection("mail_accounts").doc(accountId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Mail account ${accountId} not found`);
  }
  const data = snap.data() as MailAccount;
  return { ...data, id: snap.id };
}

export async function resolveAccountId(): Promise<string> {
  const db = getFirestore();
  const defaultSnap = await db
    .collection("mail_accounts")
    .where("isDefault", "==", true)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (!defaultSnap.empty) return defaultSnap.docs[0].id;

  const fallbackSnap = await db
    .collection("mail_accounts")
    .where("status", "==", "active")
    .orderBy("createdAt", "asc")
    .limit(1)
    .get();
  if (!fallbackSnap.empty) return fallbackSnap.docs[0].id;

  throw new HttpsError(
    "failed-precondition",
    "送信元メールアドレスが設定されていません。基本設定 → メール設定タブから追加してください。"
  );
}

async function registerFailure(
  accountId: string,
  provider: "gmail_oauth" | "smtp",
  err: unknown
) {
  const db = getFirestore();
  const ref = db.collection("mail_accounts").doc(accountId);
  const message = (err as Error)?.message || "unknown";

  const isAuthError =
    err instanceof GmailAuthError || err instanceof SmtpAuthError;

  if (isAuthError && provider === "gmail_oauth") {
    await ref.update({
      status: "unauthorized",
      lastError: message,
      consecutiveFailures: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    log(`[mail.account.deactivate] gmail account ${accountId} → unauthorized: ${message}`);
    return;
  }

  if (isAuthError && provider === "smtp") {
    const snap = await ref.get();
    const current = (snap.data()?.consecutiveFailures as number | undefined) ?? 0;
    const next = current + 1;
    await ref.update({
      consecutiveFailures: next,
      lastError: message,
      status: next >= SMTP_FAILURE_THRESHOLD ? "unauthorized" : snap.data()?.status,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (next >= SMTP_FAILURE_THRESHOLD) {
      log(`[mail.account.deactivate] smtp account ${accountId} → unauthorized after ${next} failures`);
    }
    return;
  }

  await ref.update({
    lastError: message,
    consecutiveFailures: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function clearFailureCount(accountId: string) {
  const db = getFirestore();
  await db.collection("mail_accounts").doc(accountId).update({
    consecutiveFailures: 0,
    lastError: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function sendViaAccount(input: DispatchInput): Promise<DispatchResult> {
  const accountId = input.accountId || (await resolveAccountId());
  const account = await loadAccount(accountId);

  if (account.status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      `Mail account ${accountId} is not active (status=${account.status})`
    );
  }

  try {
    if (account.provider === "gmail_oauth") {
      await sendViaGmail(account, input);
    } else if (account.provider === "smtp") {
      await sendViaSmtp(account, input);
    } else {
      throw new HttpsError("invalid-argument", `Unknown provider: ${account.provider}`);
    }
    await clearFailureCount(account.id);
    return { accountId: account.id, provider: account.provider, email: account.email };
  } catch (err) {
    await registerFailure(account.id, account.provider, err);
    throw err;
  }
}
