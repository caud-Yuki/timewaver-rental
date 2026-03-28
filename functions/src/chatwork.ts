import axios from 'axios';
import { log } from 'firebase-functions/logger';

/**
 * Send a message to a Chatwork room.
 * API: POST https://api.chatwork.com/v2/rooms/{roomId}/messages
 */
export async function sendChatworkMessage(
  apiToken: string,
  roomId: string,
  message: string
): Promise<void> {
  try {
    await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      `body=${encodeURIComponent(message)}`,
      {
        headers: {
          'X-ChatWorkToken': apiToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    log(`[Chatwork] Message sent to room ${roomId}`);
  } catch (error: any) {
    log(`[Chatwork] Failed to send message:`, error.message);
  }
}
