import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { log } from "firebase-functions/logger";
import * as crypto from "crypto";
import { google } from "googleapis";
import { requireAdmin } from "./lib/auth";
import { buildOAuth2Client, getOAuthClientConfig, GmailAuthError } from "./lib/gmail";
import { encryptString } from "./lib/kms";
import type { MailAccount, MailGmailToken } from "./types";

const REGION = "us-central1";
const SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email"];

interface OAuthStartInput {
  accountId?: string;
  displayName?: string;
}

export const gmailOAuthStart = onCall({ region: REGION }, async (request) => {
  const { uid } = await requireAdmin(request);
  const { accountId, displayName } = (request.data || {}) as OAuthStartInput;

  let cfg;
  try {
    cfg = await getOAuthClientConfig();
  } catch (err: any) {
    throw new HttpsError("failed-precondition", err?.message || "OAuth client not configured.");
  }

  const db = getFirestore();
  let targetAccountId = accountId;
  let mode: "create" | "reauth" = "reauth";

  if (!targetAccountId) {
    mode = "create";
    const newRef = db.collection("mail_accounts").doc();
    targetAccountId = newRef.id;
    const placeholder: MailAccount = {
      displayName: displayName || "（認証中）",
      email: "",
      provider: "gmail_oauth",
      status: "pending_oauth",
      isDefault: false,
      createdBy: uid,
      consecutiveFailures: 0,
      lastError: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await newRef.set(placeholder);
  } else {
    const snap = await db.collection("mail_accounts").doc(targetAccountId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Account not found.");
    const data = snap.data() as MailAccount;
    if (data.provider !== "gmail_oauth") {
      throw new HttpsError("failed-precondition", "Account is not gmail_oauth.");
    }
  }

  const state = crypto.randomBytes(24).toString("hex");
  await db.collection("oauth_states").doc(state).set({
    uid,
    accountId: targetAccountId,
    mode,
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
    scope: "gmail",
  });

  const oauth2 = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });

  log(`[gmailOAuthStart] uid=${uid} accountId=${targetAccountId} mode=${mode}`);
  return { authUrl: url, accountId: targetAccountId };
});

const HTML_RESULT = (title: string, message: string, ok: boolean) => `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>${title}</title>
<style>
body { font-family: -apple-system, 'Helvetica Neue', sans-serif; background: #f4f4f7; margin: 0; padding: 32px; }
.card { max-width: 480px; margin: 64px auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); text-align: center; }
h1 { font-size: 18px; margin: 0 0 12px; color: ${ok ? "#16a34a" : "#dc2626"}; }
p { color: #4b5563; line-height: 1.6; font-size: 14px; }
small { color: #9ca3af; font-size: 12px; }
</style></head>
<body><div class="card">
<h1>${title}</h1>
<p>${message}</p>
<small>このウィンドウは自動的に閉じます。</small>
</div>
<script>setTimeout(() => { try { window.close(); } catch(_){} }, 3000);</script>
</body></html>`;

export const gmailOAuthCallback = onRequest({ region: REGION, cors: false }, async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const errorParam = req.query.error as string | undefined;

  if (errorParam) {
    res.status(400).send(HTML_RESULT("認証がキャンセルされました", `Google からのエラー: ${errorParam}`, false));
    return;
  }
  if (!code || !state) {
    res.status(400).send(HTML_RESULT("不正なリクエスト", "code または state パラメータがありません。", false));
    return;
  }

  const db = getFirestore();
  const stateRef = db.collection("oauth_states").doc(state);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) {
    res.status(400).send(HTML_RESULT("セッション無効", "認証セッションが見つかりません。再度お試しください。", false));
    return;
  }
  const stateData = stateSnap.data() as any;
  const expires = stateData.expiresAt instanceof Timestamp ? stateData.expiresAt.toMillis() : 0;
  if (Date.now() > expires) {
    await stateRef.delete();
    res.status(400).send(HTML_RESULT("セッション期限切れ", "認証セッションが期限切れです。最初からやり直してください。", false));
    return;
  }

  const accountId = stateData.accountId as string;
  const mode = stateData.mode as "create" | "reauth";
  const accountRef = db.collection("mail_accounts").doc(accountId);

  try {
    const oauth2 = await buildOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new GmailAuthError("Gmail did not return refresh_token. Try revoking access in Google Account permissions and retry.");
    }
    oauth2.setCredentials(tokens);

    const userInfo = await google.oauth2({ version: "v2", auth: oauth2 }).userinfo.get();
    const email = userInfo.data.email;
    if (!email) throw new GmailAuthError("Could not resolve account email from Google.");

    // 重複チェック (同 email の active アカウント)
    const dup = await db
      .collection("mail_accounts")
      .where("email", "==", email)
      .where("status", "==", "active")
      .get();
    const dupOther = dup.docs.find((d) => d.id !== accountId);
    if (dupOther) {
      if (mode === "create") {
        await accountRef.delete();
      }
      await stateRef.delete();
      res.status(409).send(HTML_RESULT("重複アカウント", `${email} は既に登録されています。`, false));
      return;
    }

    const [encA, encR] = await Promise.all([
      encryptString(tokens.access_token),
      encryptString(tokens.refresh_token),
    ]);

    const tokenDoc: MailGmailToken = {
      encryptedAccessToken: encA.ciphertext,
      encryptedRefreshToken: encR.ciphertext,
      scope: (tokens.scope as string) || SCOPES.join(" "),
      tokenType: tokens.token_type || "Bearer",
      expiryDate: tokens.expiry_date ?? null,
      kmsKeyVersion: encA.kmsKeyVersion,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.collection("mail_gmail_tokens").doc(accountId).set(tokenDoc, { merge: true });

    // 既定アカウント不在なら昇格
    const existingDefault = await db
      .collection("mail_accounts")
      .where("isDefault", "==", true)
      .limit(1)
      .get();
    const promoteDefault = existingDefault.empty;

    const accountUpdate: Partial<MailAccount> = {
      email,
      status: "active",
      consecutiveFailures: 0,
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const cur = await accountRef.get();
    const curData = cur.data() as MailAccount | undefined;
    if (!curData?.displayName || curData.displayName === "（認証中）") {
      accountUpdate.displayName = email;
    }
    if (promoteDefault) accountUpdate.isDefault = true;

    await accountRef.update(accountUpdate);
    await stateRef.delete();

    log(`[mail.gmail] OAuth complete accountId=${accountId} email=${email} mode=${mode}`);
    res.status(200).send(
      HTML_RESULT(
        "認証完了",
        `${email} を送信元アカウントとして登録しました。設定画面に戻ります。`,
        true
      )
    );
  } catch (err: any) {
    log("[gmailOAuthCallback] error:", err?.message || err);
    if (mode === "create") {
      try {
        await accountRef.delete();
      } catch (_) {
        /* ignore */
      }
    }
    await stateRef.delete().catch(() => {});
    res.status(500).send(HTML_RESULT("認証エラー", err?.message || "認証に失敗しました。", false));
  }
});
