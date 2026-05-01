import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { log } from "firebase-functions/logger";
import { requireAdmin } from "./lib/auth";
import {
  saveSmtpCredential,
  verifySmtpCredential,
  getDecryptedSmtpCredential,
} from "./lib/smtp";
import { sendViaAccount } from "./lib/sendDispatcher";
import type { MailAccount, MailAccountPublic } from "./types";

const REGION = "us-central1";

function toPublic(id: string, data: MailAccount): MailAccountPublic {
  const ts = (v: any): string | null => {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate().toISOString();
    if (typeof v?.toDate === "function") return v.toDate().toISOString();
    return null;
  };
  return {
    id,
    displayName: data.displayName,
    email: data.email,
    provider: data.provider,
    status: data.status,
    isDefault: !!data.isDefault,
    fromName: data.fromName,
    consecutiveFailures: data.consecutiveFailures ?? 0,
    lastError: data.lastError ?? null,
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  };
}

export const listMailAccounts = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request);
  const db = getFirestore();
  const snap = await db.collection("mail_accounts").orderBy("createdAt", "asc").get();
  const accounts = snap.docs.map((d) => toPublic(d.id, d.data() as MailAccount));
  return { accounts };
});

interface CreateSmtpInput {
  displayName: string;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName?: string;
  setAsDefault?: boolean;
}

export const createSmtpAccount = onCall({ region: REGION }, async (request) => {
  const { uid } = await requireAdmin(request);
  const data = request.data as CreateSmtpInput;
  const required = ["displayName", "email", "host", "port", "username", "password"] as const;
  for (const k of required) {
    if (!data?.[k] && data?.[k] !== 0) {
      throw new HttpsError("invalid-argument", `${k} is required.`);
    }
  }

  try {
    await verifySmtpCredential({
      host: data.host,
      port: data.port,
      secure: !!data.secure,
      username: data.username,
      password: data.password,
    });
  } catch (err: any) {
    throw new HttpsError("invalid-argument", `SMTP接続検証に失敗しました: ${err?.message || err}`);
  }

  const db = getFirestore();
  const ref = db.collection("mail_accounts").doc();

  await saveSmtpCredential(ref.id, {
    host: data.host,
    port: data.port,
    secure: !!data.secure,
    username: data.username,
    password: data.password,
  }, data.fromName);

  const existingDefault = await db
    .collection("mail_accounts")
    .where("isDefault", "==", true)
    .limit(1)
    .get();
  const isDefault = !!data.setAsDefault || existingDefault.empty;

  const accountData: MailAccount = {
    displayName: data.displayName,
    email: data.email,
    provider: "smtp",
    status: "active",
    isDefault,
    fromName: data.fromName,
    consecutiveFailures: 0,
    lastError: null,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (isDefault && !existingDefault.empty) {
    const batch = db.batch();
    existingDefault.forEach((d) =>
      batch.update(d.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() })
    );
    batch.set(ref, accountData);
    await batch.commit();
  } else {
    await ref.set(accountData);
  }

  log(`[mail.account.create] smtp ${ref.id} (${data.email})`);
  return { accountId: ref.id };
});

interface UpdateSmtpInput extends Partial<CreateSmtpInput> {
  accountId: string;
}

export const updateSmtpAccount = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request);
  const data = request.data as UpdateSmtpInput;
  if (!data?.accountId) throw new HttpsError("invalid-argument", "accountId is required.");

  const db = getFirestore();
  const ref = db.collection("mail_accounts").doc(data.accountId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Account not found.");
  const current = snap.data() as MailAccount;
  if (current.provider !== "smtp") {
    throw new HttpsError("failed-precondition", "Only SMTP accounts are editable here.");
  }

  let password = data.password;
  if (!password) {
    const decrypted = await getDecryptedSmtpCredential(data.accountId);
    password = decrypted.password;
  }

  try {
    await verifySmtpCredential({
      host: data.host ?? "",
      port: data.port ?? 0,
      secure: !!data.secure,
      username: data.username ?? "",
      password,
    });
  } catch (err: any) {
    throw new HttpsError("invalid-argument", `SMTP接続検証に失敗しました: ${err?.message || err}`);
  }

  await saveSmtpCredential(data.accountId, {
    host: data.host!,
    port: data.port!,
    secure: !!data.secure,
    username: data.username!,
    password,
  }, data.fromName);

  await ref.update({
    displayName: data.displayName ?? current.displayName,
    email: data.email ?? current.email,
    fromName: data.fromName ?? current.fromName ?? null,
    status: "active",
    consecutiveFailures: 0,
    lastError: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { success: true };
});

export const deleteMailAccount = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request);
  const { accountId } = request.data as { accountId?: string };
  if (!accountId) throw new HttpsError("invalid-argument", "accountId is required.");

  const db = getFirestore();
  const ref = db.collection("mail_accounts").doc(accountId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Account not found.");
  const data = snap.data() as MailAccount;

  const batch = db.batch();
  if (data.provider === "gmail_oauth") {
    batch.delete(db.collection("mail_gmail_tokens").doc(accountId));
  } else if (data.provider === "smtp") {
    batch.delete(db.collection("mail_smtp_credentials").doc(accountId));
  }
  batch.delete(ref);
  await batch.commit();

  // 既定アカウント削除時、最古 active を新既定に昇格
  if (data.isDefault) {
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

  log(`[mail.account.delete] ${accountId} (${data.email})`);
  return { success: true };
});

export const setDefaultMailAccount = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request);
  const { accountId } = request.data as { accountId?: string };
  if (!accountId) throw new HttpsError("invalid-argument", "accountId is required.");

  const db = getFirestore();
  const ref = db.collection("mail_accounts").doc(accountId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Account not found.");
  const data = snap.data() as MailAccount;
  if (data.status !== "active") {
    throw new HttpsError("failed-precondition", "Only active accounts can be set as default.");
  }

  const all = await db.collection("mail_accounts").get();
  const batch = db.batch();
  all.forEach((d) => {
    batch.update(d.ref, {
      isDefault: d.id === accountId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return { success: true };
});

export const testMailAccount = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request);
  const { accountId, toEmail } = request.data as { accountId?: string; toEmail?: string };
  if (!accountId || !toEmail) {
    throw new HttpsError("invalid-argument", "accountId and toEmail are required.");
  }

  const result = await sendViaAccount({
    accountId,
    to: toEmail,
    subject: "【テスト送信】メール送信設定の確認",
    body: `これは TWRENTAL-PLATFORM のメール設定からのテスト送信です。\n\n送信時刻: ${new Date().toLocaleString("ja-JP")}\nアカウント: ${accountId}\n\nこのメールが届いていれば、送信元アドレスは正常に動作しています。`,
    isAdmin: true,
  });

  log(`[mail.account.test] ${accountId} → ${toEmail} (${result.provider})`);
  return { success: true, provider: result.provider };
});
