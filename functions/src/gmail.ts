import { log } from "firebase-functions/logger";
import { sendViaAccount } from "./mail/lib/sendDispatcher";

/**
 * Send a transactional email via the configured default mail account.
 *
 * Backed by the multi-account dispatcher (mail_accounts collection).
 * The dispatcher resolves the default active account, decrypts its provider
 * credentials (Gmail OAuth or SMTP), wraps the body in the unified HTML
 * template, and delegates the actual send to the appropriate provider.
 *
 * If no active mail_account exists, throws HttpsError(failed-precondition).
 */
export async function sendMail(
  to: string,
  subject: string,
  body: string,
  isAdmin?: boolean
): Promise<void> {
  log(`[sendMail] to=${to} subject=${subject}`);
  await sendViaAccount({ to, subject, body, isAdmin });
}
