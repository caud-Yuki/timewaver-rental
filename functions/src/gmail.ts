
import {google} from "googleapis";
import * as path from "path";
import {log} from "firebase-functions/logger";

// Assumes serviceAccountKey.json is in the functions directory
const KEY_PATH = path.join(__dirname, "../serviceAccountKey.json");
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const ADMIN_EMAIL = "yukiteraoka@caudesign.jp"; // The address to send from

/**
 * Converts a plain text string to an HTML string, preserving line breaks.
 * @param {string} text - The plain text to convert.
 * @return {string} - The HTML representation.
 */
function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>'); // Key change: converts newlines to <br> tags
}

/**
 * Send email via Gmail API
 * @param {string} to - Recipient's email address
 * @param {string} subject - Email subject
 * @param {string} body - Plain text email body
 * @return {Promise<void>}
 */
export async function sendMail(
  to: string,
  subject: string,
  body: string
) {
  log(`[sendMail] Attempting to send email to: ${to} with subject: ${subject}`);
  try {
    const auth = new google.auth.JWT({
      keyFile: KEY_PATH,
      scopes: SCOPES,
      subject: ADMIN_EMAIL, // Impersonate this user
    });

    const gmail = google.gmail({version: "v1", auth});

    const htmlContent = plainTextToHtml(body);

    // Construct the email message
    const base64Subject = Buffer.from(subject).toString("base64");
    const utf8Subject = `=?utf-8?B?${base64Subject}?=`;
    const messageParts = [
      `From: ChronoRent <${ADMIN_EMAIL}>`,
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
      userId: "me", // 'me' refers to the impersonated user (ADMIN_EMAIL)
      requestBody: {
        raw: encodedMessage,
      },
    });

    log(`[sendMail] Email sent successfully to ${to}`);
  } catch (error) {
    log("[sendMail] Gmail API Error:", error);
    // Re-throw the error to be caught by the calling function
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
