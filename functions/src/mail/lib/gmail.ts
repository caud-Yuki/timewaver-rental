import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { log } from "firebase-functions/logger";
import { decryptString } from "./kms";
import { readSecret } from "./secrets";
import {
  buildHtmlBody,
  encodeUtf8Subject,
  getEmailDesign,
  getServiceName,
} from "./template";
import type { MailGmailToken, MailAccount } from "../types";

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export interface GmailOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getRedirectUri(): string {
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    "studio-3681859885-cd9c1";
  return `https://us-central1-${projectId}.cloudfunctions.net/gmailOAuthCallback`;
}

export async function getOAuthClientConfig(): Promise<GmailOAuthClientConfig> {
  const [clientId, clientSecret] = await Promise.all([
    readSecret("GMAIL_OAUTH_CLIENT_ID"),
    readSecret("GMAIL_OAUTH_CLIENT_SECRET"),
  ]);
  if (!clientId || !clientSecret) {
    throw new GmailAuthError(
      "Gmail OAuth credentials are not configured. Please set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in Secret Manager."
    );
  }
  return { clientId, clientSecret, redirectUri: getRedirectUri() };
}

export async function buildOAuth2Client() {
  const cfg = await getOAuthClientConfig();
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

export async function getDecryptedTokens(accountId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate?: number | null;
}> {
  const db = getFirestore();
  const tokenSnap = await db.collection("mail_gmail_tokens").doc(accountId).get();
  if (!tokenSnap.exists) {
    throw new GmailAuthError(`No Gmail tokens for account ${accountId}`);
  }
  const t = tokenSnap.data() as MailGmailToken;
  const [accessToken, refreshToken] = await Promise.all([
    decryptString(t.encryptedAccessToken),
    decryptString(t.encryptedRefreshToken),
  ]);
  return { accessToken, refreshToken, expiryDate: t.expiryDate ?? null };
}

export interface SendInput {
  to: string;
  subject: string;
  body: string;
  isAdmin?: boolean;
}

export async function sendViaGmail(
  account: MailAccount & { id: string },
  input: SendInput
): Promise<void> {
  const { accessToken, refreshToken, expiryDate } = await getDecryptedTokens(
    account.id
  );
  const oauth2 = await buildOAuth2Client();
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate ?? undefined,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const design = await getEmailDesign();
  const serviceName = await getServiceName();
  const html = buildHtmlBody(input.body, input.subject, input.isAdmin, design, serviceName);

  const fromName = account.fromName || serviceName;
  const subjectEnc = encodeUtf8Subject(input.subject);
  const messageParts = [
    `From: ${fromName} <${account.email}>`,
    `To: ${input.to}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subjectEnc}`,
    "",
    html,
  ];
  const raw = Buffer.from(messageParts.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    log(`[Gmail] sent from ${account.email} to ${input.to}`);
  } catch (err: any) {
    const code = err?.response?.status || err?.code;
    const msg = err?.response?.data?.error || err?.message || "unknown";
    log(`[Gmail] send error code=${code} msg=`, msg);
    if (code === 401 || code === 403) {
      throw new GmailAuthError(`Gmail send failed: ${code}`);
    }
    throw new Error(`Gmail send failed: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
}
