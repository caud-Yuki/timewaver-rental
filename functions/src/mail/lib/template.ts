import { getFirestore } from "firebase-admin/firestore";

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

export async function getEmailDesign(): Promise<EmailDesign> {
  const now = Date.now();
  if (cachedDesign && now - designCacheTime < 300000) {
    return cachedDesign;
  }
  try {
    const db = getFirestore();
    const settingsDoc = await db.collection("settings").doc("global").get();
    const data = settingsDoc.data();
    cachedDesign = data?.emailDesign || {};
    cachedServiceName = data?.serviceName || null;
    designCacheTime = now;
    return cachedDesign!;
  } catch {
    return {};
  }
}

export async function getServiceName(): Promise<string> {
  await getEmailDesign();
  return cachedServiceName || "TimeWaverHub";
}

export function plainTextToHtml(text: string): string {
  const urls: string[] = [];
  let processed = text.replace(/(https?:\/\/[^\s]+)/g, (match) => {
    urls.push(match);
    return `__URL_PLACEHOLDER_${urls.length - 1}__`;
  });
  processed = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  urls.forEach((url, i) => {
    processed = processed.replace(
      `__URL_PLACEHOLDER_${i}__`,
      `<a href="${url}" style="color: #2563eb; text-decoration: underline;">${url}</a>`
    );
  });
  processed = processed.replace(/\n/g, "<br>");
  return processed;
}

export function wrapInTemplate(
  bodyContent: string,
  isStaff: boolean,
  design: EmailDesign,
  serviceName: string
): string {
  const d = {
    primaryColor: design.primaryColor || "#2563eb",
    buttonColor: design.buttonColor || "#2563eb",
    fontFamily:
      design.fontFamily ||
      "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
    footerText:
      design.footerText ||
      `© ${new Date().getFullYear()} ${serviceName}. All rights reserved.`,
  };

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
<tr><td style="background-color:${isStaff ? "#374151" : d.primaryColor};padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${serviceName}</h1>
${isStaff ? '<p style="margin:4px 0 0;color:#9ca3af;font-size:11px;">管理者通知</p>' : ""}
</td></tr>
<tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
<div class="email-body" style="color:#1f2937;font-size:14px;line-height:1.6;">${styledBody}</div>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:24px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
<p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">${d.footerText.replace(/\n/g, "<br>")}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function detectIsHtml(body: string): boolean {
  return (
    body.includes("<p>") ||
    body.includes("<br>") ||
    body.includes("<a ") ||
    body.includes("<strong>") ||
    body.includes("<h")
  );
}

export function inferIsStaff(subject: string, isAdmin?: boolean): boolean {
  return (
    isAdmin ??
    (subject.includes("管理者") || subject.includes("スタッフ") || subject.includes("内部"))
  );
}

export function buildHtmlBody(rawBody: string, subject: string, isAdmin: boolean | undefined, design: EmailDesign, serviceName: string): string {
  const isHtml = detectIsHtml(rawBody);
  const processed = isHtml ? rawBody : plainTextToHtml(rawBody);
  const isStaff = inferIsStaff(subject, isAdmin);
  return wrapInTemplate(processed, isStaff, design, serviceName);
}

export function encodeUtf8Subject(subject: string): string {
  const base64Subject = Buffer.from(subject).toString("base64");
  return `=?utf-8?B?${base64Subject}?=`;
}
