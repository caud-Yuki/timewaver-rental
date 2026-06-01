
import {getFirestore} from "firebase-admin/firestore";
import {log} from "firebase-functions/logger";
import {sendMail} from "./gmail";
import {sendChatworkMessage} from "./chatwork";
import {sendGoogleChatMessage, buildGoogleChatCard} from "./google-chat";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { SYSTEM_TEMPLATES } from "./email-defaults";

interface EmailRecipient {
  email: string;
  name: string;
}

/**
 * Mapping from the per-audience trigger ids used at Cloud Function call sites
 * to the consolidated event id stored in Firestore. Each entry records which
 * template field to pull off the event doc (userTemplateId vs adminTemplateId).
 *
 * Legacy paired triggers are collapsed onto a single event id; for everything
 * else the event id is the same as the trigger id.
 */
const TRIGGER_TO_EVENT: Record<string, { eventId: string; audience: 'user' | 'admin' }> = {
  // Paired events
  payment_failed: { eventId: 'payment_failed', audience: 'admin' },
  payment_failed_user: { eventId: 'payment_failed', audience: 'user' },
  subscription_canceled_payment_failure: { eventId: 'subscription_canceled_payment_failure', audience: 'user' },
  subscription_canceled_payment_failure_admin: { eventId: 'subscription_canceled_payment_failure', audience: 'admin' },
  early_booking_confirmation: { eventId: 'early_booking', audience: 'user' },
  early_booking_admin_notification: { eventId: 'early_booking', audience: 'admin' },
  early_booking_launch_notice: { eventId: 'early_booking_launch_notice', audience: 'user' },
  // Audience-singular events — eventId === triggerId, audience inferred from name.
  application_submitted: { eventId: 'application_submitted', audience: 'user' },
  application_approved: { eventId: 'application_approved', audience: 'user' },
  application_rejected: { eventId: 'application_rejected', audience: 'user' },
  consent_form_submitted: { eventId: 'consent_form_submitted', audience: 'admin' },
  consent_form_approved: { eventId: 'consent_form_approved', audience: 'user' },
  payment_link_sent: { eventId: 'payment_link_sent', audience: 'user' },
  payment_completed: { eventId: 'payment_completed', audience: 'user' },
  card_expiring: { eventId: 'card_expiring', audience: 'user' },
  initial_payment_failed: { eventId: 'initial_payment_failed', audience: 'admin' },
  device_prep_required: { eventId: 'device_prep_required', audience: 'admin' },
  device_shipped: { eventId: 'device_shipped', audience: 'user' },
  contract_renewal_reminder: { eventId: 'contract_renewal_reminder', audience: 'user' },
  subscription_canceled: { eventId: 'subscription_canceled', audience: 'user' },
  contract_expired: { eventId: 'contract_expired', audience: 'user' },
  device_return_guide: { eventId: 'device_return_guide', audience: 'user' },
  device_inspection: { eventId: 'device_inspection', audience: 'admin' },
  device_returned: { eventId: 'device_returned', audience: 'user' },
  device_damaged: { eventId: 'device_damaged', audience: 'user' },
  news_published: { eventId: 'news_published', audience: 'user' },
  waitlist_device_available: { eventId: 'waitlist_device_available', audience: 'user' },
  welcome_registration: { eventId: 'welcome_registration', audience: 'user' },
};

/**
 * Built-in fallback templates — used when the admin has selected a "[標準]"
 * system template (id starts with `sys_`) that hasn't been materialized into
 * the `emailTemplates` Firestore collection. Sourced from the same data the
 * admin UI uses so the dropdown options match runtime behavior.
 */
