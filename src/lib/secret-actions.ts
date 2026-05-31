'use server';

/**
 * @fileOverview Server actions for reading/writing secrets via Google Cloud Secret Manager.
 * These actions run on the server and are safe to call from client components.
 */

import crypto from 'node:crypto';
import { getSecret, setSecret, deleteSecret, googleChatWebhookSecretName, SECRET_NAMES } from '@/lib/secret-manager';

// --- Types ---

export interface SecretPayload {
  stripeTestPublishableKey?: string;
  stripeTestSecretKey?: string;
  stripeLivePublishableKey?: string;
  stripeLiveSecretKey?: string;
  /** @deprecated Use stripeTestWebhookSecret / stripeLiveWebhookSecret instead. Kept for backward compat. */
  stripeWebhookSecret?: string;
  stripeTestWebhookSecret?: string;
  stripeLiveWebhookSecret?: string;
  geminiApiKey?: string;
  chatworkApiToken?: string;
  chatworkRoomId?: string;
  googleChatWebhookUrl?: string;
  gmailOAuthClientId?: string;
  gmailOAuthClientSecret?: string;
}

export interface StripeSecretsResult {
  publishableKey: string;
  secretKey: string;
  mode: 'test' | 'production';
}

// --- Write Secrets ---

/**
 * Save multiple secrets to Google Cloud Secret Manager.
 * Only non-empty values are written (skips blank fields to avoid overwriting existing secrets).
 */
