
import {getFirestore} from "firebase-admin/firestore";
import {log} from "firebase-functions/logger";
import {sendMail} from "./gmail";
import {sendChatworkMessage} from "./chatwork";
import {sendGoogleChatMessage} from "./google-chat";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

interface EmailRecipient {
  email: string;
  name: string;
}

/**
 * Built-in fallback templates — used when the admin has selected a "[標準]"
 * system template (id starts with `sys_`) that hasn't been materialized into
 * the `emailTemplates` collection. Mirrors entries in
 * `src/lib/email-defaults.ts` so the admin UI dropdown matches runtime behavior.
 */
const SYSTEM_TEMPLATE_FALLBACK: Record<string, { subject: string; body: string; isAdmin?: boolean }> = {
  sys_early_booking_confirmation: {
    subject: '【{{serviceName}}】先行予約を受け付けました',
    body: `{{userName}} 様\n\nこの度は {{serviceName}} の先行予約にご登録いただき、誠にありがとうございます。\n\n下記の内容で予約を受け付けましたのでご確認ください。\n\n━━━━━━━━━━━━━━━━━━━━\nお名前: {{userName}}\n会社名・屋号: {{companyName}}\nメールアドレス: {{userEmail}}\n電話番号: {{phone}}\nご興味のある機器: {{desiredDevice}}\nご質問・ご要望:\n{{message}}\n━━━━━━━━━━━━━━━━━━━━\n\n正式ローンチ時には、優先的にご案内差し上げます。\nご質問等ございましたら、このメールへ直接ご返信ください。\n\n改めまして、ご登録ありがとうございました。\n今後ともどうぞよろしくお願いいたします。\n\n—\n{{operatorCompanyName}}`,
  },
  sys_early_booking_admin_notification: {
    subject: '【{{serviceName}}管理者】新規先行予約がありました — {{userName}} 様',
    body: `管理者様\n\n新しい先行予約が登録されました。\n\n━━━━━━━━━━━━━━━━━━━━\nお名前: {{userName}}\n会社名・屋号: {{companyName}}\nメールアドレス: {{userEmail}}\n電話番号: {{phone}}\nご興味のある機器: {{desiredDevice}}\nご質問・ご要望:\n{{message}}\n登録日時: {{submittedAt}}\n━━━━━━━━━━━━━━━━━━━━\n\n管理画面で詳細を確認してください:\n{{linkAdminEarlyBookings}}`,
    isAdmin: true,
  },
};

const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "studio-3681859885-cd9c1";

async function getSecretValueLocal(secretName: string): Promise<string | null> {
  try {
    const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    const payload = version.payload?.data;
    if (!payload) return null;
    if (typeof payload === "string") return payload;
    if (payload instanceof Uint8Array) return new TextDecoder().decode(payload);
    return String(payload);
  } catch (error: any) {
    if (error?.code === 5) return null;
    return null;
  }
}

/**
 * Sends a transactional email based on a system trigger event using the Gmail API.
 */
