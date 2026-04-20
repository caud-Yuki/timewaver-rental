
import { google } from "googleapis";
import * as path from "path";
import * as fs from "fs";
import { log } from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

const KEY_PATH = path.join(__dirname, "../serviceAccountKey.json");
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const ADMIN_EMAIL = "yukiteraoka@caudesign.jp";

let serviceAccountKey: any = null;
try {
  serviceAccountKey = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
  log(`[Gmail] Service account loaded: ${serviceAccountKey.client_email}`);
} catch (e) {
  log(`[Gmail] WARNING: Failed to load service account key from ${KEY_PATH}:`, e);
}

interface EmailDesign {
  primaryColor?: string;
  buttonColor?: string;
  buttonRadius?: string;
  fontFamily?: string;
  footerText?: string;
}

let cachedDesign: EmailDesign | null = null;
let cachedServiceName: string | null = null;
let designCacheTime = 0;

async function getEmailDesign(): Promise<EmailDesign> {
  const now = Date.now();
  // Cache for 5 minutes
  if (cachedDesign && now - designCacheTime < 300000) {
    return cachedDesign;
  }
  try {
    const db = getFirestore();
    const settingsDoc = await db.collection('settings').doc('global').get();
    const data = settingsDoc.data();
    cachedDesign = data?.emailDesign || {};
    cachedServiceName = data?.serviceName || null;
    designCacheTime = now;
    return cachedDesign!;
  } catch {
    return {};
  }
}

async function getServiceName(): Promise<string> {
  await getEmailDesign(); // ensures cache is populated
  return cachedServiceName || 'TimeWaverHub';
}

/**
 * Wrap email body content in the unified HTML email template.
 */
function wrapInTemplate(bodyContent: string, isStaff: boolean, design: EmailDesign, serviceName: string): string {
  const d = {
    primaryColor: design.primaryColor || '#2563eb',
    buttonColor: design.buttonColor || '#2563eb',
    fontFamily: design.fontFamily || "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
    footerText: design.footerText || `© ${new Date().getFullYear()} ${serviceName}. All rights reserved.`,
  };

  // Inline p tag margins for email clients that don't support <style>
  const styledBody = bodyContent.replace(/<p>/g, '<p style="margin:0 0 4px 0;">');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
.email-body p { margin: 0 0 4px 0 !important; }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:${d.fontFamily};">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:${isStaff ? '#374151' : d.primaryColor};padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${serviceName}</h1>
${isStaff ? '<p style="margin:4px 0 0;color:#9ca3af;font-size:11px;">管理者通知</p>' : ''}
</td></tr>
<tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
<div class="email-body" style="color:#1f2937;font-size:14px;line-height:1.6;">${styledBody}</div>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:24px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
<p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">${(d.footerText).replace(/\n/g, '<br>')}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * Convert plain text body to HTML (for backward compatibility with non-rich-text templates).
 */
function plainTextToHtml(text: string): string {
  const urls: string[] = [];
  let processed = text.replace(/(https?:\/\/[^\s]+)/g, (match) => {
    urls.push(match);
    return `__URL_PLACEHOLDER_${urls.length - 1}__`;
  });

  processed = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  urls.forEach((url, i) => {
    processed = processed.replace(
      `__URL_PLACEHOLDER_${i}__`,
      `<a href="${url}" style="color: #2563eb; text-decoration: underline;">${url}</a>`
    );
  });

  processed = processed.replace(/\n/g, '<br>');
  return processed;
}

/**
 * Send email via Gmail API with unified HTML template wrapper.
 */
export async function sendMail(
  to: string,
  subject: string,
  body: string,
  isAdmin?: boolean
) {
  log(`[sendMail] Attempting to send email to: ${to} with subject: ${subject}`);
  try {
    if (!serviceAccountKey) {
      throw new Error("Service account key not loaded.");
    }

    const auth = new google.auth.JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: SCOPES,
      subject: ADMIN_EMAIL,
    });

    const gmail = google.gmail({ version: "v1", auth });

    // Detect if body is already HTML (from rich text editor) or plain text
    const isHtml = body.includes('<p>') || body.includes('<br>') || body.includes('<a ') || body.includes('<strong>') || body.includes('<h');
    const processedBody = isHtml ? body : plainTextToHtml(body);

    // Use explicit isAdmin flag when provided; fall back to subject heuristic for
    // legacy templates that predate the isAdmin field.
    const isStaff = isAdmin ?? (subject.includes('管理者') || subject.includes('スタッフ') || subject.includes('内部'));

    // Get email design settings and service name
    const design = await getEmailDesign();
    const serviceName = await getServiceName();

    // Wrap in unified template
    const htmlContent = wrapInTemplate(processedBody, isStaff, design, serviceName);

    const base64Subject = Buffer.from(subject).toString("base64");
    const utf8Subject = `=?utf-8?B?${base64Subject}?=`;
    const messageParts = [
      `From: ${serviceName} <${ADMIN_EMAIL}>`,
      `To: ${to}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${utf8Subject}`,
      "",
      htmlContent,
    ];

    const message = messageParts.join("\n");
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    log(`[sendMail] Email sent successfully to ${to}`);
  } catch (error) {
    log("[sendMail] Gmail API Error:", error);
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