const SYSTEM_TEMPLATE_FALLBACK: Record<string, { subject: string; body: string; isAdmin?: boolean }> =
  Object.fromEntries(
    SYSTEM_TEMPLATES.map((t) => [t.id, { subject: t.subject, body: t.body, isAdmin: t.isAdmin }])
  );

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
    // Resolve the per-audience trigger id to the consolidated event doc.
    const mapping = TRIGGER_TO_EVENT[trigger] || { eventId: trigger, audience: 'user' as const };

    // Prefer the new-format event doc (id = eventId, fields userTemplateId /
    // adminTemplateId). Fall back to the legacy per-audience doc if absent,
    // so deployments that haven't migrated yet keep working untouched.
    const eventDoc = await db.collection('emailTriggers').doc(mapping.eventId).get();
    let triggerConfig: FirebaseFirestore.DocumentData | undefined;
    let templateId: string | undefined;

    if (eventDoc.exists) {
      const data = eventDoc.data() || {};
      const audienceField = mapping.audience === 'user' ? 'userTemplateId' : 'adminTemplateId';
      const newFormatTemplate = data[audienceField];
      // Detect "old-format doc at the eventId slot" — for trigger ids that
      // collide with eventId (e.g. payment_failed), the legacy doc has a flat
      // templateId field instead of userTemplateId/adminTemplateId.
      const hasNewFormat = ('userTemplateId' in data) || ('adminTemplateId' in data);
      if (hasNewFormat) {
        templateId = newFormatTemplate;
        triggerConfig = data;
      } else if (mapping.eventId === trigger) {
        // Same id, but legacy single-template shape — use the flat field.
        templateId = data.templateId;
        triggerConfig = data;
      }
    }

    if (!templateId) {
      // Final fallback: try the legacy per-audience doc id directly.
      const legacyDoc = await db.collection('emailTriggers').doc(trigger).get();
      if (!legacyDoc.exists) {
        log(`[sendTriggeredEmail] No trigger config for '${trigger}' (event '${mapping.eventId}'). Aborting.`);
        return;
      }
      triggerConfig = legacyDoc.data();
      templateId = triggerConfig?.templateId;
    }

    if (!templateId) {
      log(`[sendTriggeredEmail] Trigger '${trigger}' has no ${mapping.audience}TemplateId. Aborting.`);
      return;
    }

    const templateDoc = await db.collection('emailTemplates').doc(templateId).get();
    let subject: string;
    let body: string;
    let chatSubject: string | undefined;
    let chatBody: string | undefined;
    let isAdmin: boolean | undefined;

    let chatFormat: 'text' | 'card' = 'text';
    let chatCardButtons: Array<{ label: string; url: string }> = [];

    if (templateDoc.exists) {
      const t = templateDoc.data() as {
        subject: string;
        body: string;
        isAdmin?: boolean;
        chatSubject?: string;
        chatBody?: string;
        chatFormat?: 'text' | 'card';
        chatCardButtons?: Array<{ label: string; url: string }>;
      };
      subject = t.subject;
      body = t.body;
      chatSubject = t.chatSubject;
      chatBody = t.chatBody;
      isAdmin = t.isAdmin;
      chatFormat = t.chatFormat === 'card' ? 'card' : 'text';
      chatCardButtons = Array.isArray(t.chatCardButtons) ? t.chatCardButtons : [];
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
      const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      const v = String(value);
      subject = subject.replace(re, v);
      body = body.replace(re, v);
      if (chatSubject) chatSubject = chatSubject.replace(re, v);
      if (chatBody) chatBody = chatBody.replace(re, v);
      if (chatCardButtons.length > 0) {
        chatCardButtons = chatCardButtons.map((btn) => ({
          label: (btn.label || '').replace(re, v),
          url: (btn.url || '').replace(re, v),
        }));
      }
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

    // 3. Google Chat — supports multiple destinations.
    if (channels.googleChat) {
      // Prefer template's chat-specific override; fall back to stripped HTML body.
      const chatHeader = (chatSubject && chatSubject.trim()) || subject;
      const chatBodyText = (chatBody && chatBody.trim()) || stripHtmlForChat(body);
      const serviceName = (settings as any)?.serviceName || 'TimeWaverHub';

      const chatPayload = chatFormat === 'card'
        ? buildGoogleChatCard({
            title: chatHeader,
            subtitle: serviceName,
            body: chatBodyText,
            buttons: chatCardButtons,
          })
        : `*${chatHeader}*\n\n${chatBodyText}`;
      const destinations: Array<{ id: string; label: string; enabled: boolean; hasUrl: boolean }> =
        Array.isArray(settings.googleChatDestinations) ? settings.googleChatDestinations : [];
      const enabledDestinations = destinations.filter((d) => d?.enabled !== false && d?.hasUrl !== false);

      // Per-event filter: if the trigger config restricts which destinations to use,
      // honor it; otherwise broadcast to every enabled destination.
      const requestedIds: string[] | undefined = Array.isArray(channels.googleChatDestinationIds)
        ? channels.googleChatDestinationIds.filter((x: unknown) => typeof x === 'string')
        : undefined;
      const selected = requestedIds && requestedIds.length > 0
        ? enabledDestinations.filter((d) => requestedIds.includes(d.id))
        : enabledDestinations;

      if (selected.length > 0) {
        await Promise.all(selected.map(async (dest) => {
          const url = await getSecretValueLocal(`GOOGLE_CHAT_WEBHOOK_${dest.id}`);
          if (url) {
            await sendGoogleChatMessage(url, chatPayload);
            log(`[sendTriggeredEmail] Google Chat → "${dest.label}" (${dest.id})`);
          } else {
            log(`[sendTriggeredEmail] Skipping Google Chat destination "${dest.label}" (${dest.id}) — URL missing.`);
          }
        }));
      } else {
        // Legacy fallback: no destinations list configured — use the single-URL secret.
        const legacyUrl = await getSecretValueLocal('GOOGLE_CHAT_WEBHOOK_URL');
        if (legacyUrl) {
          await sendGoogleChatMessage(legacyUrl, chatPayload);
          log(`[sendTriggeredEmail] Google Chat → legacy single-URL destination`);
        } else {
          log(`[sendTriggeredEmail] Google Chat: no destinations configured. Skipping.`);
        }
      }
    }

  } catch (error) {
    log(`[sendTriggeredEmail] CRITICAL: Error processing trigger '${trigger}'.`, error);
  }
};

/**
 * Convert the HTML email body into something readable in Google Chat. Chat
 * doesn't render HTML; sending raw tags makes notifications look broken.
 */
function stripHtmlForChat(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
