import axios from 'axios';
import { log } from 'firebase-functions/logger';

/**
 * Google Chat incoming-webhook payload — either a plain text message or a
 * Cards V2 message (or both, but Chat shows the cards when present).
 */
type GoogleChatPayload = {
  text?: string;
  cardsV2?: Array<{
    cardId: string;
    card: {
      header?: {
        title?: string;
        subtitle?: string;
        imageUrl?: string;
        imageType?: 'CIRCLE' | 'SQUARE';
      };
      sections?: Array<{ widgets: Array<Record<string, any>> }>;
    };
  }>;
};

/**
 * Send a message to Google Chat via incoming webhook.
 * Backwards-compatible: if `payload` is a string it is treated as `{ text }`.
 */
export async function sendGoogleChatMessage(
  webhookUrl: string,
  payload: string | GoogleChatPayload,
): Promise<void> {
  const body = typeof payload === 'string' ? { text: payload } : payload;
  try {
    await axios.post(webhookUrl, body, {
      headers: { 'Content-Type': 'application/json' },
    });
    log(`[GoogleChat] Message sent via webhook (cards=${!!('cardsV2' in body && body.cardsV2)})`);
  } catch (error: any) {
    log(`[GoogleChat] Failed to send message:`, error.message);
  }
}

/**
 * Convert the simple chat-flavored markdown the admin types into the
 * HTML-like syntax that Google Chat Cards V2 textParagraph accepts.
 * Cards V2 supports a small whitelist: <b>, <i>, <u>, <s>, <font>, <a>, <br>.
 */
export function chatMarkdownToCardHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Auto-link bare URLs (does not interfere with already-escaped text).
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    // Inline markdown — applied after escaping so user input cannot inject HTML.
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/`([^`\n]+)`/g, '<font face="monospace">$1</font>')
    .replace(/\n/g, '<br>');
}

/**
 * Build a Cards V2 payload from admin-supplied content.
 *
 * Buttons whose URL is not a valid http(s) link (e.g. placeholders left
 * unresolved like `{{linkAdminEarlyBookings}}`) are silently dropped — Google
 * Chat rejects the entire card otherwise, which would lose the notification.
 */
export function buildGoogleChatCard(args: {
  title: string;
  subtitle?: string;
  body: string;
  buttons?: Array<{ label: string; url: string }>;
}): GoogleChatPayload {
  const widgets: Array<Record<string, any>> = [];
  if (args.body && args.body.trim()) {
    widgets.push({ textParagraph: { text: chatMarkdownToCardHtml(args.body) } });
  }
  const validButtons = (args.buttons || []).filter((b) => {
    if (!b?.label?.trim() || !b?.url?.trim()) return false;
    const url = b.url.trim();
    // Must be an absolute http(s) URL with no unresolved placeholders.
    return /^https?:\/\//i.test(url) && !url.includes('{{');
  });
  if (validButtons.length > 0) {
    widgets.push({
      buttonList: {
        buttons: validButtons.map((b) => ({
          text: b.label.trim(),
          onClick: { openLink: { url: b.url.trim() } },
        })),
      },
    });
  }
  if (widgets.length === 0) {
    widgets.push({ textParagraph: { text: '(no content)' } });
  }

  return {
    // Chat clients fall back to this when cards cannot render (e.g. on mobile previews).
    text: args.title,
    cardsV2: [
      {
        cardId: 'tw-notification',
        card: {
          header: {
            title: args.title,
            ...(args.subtitle ? { subtitle: args.subtitle } : {}),
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
}
