
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
    if (!templateDoc.exists) {
      log(`[sendTriggeredEmail] Template '${templateId}' not found. Aborting.`);
      return;
    }

    let { subject, body } = templateDoc.data() as { subject: string; body: string };

    const templateData = {
      userName: recipient.name,
      userEmail: recipient.email,
      ...data,
    };

    for (const [key, value] of Object.entries(templateData)) {
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
      await sendMail(recipient.email, subject, body);
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
