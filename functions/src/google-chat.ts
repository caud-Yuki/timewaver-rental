import axios from 'axios';
import { log } from 'firebase-functions/logger';

/**
 * Send a message to Google Chat via incoming webhook.
 * Webhook URL format: https://chat.googleapis.com/v1/spaces/{SPACE_ID}/messages?key={KEY}&token={TOKEN}
 */
export async function sendGoogleChatMessage(
  webhookUrl: string,
  message: string
): Promise<void> {
  try {
    await axios.post(
      webhookUrl,
      { text: message },
      { headers: { 'Content-Type': 'application/json' } }
    );
    log(`[GoogleChat] Message sent via webhook`);
  } catch (error: any) {
    log(`[GoogleChat] Failed to send message:`, error.message);
  }
}