export async function saveSecrets(payload: SecretPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const entries: [string, string | undefined][] = [
      [SECRET_NAMES.STRIPE_TEST_PUBLISHABLE_KEY, payload.stripeTestPublishableKey],
      [SECRET_NAMES.STRIPE_TEST_SECRET_KEY, payload.stripeTestSecretKey],
      [SECRET_NAMES.STRIPE_LIVE_PUBLISHABLE_KEY, payload.stripeLivePublishableKey],
      [SECRET_NAMES.STRIPE_LIVE_SECRET_KEY, payload.stripeLiveSecretKey],
      [SECRET_NAMES.STRIPE_TEST_WEBHOOK_SECRET, payload.stripeTestWebhookSecret],
      [SECRET_NAMES.STRIPE_LIVE_WEBHOOK_SECRET, payload.stripeLiveWebhookSecret],
      [SECRET_NAMES.STRIPE_WEBHOOK_SECRET, payload.stripeWebhookSecret], // legacy
      [SECRET_NAMES.GEMINI_API_KEY, payload.geminiApiKey],
      [SECRET_NAMES.CHATWORK_API_TOKEN, payload.chatworkApiToken],
      [SECRET_NAMES.CHATWORK_ROOM_ID, payload.chatworkRoomId],
      [SECRET_NAMES.GOOGLE_CHAT_WEBHOOK_URL, payload.googleChatWebhookUrl],
      [SECRET_NAMES.GMAIL_OAUTH_CLIENT_ID, payload.gmailOAuthClientId],
      [SECRET_NAMES.GMAIL_OAUTH_CLIENT_SECRET, payload.gmailOAuthClientSecret],
    ];

    for (const [name, value] of entries) {
      if (value && value.trim()) {
        await setSecret(name, value.trim());
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('[saveSecrets] Error:', error.message);
    return { success: false, error: error.message };
  }
}

// --- Read Secrets ---

/**
 * Get Stripe API credentials from Secret Manager.
 * Reads the appropriate test/live credentials based on the mode parameter.
 */
export async function getStripeSecrets(mode: 'test' | 'production'): Promise<StripeSecretsResult | null> {
  try {
    const isTest = mode === 'test';
    const publishableKey = await getSecret(
      isTest ? SECRET_NAMES.STRIPE_TEST_PUBLISHABLE_KEY : SECRET_NAMES.STRIPE_LIVE_PUBLISHABLE_KEY
    );
    const secretKey = await getSecret(
      isTest ? SECRET_NAMES.STRIPE_TEST_SECRET_KEY : SECRET_NAMES.STRIPE_LIVE_SECRET_KEY
    );

    if (!publishableKey || !secretKey) return null;

    return { publishableKey, secretKey, mode };
  } catch (error: any) {
    console.error('[getStripeSecrets] Error:', error.message);
    return null;
  }
}

/**
 * Get the Stripe webhook signing secret for the given mode.
 * Tries the mode-specific secret first, then falls back to the legacy single secret
 * for backward compatibility with existing deployments.
 */
export async function getStripeWebhookSecret(mode: 'test' | 'production' = 'test'): Promise<string | null> {
  try {
    const modeSpecific = mode === 'test'
      ? SECRET_NAMES.STRIPE_TEST_WEBHOOK_SECRET
      : SECRET_NAMES.STRIPE_LIVE_WEBHOOK_SECRET;
    const value = await getSecret(modeSpecific);
    if (value) return value;
    // Fallback to legacy
    return await getSecret(SECRET_NAMES.STRIPE_WEBHOOK_SECRET);
  } catch (error: any) {
    console.error('[getStripeWebhookSecret] Error:', error.message);
    return null;
  }
}

/**
 * Get the Gemini API key from Secret Manager.
 * Falls back to environment variable GOOGLE_GENAI_API_KEY if not found.
 */
export async function getGeminiSecret(): Promise<string | null> {
  try {
    const key = await getSecret(SECRET_NAMES.GEMINI_API_KEY);
    if (key) return key;
  } catch (error: any) {
    console.warn('[getGeminiSecret] Secret Manager read failed, falling back to env var:', error.message);
  }

  // Fallback to environment variables for local development
  return process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || null;
}

/**
 * Check which secrets are currently configured (returns masked status, never raw values).
 * Used by the admin settings page to show which fields are set.
 */
export async function getSecretsStatus(): Promise<Record<string, boolean>> {
  try {
    const results = await Promise.all([
      getSecret(SECRET_NAMES.STRIPE_TEST_PUBLISHABLE_KEY),
      getSecret(SECRET_NAMES.STRIPE_TEST_SECRET_KEY),
      getSecret(SECRET_NAMES.STRIPE_LIVE_PUBLISHABLE_KEY),
      getSecret(SECRET_NAMES.STRIPE_LIVE_SECRET_KEY),
      getSecret(SECRET_NAMES.STRIPE_TEST_WEBHOOK_SECRET),
      getSecret(SECRET_NAMES.STRIPE_LIVE_WEBHOOK_SECRET),
      getSecret(SECRET_NAMES.STRIPE_WEBHOOK_SECRET), // legacy
      getSecret(SECRET_NAMES.GEMINI_API_KEY),
      getSecret(SECRET_NAMES.CHATWORK_API_TOKEN),
      getSecret(SECRET_NAMES.CHATWORK_ROOM_ID),
      getSecret(SECRET_NAMES.GOOGLE_CHAT_WEBHOOK_URL),
      getSecret(SECRET_NAMES.GMAIL_OAUTH_CLIENT_ID),
      getSecret(SECRET_NAMES.GMAIL_OAUTH_CLIENT_SECRET),
    ]);

    return {
      stripeTestPublishableKey: !!results[0],
      stripeTestSecretKey: !!results[1],
      stripeLivePublishableKey: !!results[2],
      stripeLiveSecretKey: !!results[3],
      stripeTestWebhookSecret: !!results[4],
      stripeLiveWebhookSecret: !!results[5],
      stripeWebhookSecret: !!results[6], // legacy
      geminiApiKey: !!results[7],
      chatworkApiToken: !!results[8],
      chatworkRoomId: !!results[9],
      googleChatWebhookUrl: !!results[10],
      gmailOAuthClientId: !!results[11],
      gmailOAuthClientSecret: !!results[12],
    };
  } catch (error) {
    return {
      stripeTestPublishableKey: false,
      stripeTestSecretKey: false,
      stripeLivePublishableKey: false,
      stripeLiveSecretKey: false,
      stripeTestWebhookSecret: false,
      stripeLiveWebhookSecret: false,
      stripeWebhookSecret: false,
      geminiApiKey: false,
      chatworkApiToken: false,
      chatworkRoomId: false,
      googleChatWebhookUrl: false,
      gmailOAuthClientId: false,
      gmailOAuthClientSecret: false,
    };
  }
}

// --- Google Chat Destinations (multi-destination) ---

/**
 * Save a Google Chat destination's webhook URL to Secret Manager.
 * Returns { success, error } so the caller can surface failure to the user.
 */
export async function saveGoogleChatDestinationUrl(
  destinationId: string,
  webhookUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!destinationId || !destinationId.match(/^[a-zA-Z0-9_-]{1,40}$/)) {
      return { success: false, error: 'Invalid destination id.' };
    }
    if (!webhookUrl || !webhookUrl.startsWith('https://chat.googleapis.com/')) {
      return { success: false, error: '正しい Google Chat Webhook URL を入力してください。' };
    }
    await setSecret(googleChatWebhookSecretName(destinationId), webhookUrl.trim());
    return { success: true };
  } catch (error: any) {
    console.error('[saveGoogleChatDestinationUrl] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a destination's webhook URL from Secret Manager. Idempotent — calling
 * on an unknown destinationId still resolves successfully.
 */
export async function deleteGoogleChatDestinationUrl(
  destinationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteSecret(googleChatWebhookSecretName(destinationId));
    return { success: true };
  } catch (error: any) {
    console.error('[deleteGoogleChatDestinationUrl] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send a test message to a Google Chat destination. The caller can pass an
 * explicit `webhookUrl` to test before saving, or omit it to use the URL
 * stored for `destinationId`. Returns plain status (no leaked details).
 */
export async function testGoogleChatDestination(args: {
  destinationId?: string;
  webhookUrl?: string;
  message?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let url = args.webhookUrl?.trim() || '';
    if (!url && args.destinationId) {
      const stored = await getSecret(googleChatWebhookSecretName(args.destinationId));
      if (!stored) return { success: false, error: 'この通知先は URL が未設定です。' };
      url = stored;
    }
    if (!url || !url.startsWith('https://chat.googleapis.com/')) {
      return { success: false, error: 'Google Chat の Webhook URL が見つかりません。' };
    }

    const text = args.message?.trim() || '✅ TimeWaverHub からのテスト送信です。この宛先で通知が受け取れます。';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { success: false, error: `Google Chat returned ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[testGoogleChatDestination] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mirror of the Cloud Function chat-markdown → Cards V2 HTML converter, kept
 * here so the test-send action can build the same payload server-side without
 * importing from the functions package.
 */
function chatMarkdownToCardHtmlLocal(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/`([^`\n]+)`/g, '<font face="monospace">$1</font>')
    .replace(/\n/g, '<br>');
}

/**
 * Send a fully-composed template preview to one Google Chat destination so
 * admins can verify formatting before wiring the template up to a live trigger.
 * Placeholders ({{userName}} etc.) are sent verbatim — this is intentional so
 * admins can spot any unfilled slots.
 */
export async function testGoogleChatTemplatePreview(args: {
  destinationId: string;
  format: 'text' | 'card';
  subject: string;
  body: string;
  cardButtons?: Array<{ label: string; url: string }>;
  serviceName?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!args.destinationId) return { success: false, error: '送信先を選択してください。' };
    const url = await getSecret(googleChatWebhookSecretName(args.destinationId));
    if (!url) return { success: false, error: 'この通知先は URL が未設定です。' };

    const subject = (args.subject || '').trim() || '(件名未設定)';
    const body = (args.body || '').trim() || '(本文未設定)';

    let payload: any;
    if (args.format === 'card') {
      const widgets: any[] = [{ textParagraph: { text: chatMarkdownToCardHtmlLocal(body) } }];
      // For test sends, substitute placeholder URLs with a valid sample URL so
      // Google Chat accepts the card. The admin still sees the button + label.
      const PREVIEW_BASE = 'https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app';
      const buttons = (args.cardButtons || [])
        .filter((b) => b?.label?.trim() && b?.url?.trim())
        .map((b) => {
          let url = b.url.trim();
          if (url.includes('{{')) {
            // Replace whole-URL placeholder with a recognizable preview URL.
            url = `${PREVIEW_BASE}/?preview=${encodeURIComponent(url)}`;
          } else if (!/^https?:\/\//i.test(url)) {
            // Relative path — make absolute so Google Chat accepts it.
            url = `${PREVIEW_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
          }
          return { text: b.label, onClick: { openLink: { url } } };
        });
      if (buttons.length > 0) {
        widgets.push({ buttonList: { buttons } });
      }
      // Card-only — omit `text` so Google Chat doesn't append a separate
      // plain-text message above the card.
      payload = {
        cardsV2: [
          {
            cardId: 'tw-template-preview',
            card: {
              header: {
                title: subject,
                subtitle: `🧪 テスト送信 — ${args.serviceName || 'TimeWaverHub'}`,
              },
              sections: [{ widgets }],
            },
          },
        ],
      };
    } else {
      payload = { text: `🧪 [テスト送信]\n\n*${subject}*\n\n${body}` };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { success: false, error: `Google Chat returned ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[testGoogleChatTemplatePreview] Error:', error.message);
    return { success: false, error: error.message };
  }
}

// --- Stripe Connection Test (Dry Run) ---

/**
 * One sub-check inside the Stripe connection test result.
 * `ok: null` means the check was skipped (e.g. webhook secret not configured).
 */
export interface StripeCheck {
  ok: boolean | null;
  detail?: string;
}

export interface StripeConnectionTestResult {
  success: boolean;
  mode: 'test' | 'production';
  testedAt: string; // ISO timestamp
  checks: {
    /** Secret Key has correct prefix (sk_test_ or sk_live_) */
    secretKeyFormat: StripeCheck;
    /** Publishable Key has correct prefix (pk_test_ or pk_live_) */
    publishableKeyFormat: StripeCheck;
    /** Secret Key and Publishable Key are both for the same environment */
    keyPairConsistency: StripeCheck;
    /** GET /v1/account — verifies Secret Key is valid; returns account info */
    accountRetrieve: StripeCheck & {
      accountId?: string;
      country?: string;
      displayName?: string;
      chargesEnabled?: boolean;
      payoutsEnabled?: boolean;
      defaultCurrency?: string;
      livemode?: boolean;
    };
    /** GET /v1/balance — verifies Secret Key has balance read permission */
    balanceRetrieve: StripeCheck & {
      available?: Array<{ amount: number; currency: string }>;
    };
    /** Webhook secret format check (whsec_...) */
    webhookSecretFormat: StripeCheck;
    /** HMAC self-test: sign a fake payload with the secret and verify it parses back */
    webhookSignatureSelfTest: StripeCheck;
    /** GET /v1/webhook_endpoints — lists endpoints registered on Stripe */
    webhookEndpointRegistration: StripeCheck & {
      endpoints?: Array<{ url: string; status: string; eventCount: number }>;
    };
  };
  /** Top-level error (e.g. missing credentials) when checks could not run at all */
  error?: string;
}

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2024-12-18.acacia';

/**
 * Call a read-only Stripe REST endpoint with the given secret key.
 * Returns parsed JSON on success, or throws Error with Stripe-provided message on failure.
 */
async function stripeGet(secretKey: string, path: string): Promise<any> {
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_API_VERSION,
    },
    // Don't cache — every test should hit Stripe live
    cache: 'no-store',
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      body?.error?.message ||
      body?.error?.type ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body;
}

/**
 * Self-test the webhook secret by signing a fake event payload and verifying
 * the signature can be reconstructed. Mirrors stripe.webhooks.constructEvent()
 * verification logic without needing the Stripe SDK.
 *
 * Does NOT prove that real webhooks from Stripe will be accepted — only that
 * the secret has a valid HMAC and our verification code works.
 */
function selfTestWebhookSignature(webhookSecret: string): { ok: boolean; detail: string } {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ id: 'evt_test_selftest', type: 'ping' });
    const signedPayload = `${timestamp}.${payload}`;

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Reconstruct what Stripe sends in the Stripe-Signature header
    const header = `t=${timestamp},v1=${expectedSig}`;

    // Now verify (mimic what stripe.webhooks.constructEvent does internally)
    const parts = Object.fromEntries(header.split(',').map((p) => p.split('=', 2) as [string, string]));
    if (!parts.t || !parts.v1) return { ok: false, detail: '署名ヘッダーの構築に失敗しました。' };

    const verifySig = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${parts.t}.${payload}`, 'utf8')
      .digest('hex');

    const matches = crypto.timingSafeEqual(
      Buffer.from(parts.v1, 'utf8'),
      Buffer.from(verifySig, 'utf8'),
    );

    return matches
      ? { ok: true, detail: 'HMAC-SHA256 署名生成・検証ロジックが正常に動作しました。' }
      : { ok: false, detail: '署名再検証に失敗しました（HMAC計算結果が一致しません）。' };
  } catch (err: any) {
    return { ok: false, detail: `署名自己テスト中にエラー: ${err?.message || err}` };
  }
}

/**
 * Run a non-destructive, read-only verification of all Stripe credentials
 * stored in Secret Manager for the given mode.
 *
 * Performs the following checks:
 *   01. Publishable Key + Secret Key
 *     - Format validation (pk_*, sk_*)
 *     - Live/Test mode consistency between the two keys
 *     - GET /v1/account → confirms Secret Key works, returns account info
 *     - GET /v1/balance → confirms read permission and shows available balance
 *   02. Webhook Secret
 *     - Format validation (whsec_*)
 *     - HMAC self-test (sign fake payload + verify signature)
 *     - GET /v1/webhook_endpoints → lists endpoints currently registered on Stripe
 *
 * NO money is moved. NO customers/subscriptions/charges are created. All
 * Stripe API calls are GET requests.
 */
export async function testStripeConnection(
  mode: 'test' | 'production',
): Promise<StripeConnectionTestResult> {
  const result: StripeConnectionTestResult = {
    success: false,
    mode,
    testedAt: new Date().toISOString(),
    checks: {
      secretKeyFormat: { ok: null },
      publishableKeyFormat: { ok: null },
      keyPairConsistency: { ok: null },
      accountRetrieve: { ok: null },
      balanceRetrieve: { ok: null },
      webhookSecretFormat: { ok: null },
      webhookSignatureSelfTest: { ok: null },
      webhookEndpointRegistration: { ok: null },
    },
  };

  try {
    // ---- Load secrets ----
    const secrets = await getStripeSecrets(mode);
    if (!secrets) {
      result.error = `${mode === 'test' ? 'テスト' : '本番'}環境の Publishable Key / Secret Key が Secret Manager に保存されていません。`;
      return result;
    }
    const webhookSecret = await getStripeWebhookSecret(mode);

    const { publishableKey, secretKey } = secrets;
    const expectedSecretPrefix = mode === 'test' ? 'sk_test_' : 'sk_live_';
    const expectedPubPrefix = mode === 'test' ? 'pk_test_' : 'pk_live_';

    // ---- 01-a. Format checks ----
    result.checks.secretKeyFormat = secretKey.startsWith(expectedSecretPrefix)
      ? { ok: true, detail: `Secret Key は ${expectedSecretPrefix}... 形式で正常です。` }
      : { ok: false, detail: `Secret Key は ${expectedSecretPrefix}... で始まる必要があります（実際: ${secretKey.slice(0, 8)}...）` };

    result.checks.publishableKeyFormat = publishableKey.startsWith(expectedPubPrefix)
      ? { ok: true, detail: `Publishable Key は ${expectedPubPrefix}... 形式で正常です。` }
      : { ok: false, detail: `Publishable Key は ${expectedPubPrefix}... で始まる必要があります（実際: ${publishableKey.slice(0, 8)}...）` };

    // ---- 01-b. Key-pair mode consistency ----
    const secretIsLive = secretKey.startsWith('sk_live_');
    const pubIsLive = publishableKey.startsWith('pk_live_');
    result.checks.keyPairConsistency = secretIsLive === pubIsLive
      ? { ok: true, detail: `Publishable Key と Secret Key は両方とも ${secretIsLive ? '本番(Live)' : 'テスト(Test)'} モードです。` }
      : { ok: false, detail: 'Publishable Key と Secret Key で Live / Test モードが混在しています。' };

    // ---- 01-c. GET /v1/account ----
    try {
      const account = await stripeGet(secretKey, '/account');
      result.checks.accountRetrieve = {
        ok: true,
        detail: 'Stripe アカウント情報を取得できました。',
        accountId: account.id,
        country: account.country,
        displayName: account.business_profile?.name || account.settings?.dashboard?.display_name || account.email,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        defaultCurrency: account.default_currency,
        livemode: account.livemode,
      };
    } catch (err: any) {
      result.checks.accountRetrieve = { ok: false, detail: `アカウント取得失敗: ${err.message}` };
    }

    // ---- 01-d. GET /v1/balance ----
    try {
      const balance = await stripeGet(secretKey, '/balance');
      result.checks.balanceRetrieve = {
        ok: true,
        detail: '残高情報を取得できました（読み取り権限OK）。',
        available: (balance.available || []).map((b: any) => ({ amount: b.amount, currency: b.currency })),
      };
    } catch (err: any) {
      result.checks.balanceRetrieve = { ok: false, detail: `残高取得失敗: ${err.message}` };
    }

    // ---- 02-a. Webhook secret format ----
    if (!webhookSecret) {
      result.checks.webhookSecretFormat = { ok: null, detail: 'Webhook Secret が未設定です（スキップ）。' };
      result.checks.webhookSignatureSelfTest = { ok: null, detail: 'Webhook Secret が未設定のためスキップしました。' };
    } else {
      result.checks.webhookSecretFormat = webhookSecret.startsWith('whsec_')
        ? { ok: true, detail: 'Webhook Secret は whsec_... 形式で正常です。' }
        : { ok: false, detail: `Webhook Secret は whsec_... で始まる必要があります（実際: ${webhookSecret.slice(0, 8)}...）` };

      // ---- 02-b. Signature self-test ----
      result.checks.webhookSignatureSelfTest = selfTestWebhookSignature(webhookSecret);
    }

    // ---- 02-c. List registered webhook endpoints ----
    try {
      const list = await stripeGet(secretKey, '/webhook_endpoints?limit=20');
      const endpoints = (list.data || []).map((e: any) => ({
        url: e.url,
        status: e.status,
        eventCount: Array.isArray(e.enabled_events) ? e.enabled_events.length : 0,
      }));
      result.checks.webhookEndpointRegistration = {
        ok: endpoints.length > 0,
        detail: endpoints.length > 0
          ? `${endpoints.length} 件の Webhook エンドポイントが Stripe 側に登録されています。`
          : 'Stripe 側に Webhook エンドポイントが登録されていません。Stripe Dashboard → Developers → Webhooks から追加してください。',
        endpoints,
      };
    } catch (err: any) {
      result.checks.webhookEndpointRegistration = { ok: false, detail: `エンドポイント一覧取得失敗: ${err.message}` };
    }

    // ---- Overall success: all non-null checks must be ok ----
    const allChecks = Object.values(result.checks);
    const failedCount = allChecks.filter((c) => c.ok === false).length;
    result.success = failedCount === 0;

    return result;
  } catch (error: any) {
    console.error('[testStripeConnection] Unexpected error:', error);
    result.error = error?.message || '接続テスト中に予期しないエラーが発生しました。';
    return result;
  }
}
