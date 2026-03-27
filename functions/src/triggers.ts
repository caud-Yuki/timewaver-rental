
import {getFirestore} from "firebase-admin/firestore";
import {log} from "firebase-functions/logger";
import {sendMail} from "./gmail"; // Import the new gmail function

interface EmailRecipient {
  email: string;
  name: string;
}

/**
 * Sends a transactional email based on a system trigger event using the Gmail API.
 *
 * @param trigger The name of the trigger event (e.g., 'application.submitted').
 * @param recipient The user or admin who will receive the email.
 * @param data A key-value object for populating template placeholders.
 */
export const sendTriggeredEmail = async (trigger: string, recipient: EmailRecipient, data: Record<string, any>) => {
  const db = getFirestore();
  log(`[sendTriggeredEmail] Initiated for trigger '${trigger}' to ${recipient.email}`);

  try {
    // 1. Find the email trigger configuration in settings
    const triggerDoc = await db.collection('emailTriggers').doc(trigger).get();
    if (!triggerDoc.exists) {
      log(`[sendTriggeredEmail] No email trigger found for '${trigger}'. Aborting.`);
      return;
    }

    const triggerConfig = triggerDoc.data();
    const templateId = triggerConfig?.templateId;

    if (!templateId) {
      log(`[sendTriggeredEmail] Trigger '${trigger}' is configured but has no templateId. Aborting.`);
      return;
    }

    // 2. Fetch the chosen email template
    const templateDoc = await db.collection('emailTemplates').doc(templateId).get();
    if (!templateDoc.exists) {
      log(`[sendTriggeredEmail] Template document with ID '${templateId}' not found. Aborting.`);
      return;
    }

    let { subject, body } = templateDoc.data() as { subject: string; body: string };

    // 3. Populate template placeholders
    const templateData = {
      userName: recipient.name,
      userEmail: recipient.email,
      ...data,
    };

    for (const [key, value] of Object.entries(templateData)) {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, "g"), String(value));
      body = body.replace(new RegExp(placeholder, "g"), String(value));
    }

    // 4. Send the email using the Gmail API function
    await sendMail(recipient.email, subject, body);

    log(`[sendTriggeredEmail] Successfully dispatched email via sendMail for trigger '${trigger}' to ${recipient.email}`);

  } catch (error) {
    log(`[sendTriggeredEmail] CRITICAL: An unexpected error occurred while processing trigger '${trigger}'.`, error);
    // The error from sendMail is already logged, so we just log the context here.
  }
};