export const sendTriggeredEmail = async (trigger: string, recipient: EmailRecipient, data: Record<string, any>) => {
  const db = getFirestore();
  log(`[sendTriggeredEmail] Initiated for trigger '${trigger}' to ${recipient.email}`);

  try {
    const triggerDoc = await db.collection('emailTriggers').doc(trigger).get();
    if (!triggerDoc.exists) {
      log(`[sendTriggeredEmail] No email trigger found for '${trigger}'. Aborting.`);
      return;
    }

    const triggerConfig = triggerDoc.data();
    const templateId = triggerConfig?.templateId;

    if (!templateId) {
      log(`[sendTriggeredEmail] Trigger '${trigger}' has no templateId. Aborting.`);
      return;
    }

    const templateDoc = await db.collection('emailTemplates').doc(templateId).get();
    let subject: string;
    let body: string;
    let isAdmin: boolean | undefined;

    if (templateDoc.exists) {
      const t = templateDoc.data() as { subject: string; body: string; isAdmin?: boolean };
      subject = t.subject;
      body = t.body;
      isAdmin = t.isAdmin;
    } else if (SYSTEM_TEMPLATE_FALLBACK[templateId]) {
      const fallback = SYSTEM_TEMPLATE_FALLBACK[templateId];
      subject = fallback.subject;
      body = fallback.body;
      isAdmin = fallback.isAdmin;
      log(`[sendTriggeredEmail] Using built-in fallback for '${templateId}' (not in Firestore).`);
    } else {
      log(`[sendTriggeredEmail] Template '${templateId}' not found and no fallback. Aborting.`);
      return;
    }

    // Fetch company info from settings for placeholders
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};

    // Base URL for links
    const baseUrl = 'https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app';

    // Build full company address
    const companyFullAddress = [
      settings.companyPostalCode ? `〒${settings.companyPostalCode}` : '',
      settings.companyPrefecture || '',
      settings.companyCity || '',
      settings.companyAddress || '',
      settings.companyBuilding || '',
    ].filter(Boolean).join(' ');

    const templateData: Record<string, any> = {
      // Service info
      serviceName: settings.serviceName || 'TimeWaverHub',
      operatorCompanyName: settings.companyName || settings.serviceName || 'TimeWaverHub',
      // User info
      userName: recipient.name,
      userEmail: recipient.email,
      // Company info from admin settings
      companyName: settings.companyName || '',
      managerName: settings.managerName || '',
      managerEmail: settings.managerEmail || '',
      companyPhone: settings.companyPhone || '',
      companyPostalCode: settings.companyPostalCode || '',
      companyPrefecture: settings.companyPrefecture || '',
      companyCity: settings.companyCity || '',
      companyAddress: settings.companyAddress || '',
      companyBuilding: settings.companyBuilding || '',
      companyFullAddress,
      // Page links
      linkMypage: `${baseUrl}/mypage`,
      linkApplications: `${baseUrl}/mypage/applications`,
      linkDevices: `${baseUrl}/mypage/devices`,
      linkPaymentHistory: `${baseUrl}/mypage/payment-history`,
      linkProfile: `${baseUrl}/mypage/profile`,
      linkDeviceList: `${baseUrl}/devices`,
      linkAdminEarlyBookings: `${baseUrl}/admin/early-bookings`,
      // Dynamic data (from the trigger caller)
      ...data,
    };

    for (const [key, value] of Object.entries(templateData)) {
      if (value === undefined || value === null) continue;
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), String(value));
      body = body.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), String(value));
    }

    // Check which channels are enabled
    const channels = triggerConfig?.channels || { email: true };
    const enabled = triggerConfig?.enabled !== false;

    if (!enabled) {
      log(`[sendTriggeredEmail] Trigger '${trigger}' is disabled. Skipping.`);
      return;
    }

    // 1. Email (default: enabled)
    if (channels.email !== false) {
      await sendMail(recipient.email, subject, body, isAdmin);
      log(`[sendTriggeredEmail] Email sent for '${trigger}' to ${recipient.email}`);
    }

    // 2. Chatwork
    if (channels.chatwork) {
      const token = await getSecretValueLocal('CHATWORK_API_TOKEN');
      const roomId = await getSecretValueLocal('CHATWORK_ROOM_ID');
      if (token && roomId) {
        const chatMessage = `[info][title]${subject}[/title]${body}[/info]`;
        await sendChatworkMessage(token, roomId, chatMessage);
      } else {
        log(`[sendTriggeredEmail] Chatwork credentials not configured. Skipping.`);
      }
    }

    // 3. Google Chat
    if (channels.googleChat) {
      const webhookUrl = await getSecretValueLocal('GOOGLE_CHAT_WEBHOOK_URL');
      if (webhookUrl) {
        const chatMessage = `*${subject}*\n\n${body}`;
        await sendGoogleChatMessage(webhookUrl, chatMessage);
      } else {
        log(`[sendTriggeredEmail] Google Chat webhook not configured. Skipping.`);
      }
    }

  } catch (error) {
    log(`[sendTriggeredEmail] CRITICAL: Error processing trigger '${trigger}'.`, error);
  }
};
