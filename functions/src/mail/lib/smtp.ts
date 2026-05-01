import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { getFirestore } from "firebase-admin/firestore";
import { log } from "firebase-functions/logger";
import { decryptString, encryptString } from "./kms";
import {
  buildHtmlBody,
  getEmailDesign,
  getServiceName,
} from "./template";
import type { MailAccount, MailSmtpCredential } from "../types";

export class SmtpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpAuthError";
  }
}

export interface SmtpVerifyInput {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export async function verifySmtpCredential(input: SmtpVerifyInput): Promise<void> {
  const opts: SMTPTransport.Options = {
    host: input.host,
    port: input.port,
    secure: input.secure,
    auth: { user: input.username, pass: input.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  };
  const transporter = nodemailer.createTransport(opts);
  try {
    await transporter.verify();
  } catch (err: any) {
    const msg = err?.message || "unknown";
    if (
      msg.includes("Invalid login") ||
      msg.includes("authentication failed") ||
      err?.responseCode === 535
    ) {
      throw new SmtpAuthError(`SMTP authentication failed: ${msg}`);
    }
    throw new Error(`SMTP verify failed: ${msg}`);
  }
}

export async function saveSmtpCredential(
  accountId: string,
  input: SmtpVerifyInput,
  fromName?: string
): Promise<void> {
  const enc = await encryptString(input.password);
  const db = getFirestore();
  const now = new Date();
  const data: MailSmtpCredential = {
    host: input.host,
    port: input.port,
    secure: input.secure,
    username: input.username,
    encryptedPassword: enc.ciphertext,
    kmsKeyVersion: enc.kmsKeyVersion,
    fromName,
    createdAt: now as any,
    updatedAt: now as any,
  };
  await db.collection("mail_smtp_credentials").doc(accountId).set(data, { merge: true });
}

export async function getDecryptedSmtpCredential(
  accountId: string
): Promise<MailSmtpCredential & { password: string }> {
  const db = getFirestore();
  const snap = await db.collection("mail_smtp_credentials").doc(accountId).get();
  if (!snap.exists) {
    throw new SmtpAuthError(`No SMTP credential for account ${accountId}`);
  }
  const c = snap.data() as MailSmtpCredential;
  const password = await decryptString(c.encryptedPassword);
  return { ...c, password };
}

export interface SmtpSendInput {
  to: string;
  subject: string;
  body: string;
  isAdmin?: boolean;
}

export async function sendViaSmtp(
  account: MailAccount & { id: string },
  input: SmtpSendInput
): Promise<void> {
  const cred = await getDecryptedSmtpCredential(account.id);
  const opts: SMTPTransport.Options = {
    host: cred.host,
    port: cred.port,
    secure: cred.secure,
    auth: { user: cred.username, pass: cred.password },
  };
  const transporter = nodemailer.createTransport(opts);

  const design = await getEmailDesign();
  const serviceName = await getServiceName();
  const html = buildHtmlBody(input.body, input.subject, input.isAdmin, design, serviceName);
  const fromName = account.fromName || cred.fromName || serviceName;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${account.email}>`,
      to: input.to,
      subject: input.subject,
      html,
    });
    log(`[SMTP] sent from ${account.email} via ${cred.host}:${cred.port} to ${input.to}`);
  } catch (err: any) {
    const msg = err?.message || "unknown";
    if (err?.responseCode === 535 || msg.includes("Invalid login") || msg.includes("authentication failed")) {
      throw new SmtpAuthError(`SMTP send failed (auth): ${msg}`);
    }
    throw new Error(`SMTP send failed: ${msg}`);
  }
}
