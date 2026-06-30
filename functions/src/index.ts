
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { log } from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeSDK = require("stripe") as typeof import("stripe");
import { sendTriggeredEmail } from "./triggers";
import { sendViaAccount } from "./mail/lib/sendDispatcher";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

// Mail account management callables (Phase: multi-account sender)
export {
  listMailAccounts,
  createSmtpAccount,
  updateSmtpAccount,
  deleteMailAccount,
  setDefaultMailAccount,
  testMailAccount,
} from "./mail/accounts";
export { gmailOAuthStart, gmailOAuthCallback } from "./mail/gmailOAuth";
export { revokeGmailAuth } from "./mail/revokeGmail";

log("Top-level: functions/index.ts loaded. v2 with sendAdHocEmail.");

// Initialize Firebase Admin SDK
initializeApp();

// --- Secret Manager Helper ---

const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "studio-3681859885-cd9c1";

async function getSecretValue(secretName: string): Promise<string | null> {
  try {
    const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    const payload = version.payload?.data;
    if (!payload) return null;
    if (typeof payload === "string") return payload;
    if (payload instanceof Uint8Array) return new TextDecoder().decode(payload);
    return String(payload);
  } catch (error: any) {
    if (error?.code === 5) return null; // NOT_FOUND
    log(`[SecretManager] Failed to read secret "${secretName}":`, error.message);
    return null;
  }
}

// --- Types ---

interface GlobalSettings {
  mode: 'test' | 'production';
  adminEmail?: string;
}

// --- Business Day Helper ---
function addBusinessDays(date: Date, days: number): Date {
  let count = 0;
  const result = new Date(date);
  while (count < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) count++;
  }
  return result;
}

// --- Device Release Helper ---
// When a device becomes available (canceled/expired), auto-create a news article
// and notify users on the waitlist for that device.

async function onDeviceReleased(deviceId: string, deviceType: string, reason: 'canceled' | 'expired') {
  const db = getFirestore();
  const reasonLabel = reason === 'expired' ? '契約満了' : '解約';

  // 1. Auto-create a news article
  try {
    await db.collection('news').add({
      title: `【空き速報】${deviceType} がレンタル可能になりました`,
      content: `${deviceType} が${reasonLabel}により空きが出ました。ご希望の方はお早めにお申し込みください。`,
      body: `<p>${deviceType} が${reasonLabel}により空きが出ました。</p><p>ご希望の方はお早めにお申し込みください。</p><p><a href="/devices/${deviceId}" style="color: #2563eb; text-decoration: underline;">この機器の詳細を見る →</a></p>`,
      deviceId: deviceId,
      status: 'published',
      isPublic: true,
      publishedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    log(`[onDeviceReleased] Created news article for ${deviceType} (${reason}).`);
  } catch (err) {
    log(`[onDeviceReleased] Failed to create news:`, err);
  }

  // 2. Notify waitlist users for this device
  try {
    const waitlistSnapshot = await db.collection('waitlist')
      .where('deviceId', '==', deviceId)
      .where('status', '==', 'waiting')
      .get();

    if (waitlistSnapshot.empty) {
      log(`[onDeviceReleased] No waiting users found for device ${deviceId}.`);
      return;
    }

    log(`[onDeviceReleased] Found ${waitlistSnapshot.size} waiting users for device ${deviceId}.`);

    let notifiedCount = 0;
    for (const waitDoc of waitlistSnapshot.docs) {
      const waitData = waitDoc.data();
      const user = {
        name: waitData.userName || 'ユーザー',
        email: waitData.userEmail,
      };

      if (!user.email) {
        log(`[onDeviceReleased] Skipping waitlist ${waitDoc.id}: no email.`);
        continue;
      }

      // Send notification email
      try {
        await sendTriggeredEmail('waitlist_device_available', user, {
          deviceType,
          deviceId,
          reason: reasonLabel,
        });

        // Update waitlist status to 'notified'
        await waitDoc.ref.update({
          status: 'notified',
          updatedAt: Timestamp.now(),
        });

        log(`[onDeviceReleased] Notified ${user.email} for device ${deviceType}.`);
        notifiedCount++;
      } catch (emailErr) {
        log(`[onDeviceReleased] Failed to notify ${user.email}:`, emailErr);
      }
    }

    // Notify staff once that stock was secured for waitlisted users.
    if (notifiedCount > 0) {
      const settingsDoc = await db.collection('settings').doc('global').get();
      const adminEmail = settingsDoc.data()?.managerEmail || settingsDoc.data()?.adminEmail || null;
      if (adminEmail) {
        await sendTriggeredEmail('waitlist_device_available_admin', { name: 'スタッフ', email: adminEmail }, {
          deviceType,
          deviceId,
          notifiedCount,
        });
      }
    }
  } catch (err) {
    log(`[onDeviceReleased] Failed to process waitlist:`, err);
  }
}

// --- Auth Helpers ---

/**
 * Require an authenticated admin caller. Throws HttpsError on failure.
 * Looks up the caller's user doc and verifies role === 'admin'.
 */
async function requireAdmin(request: any): Promise<string> {
  if (!request?.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const db = getFirestore();
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError("permission-denied", "User profile not found.");
  }
  const role = userDoc.data()?.role;
  if (role !== 'admin') {
    throw new HttpsError("permission-denied", "Admin role required.");
  }
  return uid;
}

// --- Stripe Helper ---

/**
 * Reads the current Stripe API mode from `settings/global.mode`.
 * Defaults to 'test' if missing.
 */
async function getStripeMode(): Promise<'test' | 'production'> {
  const db = getFirestore();
  const settingsDoc = await db.collection('settings').doc('global').get();
  const settings = settingsDoc.data() as GlobalSettings | undefined;
  return (settings?.mode === 'production' ? 'production' : 'test');
}

async function getStripeClient(): Promise<any> {
  const apiMode = await getStripeMode();
  const isTest = apiMode === 'test';

  const secretKey = await getSecretValue(
    isTest ? 'STRIPE_TEST_SECRET_KEY' : 'STRIPE_LIVE_SECRET_KEY'
  );

  if (!secretKey) {
    throw new HttpsError("failed-precondition", `Stripe secret key for '${apiMode}' mode is not configured.`);
  }

  return new (StripeSDK as any)(secretKey);
}

/**
 * Resolve the webhook signing secret for the current mode.
 * Tries the mode-specific secret first (STRIPE_TEST_WEBHOOK_SECRET /
 * STRIPE_LIVE_WEBHOOK_SECRET), then falls back to the legacy single-name
 * secret (STRIPE_WEBHOOK_SECRET) for backward compatibility.
 */
async function getWebhookSecretForMode(mode: 'test' | 'production'): Promise<string | null> {
  const modeSpecificName = mode === 'test' ? 'STRIPE_TEST_WEBHOOK_SECRET' : 'STRIPE_LIVE_WEBHOOK_SECRET';
  const modeSpecific = await getSecretValue(modeSpecificName);
  if (modeSpecific) return modeSpecific;
  // Backward compatibility — legacy single-name secret
  return await getSecretValue('STRIPE_WEBHOOK_SECRET');
}

// --- Stripe API version compatibility helpers ---
// Stripe API 2025-04+ moved several fields. These accessors handle both old and new shapes.

/** Extract the subscription id from an invoice across API versions. */
function getInvoiceSubscriptionId(invoice: any): string | null {
  if (!invoice) return null;
  // Old API (≤2024-12)
  if (typeof invoice.subscription === 'string') return invoice.subscription;
  if (invoice.subscription?.id) return invoice.subscription.id;
  // New API (2025-04+) — moved under parent.subscription_details.subscription
  const parentSub = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSub === 'string') return parentSub;
  if (parentSub?.id) return parentSub.id;
  return null;
}

/** Extract the current_period_end Unix timestamp from a subscription across API versions. */
function getSubscriptionCurrentPeriodEnd(stripeSub: any): number | null {
  if (!stripeSub) return null;
  // Old API — top-level
  if (typeof stripeSub.current_period_end === 'number') return stripeSub.current_period_end;
  // New API (2025-04+) — moved onto each subscription item
  const item0 = stripeSub.items?.data?.[0];
  if (typeof item0?.current_period_end === 'number') return item0.current_period_end;
  return null;
}

/**
 * Creates a Stripe PaymentIntent (for one-time payments) or Subscription (for monthly),
 * and returns the clientSecret for frontend confirmation via Stripe Elements.
 */

/**
 * Syncs a device's pricing plans to Stripe as Products and Prices.
 * Creates 3 Products (one per plan: 3m, 6m, 12m) with 2 Prices each (monthly + full).
 * Saves the generated IDs back to the device document.
 */
export const syncDeviceToStripe = onCall(async (request) => {
  await requireAdmin(request);

  const { deviceId } = request.data;
  if (!deviceId) {
    throw new HttpsError("invalid-argument", "deviceId is required.");
  }

  log(`[syncDeviceToStripe] Called for device: ${deviceId}`);
  const db = getFirestore();

  try {
    const deviceDoc = await db.collection('devices').doc(deviceId).get();
    if (!deviceDoc.exists) {
      throw new HttpsError("not-found", "Device not found.");
    }
    const device = deviceDoc.data()!;
    const stripe = await getStripeClient();

    const terms = ['3m', '6m', '12m'] as const;
    const stripeProducts: Record<string, any> = {};

    for (const term of terms) {
      const months = term === '3m' ? 3 : term === '6m' ? 6 : 12;
      const pricing = device.price?.[term];
      if (!pricing) continue;

      const existing = device.stripeProducts?.[term];
      let productId = existing?.productId;

      // Create or reuse Product
      if (!productId) {
        const product = await stripe.products.create({
          name: `${device.type || device.name} - ${months}ヶ月プラン`,
          metadata: { deviceId, term, deviceType: device.type || '' },
        });
        productId = product.id;
        log(`[syncDeviceToStripe] Created Product: ${productId} for ${term}`);
      }

      // Monthly recurring Price — create or update if amount changed
      let monthlyPriceId = existing?.monthlyPriceId;
      if (pricing.monthly > 0) {
        let needsNewMonthly = !monthlyPriceId;
        if (monthlyPriceId) {
          // Check if amount changed
          try {
            const existingPrice = await stripe.prices.retrieve(monthlyPriceId);
            if (existingPrice.unit_amount !== pricing.monthly) {
              // Archive old price, create new one
              await stripe.prices.update(monthlyPriceId, { active: false });
              log(`[syncDeviceToStripe] Archived old monthly Price: ${monthlyPriceId} (was ¥${existingPrice.unit_amount})`);
              needsNewMonthly = true;
            }
          } catch { needsNewMonthly = true; }
        }
        if (needsNewMonthly) {
          const monthlyPrice = await stripe.prices.create({
            product: productId,
            unit_amount: pricing.monthly,
            currency: 'jpy',
            recurring: { interval: 'month' },
            metadata: { deviceId, term, payType: 'monthly' },
          });
          monthlyPriceId = monthlyPrice.id;
          log(`[syncDeviceToStripe] Created monthly Price: ${monthlyPriceId} (¥${pricing.monthly})`);
        }
      }

      // Full one-time Price — create or update if amount changed
      let fullPriceId = existing?.fullPriceId;
      if (pricing.full > 0) {
        let needsNewFull = !fullPriceId;
        if (fullPriceId) {
          try {
            const existingPrice = await stripe.prices.retrieve(fullPriceId);
            if (existingPrice.unit_amount !== pricing.full) {
              await stripe.prices.update(fullPriceId, { active: false });
              log(`[syncDeviceToStripe] Archived old full Price: ${fullPriceId} (was ¥${existingPrice.unit_amount})`);
              needsNewFull = true;
            }
          } catch { needsNewFull = true; }
        }
        if (needsNewFull) {
          const fullPrice = await stripe.prices.create({
            product: productId,
            unit_amount: pricing.full,
            currency: 'jpy',
            metadata: { deviceId, term, payType: 'full' },
          });
          fullPriceId = fullPrice.id;
          log(`[syncDeviceToStripe] Created full Price: ${fullPriceId} (¥${pricing.full})`);
        }
      }

      stripeProducts[term] = { productId, monthlyPriceId, fullPriceId };
    }

    // Save back to Firestore
    await db.collection('devices').doc(deviceId).update({
      stripeProducts,
      updatedAt: Timestamp.now(),
    });

    log(`[syncDeviceToStripe] Sync complete for ${deviceId}`);
    return { status: 'success', stripeProducts };

  } catch (error: any) {
    log("[syncDeviceToStripe] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Failed to sync device to Stripe.");
  }
});

export const createStripePayment = onCall(async (request) => {
  // --- AUTH: Require an authenticated caller and prevent acting on behalf of others ---
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const { paymentLinkId, userId } = request.data || {};
  if (!paymentLinkId || !userId) {
    throw new HttpsError("invalid-argument", "paymentLinkId and userId are required.");
  }
  if (request.auth.uid !== userId) {
    throw new HttpsError("permission-denied", "userId does not match the authenticated caller.");
  }

  log(`[createStripePayment] Called for paymentLink: ${paymentLinkId}, user: ${userId}`);
  const db = getFirestore();

  try {
    // 1. Get payment link data
    const linkDoc = await db.collection('paymentLinks').doc(paymentLinkId).get();
    if (!linkDoc.exists) {
      throw new HttpsError("not-found", "Payment link not found.");
    }
    const link = linkDoc.data()!;

    // 1b. Reject already-used / canceled / expired links
    const linkStatus = link.status || 'pending';
    if (!['pending', 'open', 'active'].includes(linkStatus)) {
      throw new HttpsError("failed-precondition", `Payment link is not usable (status=${linkStatus}).`);
    }

    // 1c. Authorize: the link must belong to this user (if a userId is recorded on the link).
    if (link.userId && link.userId !== userId) {
      throw new HttpsError("permission-denied", "This payment link does not belong to the authenticated user.");
    }

    // 2. Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    const userData = userDoc.data()!;

    // 3. Get application data
    const appDoc = await db.collection('applications').doc(link.applicationId).get();
    const appData = appDoc.exists ? appDoc.data()! : {};

    // 4. Validate amount (Stripe JPY minimum charge is ¥50)
    const amount = link.payAmount || 0;
    if (!Number.isInteger(amount) || amount < 50) {
      throw new HttpsError("invalid-argument", `Invalid payAmount: ${amount}. Must be an integer ≥ 50.`);
    }

    // 5. Initialize Stripe
    const stripe = await getStripeClient();

    // 6. Get or create Stripe customer (idempotent — looks up cached id first)
    let stripeCustomerId = userData.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create(
        {
          email: userData.email,
          name: `${userData.familyName || ''} ${userData.givenName || ''}`.trim(),
          phone: userData.tel,
          metadata: { firebaseUserId: userId },
        },
        { idempotencyKey: `customer-create:${userId}` },
      );
      stripeCustomerId = customer.id;
      log(`[createStripePayment] Created Stripe customer: ${stripeCustomerId}`);
    } else {
      log(`[createStripePayment] Reusing existing Stripe customer: ${stripeCustomerId}`);
    }

    const deviceName = link.deviceName || 'TimeWaver Rental';

    // 7. If a PaymentIntent was already created for this link, reuse it instead of creating
    //    a duplicate. Avoids racing/double-clicks creating multiple charges.
    if (link.stripePaymentIntentId) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(link.stripePaymentIntentId);
        const reusableStatuses = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'];
        if (reusableStatuses.includes(existingPi.status) && existingPi.amount === amount) {
          log(`[createStripePayment] Reusing existing PaymentIntent: ${existingPi.id} (status=${existingPi.status})`);
          return {
            clientSecret: existingPi.client_secret!,
            stripeCustomerId,
            paymentIntentId: existingPi.id,
          };
        }
        if (existingPi.status === 'succeeded') {
          throw new HttpsError("failed-precondition", "This payment link has already been paid.");
        }
      } catch (reuseErr: any) {
        if (reuseErr instanceof HttpsError) throw reuseErr;
        log(`[createStripePayment] Could not reuse existing PaymentIntent: ${reuseErr.message}`);
      }
    }

    // 8. Build common PaymentIntent params (card-only to match the frontend <CardElement>)
    let clientSecret: string;
    let paymentIntentId: string = '';

    const idempotencyKey = `pi-create:${paymentLinkId}:${amount}:${link.payType || 'full'}`;

    if (link.payType === 'full') {
      // --- One-time payment via PaymentIntent ---
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount,
          currency: 'jpy',
          customer: stripeCustomerId,
          description: `Rental: ${deviceName}`,
          metadata: {
            paymentLinkId,
            applicationId: link.applicationId,
            deviceId: link.deviceId || '',
            userId,
            payType: 'full',
          },
          payment_method_types: ['card'],
        },
        { idempotencyKey },
      );

      clientSecret = paymentIntent.client_secret!;
      paymentIntentId = paymentIntent.id;
      log(`[createStripePayment] Created full PaymentIntent: ${paymentIntent.id}`);
    } else {
      // --- Monthly: charge 1st month + save card for future subscription ---
      let monthlyPriceId: string | null = null;
      if (link.deviceId) {
        const deviceDoc = await db.collection('devices').doc(link.deviceId).get();
        if (deviceDoc.exists) {
          const deviceData = deviceDoc.data()!;
          const rentalPeriod = appData.rentalPeriod || 12;
          const termKey = rentalPeriod <= 3 ? '3m' : rentalPeriod <= 6 ? '6m' : '12m';
          monthlyPriceId = deviceData.stripeProducts?.[termKey]?.monthlyPriceId || null;
          log(`[createStripePayment] Device priceId for ${termKey}: ${monthlyPriceId}`);
        }
      }

      const rentalMonths = appData.rentalPeriod || 12;

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount,
          currency: 'jpy',
          customer: stripeCustomerId,
          description: `Monthly Rental (1st month): ${deviceName}`,
          metadata: {
            paymentLinkId,
            applicationId: link.applicationId,
            deviceId: link.deviceId || '',
            userId,
            payType: 'monthly',
            rentalMonths: String(rentalMonths),
            monthlyPriceId: monthlyPriceId || '',
          },
          payment_method_types: ['card'],
          setup_future_usage: 'off_session',
        },
        { idempotencyKey },
      );

      clientSecret = paymentIntent.client_secret!;
      paymentIntentId = paymentIntent.id;
      log(`[createStripePayment] Created monthly PaymentIntent: ${paymentIntent.id} (¥${amount}), priceId: ${monthlyPriceId}`);
    }

    // 9. Persist the PaymentIntent id back onto the paymentLink so future calls can reuse it
    try {
      await linkDoc.ref.update({
        stripePaymentIntentId: paymentIntentId,
        stripeCustomerId,
        updatedAt: Timestamp.now(),
      });
    } catch (writeErr: any) {
      log(`[createStripePayment] Warning: failed to persist PI on paymentLink:`, writeErr.message);
    }

    return {
      clientSecret,
      stripeCustomerId,
      paymentIntentId,
    };

  } catch (error: any) {
    log("[createStripePayment] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Failed to create payment.");
  }
});

/**
 * Creates a Stripe Subscription for monthly plans AFTER the first month's PaymentIntent succeeds.
 * Uses the saved payment method from the initial charge to enable recurring billing.
 * Called by the frontend after confirmCardPayment succeeds for monthly payType.
 *
 * IMPORTANT: Sets `cancel_at` based on the rental contract endAt so Stripe automatically
 * stops charging at contract expiry. Without this, customers are over-charged after
 * the rental period ends.
 */
export const createStripeSubscription = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { stripeCustomerId, monthlyPriceId, paymentIntentId, firestoreSubscriptionId, payAmount, deviceName } = request.data;

  if (!stripeCustomerId || !paymentIntentId) {
    throw new HttpsError("invalid-argument", "stripeCustomerId and paymentIntentId are required.");
  }

  log(`[createStripeSubscription] Customer: ${stripeCustomerId}, basePriceId: ${monthlyPriceId}, payAmount: ${payAmount}, firestoreSubId: ${firestoreSubscriptionId}`);

  try {
    const stripe = await getStripeClient();
    const db = getFirestore();

    // 1. Get the payment method from the successful PaymentIntent
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentMethodId = typeof pi.payment_method === 'string' ? pi.payment_method : (pi.payment_method as any)?.id;

    if (!paymentMethodId) {
      throw new HttpsError("failed-precondition", "No payment method found on PaymentIntent.");
    }

    // Verify the caller owns this customer (the PaymentIntent's customer must match)
    const piCustomer = typeof pi.customer === 'string' ? pi.customer : (pi.customer as any)?.id;
    if (piCustomer && piCustomer !== stripeCustomerId) {
      throw new HttpsError("permission-denied", "PaymentIntent does not belong to this customer.");
    }

    // 2. Set as default payment method on the customer
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // 3. Determine which priceId to use for the subscription
    let subscriptionPriceId = monthlyPriceId;

    if (monthlyPriceId && payAmount) {
      // Check if the base price matches the actual payAmount (which includes modules)
      try {
        const basePrice = await stripe.prices.retrieve(monthlyPriceId);
        if (basePrice.unit_amount !== payAmount) {
          // Amount differs (modules added) — create a dynamic price re-using the base product
          const baseProductId = typeof basePrice.product === 'string' ? basePrice.product : (basePrice.product as any)?.id;
          const dynamicPriceParams: any = {
            unit_amount: payAmount,
            currency: 'jpy',
            recurring: { interval: 'month' },
            metadata: { basePriceId: monthlyPriceId, includesModules: 'true' },
          };
          if (baseProductId) {
            dynamicPriceParams.product = baseProductId;
          } else {
            dynamicPriceParams.product_data = { name: `${deviceName || 'TimeWaver Rental'} (カスタム)` };
          }
          const dynamicPrice = await stripe.prices.create(dynamicPriceParams);
          subscriptionPriceId = dynamicPrice.id;
          log(`[createStripeSubscription] Module pricing: base ¥${basePrice.unit_amount} → total ¥${payAmount}, dynamic price: ${dynamicPrice.id}`);
        }
      } catch (e: any) {
        log(`[createStripeSubscription] Could not check base price, using as-is:`, e.message);
      }
    }

    if (!subscriptionPriceId) {
      // No pre-created price — create a dynamic one from payAmount
      if (!payAmount) throw new HttpsError("invalid-argument", "Either monthlyPriceId or payAmount is required.");
      const dynamicPrice = await stripe.prices.create({
        unit_amount: payAmount,
        currency: 'jpy',
        recurring: { interval: 'month' },
        product_data: { name: `${deviceName || 'TimeWaver Rental'}` },
      });
      subscriptionPriceId = dynamicPrice.id;
      log(`[createStripeSubscription] Created fallback dynamic price: ${subscriptionPriceId} (¥${payAmount})`);
    }

    // 4. Read the Firestore sub doc to get the rental endAt (used for cancel_at)
    let cancelAtUnix: number | null = null;
    let rentalMonths: number | null = null;
    let firestoreEndAt: Date | null = null;
    if (firestoreSubscriptionId) {
      const fsSubDoc = await db.collection('subscriptions').doc(firestoreSubscriptionId).get();
      if (fsSubDoc.exists) {
        const fsData = fsSubDoc.data()!;
        rentalMonths = fsData.rentalMonths || null;
        const endAtRaw = fsData.endAt;
        if (endAtRaw?.toDate) firestoreEndAt = endAtRaw.toDate();
        else if (endAtRaw?._seconds) firestoreEndAt = new Date(endAtRaw._seconds * 1000);
      }
    }

    // 5. Compute billing_cycle_anchor: same day-of-month next month, clamped to ≤28 to avoid Feb skips
    const now = new Date();
    const targetDay = Math.min(now.getDate(), 28);
    const anchorDate = new Date(now.getFullYear(), now.getMonth() + 1, targetDay, now.getHours(), now.getMinutes(), now.getSeconds());

    // 6. Compute cancel_at: end of the rental contract.
    // - If we have firestoreEndAt → use it
    // - Else fall back to anchor + (rentalMonths-1) months (1st month already paid via PI)
    if (firestoreEndAt && firestoreEndAt.getTime() > anchorDate.getTime()) {
      cancelAtUnix = Math.floor(firestoreEndAt.getTime() / 1000);
    } else if (rentalMonths && rentalMonths > 1) {
      const fallbackEnd = new Date(anchorDate);
      fallbackEnd.setMonth(fallbackEnd.getMonth() + (rentalMonths - 1));
      cancelAtUnix = Math.floor(fallbackEnd.getTime() / 1000);
    }

    const subParams: any = {
      customer: stripeCustomerId,
      items: [{ price: subscriptionPriceId }],
      default_payment_method: paymentMethodId,
      billing_cycle_anchor: Math.floor(anchorDate.getTime() / 1000),
      proration_behavior: 'none',
      collection_method: 'charge_automatically',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        firestoreSubscriptionId: firestoreSubscriptionId || '',
        paymentIntentId,
        rentalMonths: rentalMonths ? String(rentalMonths) : '',
      },
    };
    if (cancelAtUnix) {
      subParams.cancel_at = cancelAtUnix;
      log(`[createStripeSubscription] Will cancel_at ${new Date(cancelAtUnix * 1000).toISOString()}`);
    } else {
      log(`[createStripeSubscription] WARNING: no cancel_at set (no endAt and no rentalMonths). Subscription will recur until manually canceled.`);
    }

    const subscription = await stripe.subscriptions.create(
      subParams,
      { idempotencyKey: `sub-create:${firestoreSubscriptionId || paymentIntentId}` },
    );

    log(`[createStripeSubscription] Created Subscription: ${subscription.id}, cancel_at: ${(subscription as any).cancel_at || 'none'}`);

    // 7. Update Firestore subscription doc with Stripe IDs
    if (firestoreSubscriptionId) {
      await db.collection('subscriptions').doc(firestoreSubscriptionId).update({
        stripeSubscriptionId: subscription.id,
        stripePaymentIntentId: paymentIntentId,
        stripeCustomerId,
        'stripeStatus.status': subscription.status,
        'stripeStatus.cancelAt': cancelAtUnix ? new Date(cancelAtUnix * 1000).toISOString() : null,
        'stripeStatus.lastSyncedAt': new Date().toISOString(),
        updatedAt: Timestamp.now(),
      });
      log(`[createStripeSubscription] Updated Firestore sub: ${firestoreSubscriptionId}`);
    }

    return {
      status: 'success',
      stripeSubscriptionId: subscription.id,
      cancelAt: cancelAtUnix,
    };

  } catch (error: any) {
    log("[createStripeSubscription] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Failed to create subscription.");
  }
});

/**
 * Fetches payment data from Stripe API.
 * Modes: get-payment-by-id (PaymentIntent), get-subscription (Subscription), get-invoices (Invoice list)
 */
export const getPaymentData = onCall(async (request) => {
  await requireAdmin(request);

  const { mode, data } = request.data;
  const { paymentIntentId, subscriptionId } = data || {};

  log("[getPaymentData] Called with mode:", mode, "and data:", data);

  try {
    const stripe = await getStripeClient();

    let result: any;
    switch (mode) {
      case 'get-payment-by-id':
        if (!paymentIntentId) throw new HttpsError("invalid-argument", "paymentIntentId is required.");
        result = await stripe.paymentIntents.retrieve(paymentIntentId);
        break;
      case 'get-subscription':
        if (!subscriptionId) throw new HttpsError("invalid-argument", "subscriptionId is required.");
        result = await stripe.subscriptions.retrieve(subscriptionId);
        break;
      case 'get-invoices':
        if (!subscriptionId) throw new HttpsError("invalid-argument", "subscriptionId is required.");
        result = await stripe.invoices.list({ subscription: subscriptionId, limit: 100 });
        break;
      default:
        throw new HttpsError("invalid-argument", "Invalid mode specified.");
    }

    log("[getPaymentData] Success.");
    return { status: 'success', data: result };

  } catch (error: any) {
    log("[getPaymentData] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Failed to fetch payment data.");
  }
});


/**
 * Fetches a list of subscriptions from Firestore and enriches them with user data.
 * This is designed to provide all necessary data for the admin payment dashboard.
 */
export const getSubscriptionsList = onCall(async (request) => {
  await requireAdmin(request);

  log("[getSubscriptionsList] Function called.");
  const db = getFirestore();

  try {
    // 1. Fetch all subscriptions from the 'subscriptions' collection
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    log(`[getSubscriptionsList] Found ${subscriptionsSnapshot.size} subscription documents.`);

    if (subscriptionsSnapshot.empty) {
      return [];
    }

    // 2. Create a list of user IDs to fetch, avoiding duplicates
    const userIds = [...new Set(subscriptionsSnapshot.docs.map((doc) => doc.data().userId))];

    // 3. Fetch the corresponding user documents from the 'users' collection
    const userDocs = await db.getAll(...userIds.map((id) => db.collection('users').doc(id)));

    // 4. Create a lookup map for user data (id -> {displayName, email})
    const userMap = new Map<string, { displayName: string; email: string }>();
    userDocs.forEach((doc) => {
      if (doc.exists) {
        const userData = doc.data();
        const displayName = `${userData?.familyName || ''} ${userData?.givenName || ''}`.trim();
        userMap.set(doc.id, { displayName: displayName || 'Unnamed User', email: userData?.email || '' });
      }
    });
    log(`[getSubscriptionsList] Created a map for ${userMap.size} users.`);

    // 5. Combine subscription data with user data
    const subscriptionsList = subscriptionsSnapshot.docs.map((doc) => {
      const subscription = doc.data();
      const user = userMap.get(subscription.userId) || { displayName: 'Unknown User', email: '' };

      const toISO = (ts: any) => {
        if (!ts) return null;
        if (ts.toDate) return ts.toDate().toISOString();
        if (ts._seconds) return new Date(ts._seconds * 1000).toISOString();
        return null;
      };

      return {
        id: doc.id,
        ...subscription,
        customerName: user.displayName,
        email: user.email,
        createdAt: toISO(subscription.createdAt),
        updatedAt: toISO(subscription.updatedAt),
        startAt: toISO(subscription.startAt),
        endAt: toISO(subscription.endAt),
      };
    });

    log("[getSubscriptionsList] Successfully combined subscription and user data.");
    return subscriptionsList;

  } catch (error) {
    log("[getSubscriptionsList] ERROR caught:", error);

    if (error instanceof HttpsError) {
      throw error;
    } else {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      log("[getSubscriptionsList] Throwing internal error:", { errorMessage, originalError: error });
      throw new HttpsError("internal", "Failed to fetch subscription list. See function logs for details.");
    }
  }
});

/**
 * Syncs payment data from Stripe API for all subscriptions in Firestore.
 * For each subscription, fetches the latest status from Stripe and updates Firestore.
 * Also handles auto-expiry and renewal reminders.
 */
export const syncPaymentData = onCall(async (request) => {
  await requireAdmin(request);

  log("[syncPaymentData] Function called.");
  const db = getFirestore();

  try {
    // 1. Initialize Stripe
    const stripe = await getStripeClient();

    // 2. Get all subscriptions from Firestore
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    log(`[syncPaymentData] Found ${subscriptionsSnapshot.size} subscriptions to sync.`);

    const results: { synced: number; errors: number; details: any[] } = { synced: 0, errors: 0, details: [] };

    // 3. For each subscription, fetch data from Stripe
    for (const subDoc of subscriptionsSnapshot.docs) {
      const sub = subDoc.data();
      const subId = subDoc.id;

      try {
        const updates: Record<string, any> = {};

        // Sync Stripe subscription status
        if (sub.stripeSubscriptionId) {
          const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
          const cpe = getSubscriptionCurrentPeriodEnd(stripeSub);

          updates.stripeStatus = {
            status: stripeSub.status,
            currentPeriodEnd: cpe ? new Date(cpe * 1000).toISOString() : null,
            cancelAt: (stripeSub as any).cancel_at ? new Date((stripeSub as any).cancel_at * 1000).toISOString() : null,
            lastSyncedAt: new Date().toISOString(),
          };

          // Update local status based on Stripe status
          if (['canceled', 'unpaid', 'incomplete_expired'].includes(stripeSub.status) && sub.status === 'active') {
            updates.status = 'completed';
          }

          results.details.push({ id: subId, type: 'subscription', synced: true, stripeStatus: stripeSub.status });
        }

        // Sync one-time PaymentIntent status
        if (sub.stripePaymentIntentId) {
          const pi = await stripe.paymentIntents.retrieve(sub.stripePaymentIntentId);

          updates.stripeStatus = {
            status: pi.status,
            amount: pi.amount,
            lastSyncedAt: new Date().toISOString(),
          };

          results.details.push({ id: subId, type: 'payment_intent', synced: true, status: pi.status });
        }

        // Write updates to Firestore
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = Timestamp.now();
          await db.collection('subscriptions').doc(subId).update(updates);
          results.synced++;
        }
      } catch (err: any) {
        results.errors++;
        log(`[syncPaymentData] Error syncing ${subId}:`, err.message);
        results.details.push({ id: subId, synced: false, error: err.message });
      }
    }

    // --- Send renewal reminder 1 month before expiry ---
    const renewalSettings = (await db.collection('settings').doc('global').get()).data() || {};
    const renewalAdminEmail = renewalSettings.managerEmail || renewalSettings.adminEmail || null;
    let reminders = 0;
    for (const subDoc of subscriptionsSnapshot.docs) {
      const sub = subDoc.data();
      if (sub.status !== 'active' || sub.renewalReminderSent) continue;

      const endAt = sub.endAt?.toDate ? sub.endAt.toDate() : (sub.endAt?._seconds ? new Date(sub.endAt._seconds * 1000) : null);
      if (!endAt) continue;

      const now = new Date();
      const oneMonthBefore = new Date(endAt);
      oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);

      if (now >= oneMonthBefore && now < endAt) {
        // Within 1 month of expiry — send renewal reminder
        const userId = sub.userId;
        if (userId) {
          const userDoc = await db.collection('users').doc(userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            const userName = `${userData?.familyName || ''} ${userData?.givenName || ''}`.trim();
            const userEmail = userData?.email;

            if (userEmail) {
              const startAtDate = sub.startAt?.toDate ? sub.startAt.toDate() : (sub.startAt?._seconds ? new Date(sub.startAt._seconds * 1000) : null);
              const renewalData = {
                deviceType: sub.deviceType || '',
                endDate: endAt.toLocaleDateString('ja-JP'),
                startAt: startAtDate ? startAtDate.toLocaleDateString('ja-JP') : '',
              };
              await sendTriggeredEmail('contract_renewal_reminder', { name: userName, email: userEmail }, renewalData);

              // Notify staff so return/renewal logistics can be prepared.
              if (renewalAdminEmail) {
                await sendTriggeredEmail('contract_renewal_reminder_admin', { name: 'スタッフ', email: renewalAdminEmail }, {
                  ...renewalData,
                  userName,
                  userEmail,
                });
              }

              // Mark as sent to avoid duplicates
              await db.collection('subscriptions').doc(subDoc.id).update({
                renewalReminderSent: true,
              });

              reminders++;
              log(`[syncPaymentData] Sent renewal reminder for ${subDoc.id} to ${userEmail}.`);
            }
          }
        }
      }
    }

    // --- Auto-cancel subscriptions stuck in past_due > PAST_DUE_GRACE_DAYS ---
    // Stripe Smart Retries handles retry attempts (default ~4 retries over 21 days).
    // We add our own grace policy: if past_due persists for > 14 days from first failure,
    // cancel both Stripe and Firestore, release the device, and notify all parties.
    const PAST_DUE_GRACE_DAYS = 14;
    let pastDueCanceled = 0;
    for (const subDoc of subscriptionsSnapshot.docs) {
      const sub = subDoc.data();
      if (sub.status !== 'active') continue;
      if (sub.stripeStatus?.status !== 'past_due') continue;

      const firstFailedRaw = sub.paymentFailure?.firstFailedAt;
      if (!firstFailedRaw) continue; // grace clock not started
      const firstFailed = new Date(firstFailedRaw);
      const graceDeadline = new Date(firstFailed.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);

      if (new Date() < graceDeadline) continue; // still within grace

      log(`[syncPaymentData] Auto-canceling sub ${subDoc.id}: past_due since ${firstFailed.toISOString()} (>${PAST_DUE_GRACE_DAYS}d grace exceeded).`);

      // 1. Cancel Stripe sub
      if (sub.stripeSubscriptionId) {
        try {
          const currentSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
          if (!['canceled', 'incomplete_expired'].includes(currentSub.status)) {
            await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
          }
        } catch (cancelErr: any) {
          log(`[syncPaymentData] Failed to cancel Stripe sub for past_due:`, cancelErr.message);
        }
      }

      // 2. Mark Firestore canceled
      await db.collection('subscriptions').doc(subDoc.id).update({
        status: 'canceled',
        'stripeStatus.status': 'canceled',
        'stripeStatus.lastSyncedAt': new Date().toISOString(),
        cancelReason: 'payment_failure_grace_exceeded',
        canceledAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // 3. Release device
      if (sub.deviceId) {
        const deviceDoc = await db.collection('devices').doc(sub.deviceId).get();
        const deviceType = deviceDoc.data()?.type || sub.deviceType || 'Unknown Device';
        await db.collection('devices').doc(sub.deviceId).update({
          status: 'available',
          currentUserId: null,
          updatedAt: Timestamp.now(),
        });
        await onDeviceReleased(sub.deviceId, deviceType, 'canceled');
      }

      // 4. Notify user + admin
      try {
        if (sub.userId) {
          const userDoc = await db.collection('users').doc(sub.userId).get();
          const userData = userDoc.exists ? userDoc.data() : null;
          if (userData?.email) {
            const userName = `${userData.familyName || ''} ${userData.givenName || ''}`.trim() || 'お客様';
            await sendTriggeredEmail('subscription_canceled_payment_failure', { name: userName, email: userData.email }, {
              deviceType: sub.deviceType || '',
              graceDays: PAST_DUE_GRACE_DAYS,
              firstFailedAt: firstFailed.toLocaleDateString('ja-JP'),
            });
          }
        }
        const settingsDoc = await db.collection('settings').doc('global').get();
        const adminEmail = settingsDoc.data()?.managerEmail;
        if (adminEmail) {
          await sendTriggeredEmail('subscription_canceled_payment_failure_admin', { name: 'Admin', email: adminEmail }, {
            subscriptionId: subDoc.id,
            userId: sub.userId,
            deviceType: sub.deviceType || '',
            firstFailedAt: firstFailed.toLocaleDateString('ja-JP'),
          });
        }
      } catch (notifyErr: any) {
        log(`[syncPaymentData] Failed to notify on past_due cancellation:`, notifyErr.message);
      }

      pastDueCanceled++;
    }

    // --- Auto-expire subscriptions past their end date ---
    let expired = 0;
    for (const subDoc of subscriptionsSnapshot.docs) {
      const sub = subDoc.data();
      if (sub.status !== 'active') continue;

      const endAt = sub.endAt?.toDate ? sub.endAt.toDate() : (sub.endAt?._seconds ? new Date(sub.endAt._seconds * 1000) : null);
      if (!endAt) continue;

      if (endAt < new Date()) {
        // CRITICAL: Cancel the Stripe subscription FIRST so customers don't get charged
        // beyond the contract end date. Older subs may not have cancel_at set, so this is
        // a safety net. Idempotent — Stripe returns the canceled sub if already canceled.
        if (sub.stripeSubscriptionId) {
          try {
            const currentSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
            if (!['canceled', 'incomplete_expired'].includes(currentSub.status)) {
              await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
              log(`[syncPaymentData] Canceled Stripe subscription ${sub.stripeSubscriptionId} for expired sub ${subDoc.id}.`);
            }
          } catch (cancelErr: any) {
            log(`[syncPaymentData] Failed to cancel Stripe sub ${sub.stripeSubscriptionId}:`, cancelErr.message);
            // Continue — we still want to mark Firestore as expired even if Stripe call fails
          }
        }

        // Subscription has passed its end date — mark as expired
        await db.collection('subscriptions').doc(subDoc.id).update({
          status: 'expired',
          'stripeStatus.status': 'canceled',
          'stripeStatus.lastSyncedAt': new Date().toISOString(),
          updatedAt: Timestamp.now(),
        });

        // Update linked application
        if (sub.applicationId) {
          await db.collection('applications').doc(sub.applicationId).update({
            status: 'expired',
            updatedAt: Timestamp.now(),
          });
        }

        // Check if a renewal subscription exists for this device
        // If renewed, skip device release and return flow
        let hasRenewal = false;
        if (sub.deviceId) {
          const renewalSubs = await db.collection('subscriptions')
            .where('deviceId', '==', sub.deviceId)
            .where('previousSubscriptionId', '==', subDoc.id)
            .where('status', '==', 'active')
            .get();
          hasRenewal = !renewalSubs.empty;
        }

        if (hasRenewal) {
          log(`[syncPaymentData] Subscription ${subDoc.id} expired but has active renewal — skipping device release.`);
        } else if (sub.deviceId) {
          // No renewal — release device and notify waitlist
          const deviceDoc = await db.collection('devices').doc(sub.deviceId).get();
          const deviceType = deviceDoc.data()?.type || sub.deviceType || 'Unknown Device';

          await db.collection('devices').doc(sub.deviceId).update({
            status: 'available',
            currentUserId: null,
            updatedAt: Timestamp.now(),
          });

          await onDeviceReleased(sub.deviceId, deviceType, 'expired');
        }

        expired++;
        log(`[syncPaymentData] Auto-expired subscription ${subDoc.id} (endAt: ${endAt.toISOString()})`);
      }
    }

    // --- Auto-expire isNew flag on devices older than 6 months ---
    let newExpired = 0;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const newDevicesSnap = await db.collection('devices').where('isNew', '==', true).get();
    for (const devDoc of newDevicesSnap.docs) {
      const devData = devDoc.data();
      const createdAt = devData.createdAt?.toDate ? devData.createdAt.toDate() : null;
      if (createdAt && createdAt < sixMonthsAgo) {
        await devDoc.ref.update({ isNew: false, updatedAt: Timestamp.now() });
        newExpired++;
        log(`[syncPaymentData] Device ${devDoc.id} isNew → false (older than 6 months).`);
      }
    }

    log(`[syncPaymentData] Sync complete. Synced: ${results.synced}, Errors: ${results.errors}, Expired: ${expired}, PastDueCanceled: ${pastDueCanceled}, Reminders: ${reminders}, NewExpired: ${newExpired}`);
    return { status: 'success', ...results, expired, pastDueCanceled, reminders, newExpired };

  } catch (error) {
    log("[syncPaymentData] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Sync failed. Check function logs.");
  }
});

/**
 * Stops a recurring subscription via Stripe API.
 * Immediately cancels the subscription.
 * Also updates the subscription status in Firestore.
 */
export const stopRecurringPayment = onCall(async (request) => {
  await requireAdmin(request);

  const { subscriptionId } = request.data;
  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "subscriptionId is required.");
  }

  log(`[stopRecurringPayment] Called for subscription: ${subscriptionId}`);
  const db = getFirestore();

  try {
    const subDoc = await db.collection('subscriptions').doc(subscriptionId).get();
    if (!subDoc.exists) {
      throw new HttpsError("not-found", "Subscription not found.");
    }
    const sub = subDoc.data()!;

    if (!sub.stripeSubscriptionId) {
      throw new HttpsError("failed-precondition", "This subscription does not have a stripeSubscriptionId.");
    }

    // Cancel via Stripe API (immediate cancellation)
    const stripe = await getStripeClient();
    const canceledSub = await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    log(`[stopRecurringPayment] Stripe response: status=${canceledSub.status}`);

    // Update subscription in Firestore
    await db.collection('subscriptions').doc(subscriptionId).update({
      status: 'canceled',
      'stripeStatus.status': 'canceled',
      updatedAt: Timestamp.now(),
    });

    // Also update the linked application status
    if (sub.applicationId) {
      await db.collection('applications').doc(sub.applicationId).update({
        status: 'canceled',
        updatedAt: Timestamp.now(),
      });
      log(`[stopRecurringPayment] Updated application ${sub.applicationId} status to 'canceled'.`);
    }

    // Release the device back to available and notify waitlist
    if (sub.deviceId) {
      // Get device type before releasing
      const deviceDoc = await db.collection('devices').doc(sub.deviceId).get();
      const deviceType = deviceDoc.data()?.type || sub.deviceType || 'Unknown Device';

      await db.collection('devices').doc(sub.deviceId).update({
        status: 'available',
        currentUserId: null,
        updatedAt: Timestamp.now(),
      });
      log(`[stopRecurringPayment] Released device ${sub.deviceId} back to available.`);

      // Auto-create news and notify waitlist
      await onDeviceReleased(sub.deviceId, deviceType, 'canceled');
    }

    return { status: 'success', message: '継続決済を停止しました。' };

  } catch (error: any) {
    log("[stopRecurringPayment] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Failed to stop recurring payment.");
  }
});

/**
 * Creates a Stripe Billing Portal session URL for the authenticated user.
 * The user is redirected to Stripe's hosted portal where they can update card
 * details, view invoices, and (if enabled in Stripe settings) cancel.
 *
 * Returns: { url: string }
 */
export const createBillingPortalSession = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const { returnUrl } = request.data || {};

  const db = getFirestore();
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError("not-found", "User profile not found.");
  }
  const userData = userDoc.data()!;
  const stripeCustomerId = userData.stripeCustomerId;
  if (!stripeCustomerId) {
    throw new HttpsError(
      "failed-precondition",
      "No Stripe customer ID on file. Please complete a payment first.",
    );
  }

  try {
    const stripe = await getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl || 'https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app/mypage/payments',
    });
    log(`[createBillingPortalSession] Created portal session for ${uid}: ${session.id}`);
    return { url: session.url };
  } catch (error: any) {
    log("[createBillingPortalSession] ERROR:", error);
    // Stripe returns "No configuration provided" if the portal hasn't been
    // configured in the Stripe Dashboard yet. Surface that to the caller so
    // the user-facing UI can show a helpful error.
    if (typeof error.message === 'string' && error.message.includes('No configuration')) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe Billing Portal is not configured. Admin: please enable it at Stripe Dashboard → Settings → Billing → Customer portal.",
      );
    }
    throw new HttpsError("internal", error.message || "Failed to create billing portal session.");
  }
});

/**
 * Refunds a payment via Stripe API.
 *
 * Accepts any of the following parameter shapes:
 *   - { subscriptionId, paymentIntentId }                  — refund a PaymentIntent directly
 *   - { subscriptionId, paymentId, type: 'charge' }        — legacy alias for paymentIntentId
 *   - { subscriptionId, invoiceId }                        — refund the PaymentIntent attached to an invoice
 *   - { subscriptionId, historyId, type: 'recurring' }     — legacy alias for invoiceId
 */
export const refundPayment = onCall(async (request) => {
  await requireAdmin(request);

  const {
    subscriptionId,
    paymentIntentId,
    paymentId,        // legacy alias from admin UI
    invoiceId,
    historyId,        // legacy alias from admin UI (= invoice id for recurring rows)
    type,
  } = request.data || {};

  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "subscriptionId is required.");
  }

  // Resolve the target: PaymentIntent ID takes precedence; otherwise resolve via invoice
  const piIdInput: string | undefined = paymentIntentId || (type !== 'recurring' ? paymentId : undefined);
  const invIdInput: string | undefined = invoiceId || (type === 'recurring' ? historyId : undefined);

  if (!piIdInput && !invIdInput) {
    throw new HttpsError("invalid-argument", "Either paymentIntentId/paymentId or invoiceId/historyId is required.");
  }

  log(`[refundPayment] subscriptionId=${subscriptionId}, piIdInput=${piIdInput || '-'}, invIdInput=${invIdInput || '-'}, type=${type || '-'}`);

  const db = getFirestore();

  try {
    const subDoc = await db.collection('subscriptions').doc(subscriptionId).get();
    if (!subDoc.exists) {
      throw new HttpsError("not-found", "Subscription not found.");
    }

    const stripe = await getStripeClient();

    // Resolve the actual PaymentIntent ID
    let resolvedPaymentIntentId = piIdInput;
    let resolvedInvoiceId: string | undefined = invIdInput;

    if (!resolvedPaymentIntentId && resolvedInvoiceId) {
      // Look up the invoice and find its payment_intent
      const invoice = await stripe.invoices.retrieve(resolvedInvoiceId);
      const piRef = (invoice as any).payment_intent;
      const piFromInvoice = typeof piRef === 'string' ? piRef : piRef?.id;
      if (!piFromInvoice) {
        throw new HttpsError("failed-precondition", `Invoice ${resolvedInvoiceId} has no associated PaymentIntent (status=${invoice.status}).`);
      }
      resolvedPaymentIntentId = piFromInvoice;
    }

    if (!resolvedPaymentIntentId) {
      throw new HttpsError("failed-precondition", "Could not resolve a PaymentIntent to refund.");
    }

    const refund = await stripe.refunds.create({
      payment_intent: resolvedPaymentIntentId,
    });

    log(`[refundPayment] Stripe refund created: ${refund.id}, status: ${refund.status}, amount: ${refund.amount}`);

    // Record refund in Firestore
    const refundRecord = {
      refundId: refund.id,
      paymentIntentId: resolvedPaymentIntentId,
      invoiceId: resolvedInvoiceId || null,
      amount: refund.amount,
      status: refund.status,
      refundedAt: new Date().toISOString(),
    };

    const subRef = db.collection('subscriptions').doc(subscriptionId);
    const currentDoc = await subRef.get();
    const existingRefunds = currentDoc.data()?.refundHistory || [];
    await subRef.update({
      refundHistory: [...existingRefunds, refundRecord],
      updatedAt: Timestamp.now(),
    });

    return {
      status: 'success',
      message: '返金処理が完了しました。',
      data: {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
        paymentIntentId: resolvedPaymentIntentId,
      },
    };

  } catch (error: any) {
    log("[refundPayment] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Refund failed.");
  }
});

/**
 * Fetches payment history for a specific subscription from Stripe API.
 *
 * Returns a frontend-compatible shape (legacy field names retained from the
 * pre-Stripe payment provider so existing admin UI keeps working):
 *   - subscription.paymentId        = stripePaymentIntentId
 *   - subscription.recurringId      = stripeSubscriptionId
 *   - subscription.customerId       = stripeCustomerId
 *   - history[].historyId           = stripe id (PaymentIntent or Invoice)
 *   - history[].paymentId           = PaymentIntent id (when resolvable)
 *   - history[].paymentStatus       = mapped to {SOLD,AUTHORIZED,OUTSTANDING,CANCELED}
 *   - history[].type                = 'charge' | 'recurring'
 */
export const getPaymentHistory = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { subscriptionId } = request.data;
  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "subscriptionId is required.");
  }

  log(`[getPaymentHistory] Called for subscription: ${subscriptionId}`);
  const db = getFirestore();

  // Authorize: caller must be admin or the subscription's owner
  {
    const callerUid = request.auth.uid;
    const callerDoc = await db.collection('users').doc(callerUid).get();
    const isAdmin = callerDoc.data()?.role === 'admin';
    if (!isAdmin) {
      const subPeek = await db.collection('subscriptions').doc(subscriptionId).get();
      if (!subPeek.exists || subPeek.data()?.userId !== callerUid) {
        throw new HttpsError("permission-denied", "You do not have access to this subscription.");
      }
    }
  }

  // Map Stripe statuses → admin UI legacy status values
  const mapPaymentIntentStatus = (s: string): string => {
    switch (s) {
      case 'succeeded': return 'SOLD';
      case 'processing': return 'AUTHORIZED';
      case 'requires_payment_method':
      case 'requires_action':
      case 'requires_confirmation':
      case 'requires_capture':
        return 'OUTSTANDING';
      case 'canceled': return 'CANCELED';
      default: return s.toUpperCase();
    }
  };

  const mapInvoiceStatus = (s: string | null | undefined): string => {
    switch (s) {
      case 'paid': return 'SOLD';
      case 'open': return 'OUTSTANDING';
      case 'uncollectible': return 'OUTSTANDING';
      case 'void': return 'CANCELED';
      case 'draft': return 'SCHEDULED';
      default: return (s || '').toUpperCase() || 'OUTSTANDING';
    }
  };

  try {
    // 1. Get subscription from Firestore
    const subDoc = await db.collection('subscriptions').doc(subscriptionId).get();
    if (!subDoc.exists) {
      throw new HttpsError("not-found", "Subscription not found.");
    }
    const sub = subDoc.data()!;

    // 2. Initialize Stripe
    const stripe = await getStripeClient();

    // 3. Build subscription info
    const toISO = (ts: any) => {
      if (!ts) return null;
      if (ts.toDate) return ts.toDate().toISOString();
      if (ts._seconds) return new Date(ts._seconds * 1000).toISOString();
      return null;
    };

    const subscriptionInfo = {
      id: subDoc.id,
      // Legacy aliases for the admin UI
      customerId: sub.stripeCustomerId || null,
      paymentId: sub.stripePaymentIntentId || null,
      recurringId: sub.stripeSubscriptionId || null,
      // Stripe-native fields (kept for newer callers)
      stripeCustomerId: sub.stripeCustomerId || null,
      stripePaymentIntentId: sub.stripePaymentIntentId || null,
      stripeSubscriptionId: sub.stripeSubscriptionId || null,
      payType: sub.payType || null,
      payAmount: sub.payAmount || 0,
      rentalMonths: sub.rentalMonths || null,
      status: sub.status,
      startAt: toISO(sub.startAt),
      endAt: toISO(sub.endAt),
    };

    // 4. Fetch history from Stripe
    const history: any[] = [];
    let stripeDetails: any = null;
    let recurringDetails: any = null;

    // For one-time payments — fetch PaymentIntent
    if (sub.stripePaymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(sub.stripePaymentIntentId);
        history.push({
          // Legacy aliases
          historyId: pi.id,
          paymentId: pi.id,
          paymentStatus: mapPaymentIntentStatus(pi.status),
          // Stripe-native + meta
          id: pi.id,
          paymentIntentId: pi.id,
          type: 'charge',
          status: pi.status,
          amount: pi.amount,
          created: new Date((pi as any).created * 1000).toISOString(),
        });
      } catch (err: any) {
        log(`[getPaymentHistory] Failed to fetch PaymentIntent:`, err.message);
      }
    }

    // For subscriptions — fetch invoices
    if (sub.stripeSubscriptionId) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const cpe = getSubscriptionCurrentPeriodEnd(stripeSub);

        stripeDetails = {
          status: stripeSub.status,
          currentPeriodEnd: cpe ? new Date(cpe * 1000).toISOString() : null,
          cancelAt: (stripeSub as any).cancel_at ? new Date((stripeSub as any).cancel_at * 1000).toISOString() : null,
        };

        // Build recurringDetails for the admin history UI
        const item0 = (stripeSub as any).items?.data?.[0];
        recurringDetails = {
          recurringId: stripeSub.id,
          customerId: typeof stripeSub.customer === 'string' ? stripeSub.customer : (stripeSub.customer as any)?.id || null,
          startAt: stripeSub.start_date ? new Date(stripeSub.start_date * 1000).toISOString() : null,
          cycle: 'month',
          payAmount: item0?.price?.unit_amount ?? sub.payAmount ?? 0,
          currentlyPayAmount: item0?.price?.unit_amount ?? sub.payAmount ?? 0,
          recurringDayOfMonth: stripeSub.billing_cycle_anchor
            ? new Date(stripeSub.billing_cycle_anchor * 1000).getDate()
            : undefined,
          nextRecurringAt: cpe ? new Date(cpe * 1000).toISOString() : null,
          isActive: ['active', 'trialing', 'past_due'].includes(stripeSub.status),
        };
      } catch (err: any) {
        log(`[getPaymentHistory] Failed to fetch subscription:`, err.message);
      }

      try {
        const invoices = await stripe.invoices.list({
          subscription: sub.stripeSubscriptionId,
          limit: 100,
        });
        // Sort oldest → newest so monthly entries align with the schedule rows
        const sorted = [...invoices.data].sort((a: any, b: any) => (a.created || 0) - (b.created || 0));
        for (const inv of sorted) {
          const piRef = (inv as any).payment_intent;
          const piId = typeof piRef === 'string' ? piRef : piRef?.id || null;
          history.push({
            // Legacy aliases
            historyId: inv.id,
            paymentId: piId,
            paymentStatus: mapInvoiceStatus(inv.status),
            // Stripe-native + meta
            id: inv.id,
            invoiceId: inv.id,
            paymentIntentId: piId,
            type: 'recurring',
            status: inv.status,
            amount: inv.amount_paid || inv.amount_due,
            created: new Date((inv as any).created * 1000).toISOString(),
          });
        }
      } catch (err: any) {
        log(`[getPaymentHistory] Failed to fetch invoices:`, err.message);
      }
    }

    // 5. Get user info
    let customerName = '';
    if (sub.userId) {
      const userDoc = await db.collection('users').doc(sub.userId).get();
      if (userDoc.exists) {
        const u = userDoc.data();
        customerName = `${u?.familyName || ''} ${u?.givenName || ''}`.trim();
      }
    }

    return {
      subscription: subscriptionInfo,
      customerName,
      stripeDetails,
      recurringDetails,
      history,
    };

  } catch (error) {
    log("[getPaymentHistory] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to fetch payment history.");
  }
});

/**
 * Stripe Webhook handler — receives real-time events from Stripe.
 * Must be an HTTP function (onRequest), not onCall.
 * Verifies the webhook signature using STRIPE_WEBHOOK_SECRET.
 */
export const stripeWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const db = getFirestore();

  try {
    // 1. Get webhook secret for the current mode (test or production)
    const apiMode = await getStripeMode();
    const webhookSecret = await getWebhookSecretForMode(apiMode);
    const stripe = await getStripeClient();

    // 2. Verify signature
    let event: any;
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'] as string;
      if (!sig) {
        log('[stripeWebhook] Missing Stripe-Signature header.');
        res.status(400).send('Missing Stripe-Signature header.');
        return;
      }
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      } catch (err: any) {
        log(`[stripeWebhook] Signature verification failed (mode=${apiMode}):`, err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }
    } else {
      // SECURITY: Refuse unsigned webhooks when running in production. In test mode
      // we still allow it for local dev convenience, but log a loud warning.
      if (apiMode === 'production') {
        log('[stripeWebhook] CRITICAL: Webhook signing secret missing in production mode. Refusing event.');
        res.status(500).send('Webhook signing secret not configured.');
        return;
      }
      event = req.body;
      log('[stripeWebhook] WARNING: No webhook secret configured (test mode), accepting without verification.');
    }

    log(`[stripeWebhook] Event: ${event.type}, ID: ${event.id}`);

    // 3. Handle events
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subId = getInvoiceSubscriptionId(invoice);
        if (subId) {
          // Find Firestore subscription by stripeSubscriptionId
          const subsSnap = await db.collection('subscriptions')
            .where('stripeSubscriptionId', '==', subId)
            .limit(1).get();
          if (!subsSnap.empty) {
            const subDoc = subsSnap.docs[0];
            await subDoc.ref.update({
              'stripeStatus.status': 'active',
              'stripeStatus.lastSyncedAt': new Date().toISOString(),
              updatedAt: Timestamp.now(),
            });
            log(`[stripeWebhook] invoice.payment_succeeded: Updated sub ${subDoc.id}`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId = getInvoiceSubscriptionId(invoice);
        if (subId) {
          const subsSnap = await db.collection('subscriptions')
            .where('stripeSubscriptionId', '==', subId)
            .limit(1).get();
          if (!subsSnap.empty) {
            const subDoc = subsSnap.docs[0];
            const subData = subDoc.data();
            const prevFailureCount = subData.paymentFailure?.count || 0;
            const newFailureCount = prevFailureCount + 1;
            const nowIso = new Date().toISOString();

            // Try to extract a friendly failure reason from the invoice
            const lastErr = (invoice as any).last_finalization_error
              || (invoice as any).last_payment_error
              || (invoice as any).attempt_count;
            const declineCode = (invoice as any).charge?.outcome?.reason || null;
            const failureMessage = (invoice as any).charge?.failure_message
              || lastErr?.message
              || null;

            await subDoc.ref.update({
              'stripeStatus.status': 'past_due',
              'stripeStatus.lastSyncedAt': nowIso,
              'paymentFailure.count': newFailureCount,
              'paymentFailure.lastFailedAt': nowIso,
              'paymentFailure.firstFailedAt': subData.paymentFailure?.firstFailedAt || nowIso,
              'paymentFailure.lastInvoiceId': invoice.id || null,
              'paymentFailure.lastAmount': invoice.amount_due || 0,
              'paymentFailure.declineCode': declineCode,
              'paymentFailure.failureMessage': failureMessage,
              'paymentFailure.nextAttemptAt': invoice.next_payment_attempt
                ? new Date(invoice.next_payment_attempt * 1000).toISOString()
                : null,
              updatedAt: Timestamp.now(),
            });
            log(`[stripeWebhook] invoice.payment_failed: sub ${subDoc.id}, failureCount=${newFailureCount}, decline=${declineCode || '-'}`);

            const settingsDoc = await db.collection('settings').doc('global').get();
            const adminEmail = settingsDoc.data()?.managerEmail;

            // Build a Stripe Customer Portal URL so the user can update card details
            const myPageUrl = 'https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app/mypage/payments';
            let portalUrl = myPageUrl;
            try {
              if (subData.stripeCustomerId) {
                const portalSession = await stripe.billingPortal.sessions.create({
                  customer: subData.stripeCustomerId,
                  return_url: myPageUrl,
                });
                portalUrl = portalSession.url;
              }
            } catch (portalErr: any) {
              log(`[stripeWebhook] Could not create Billing Portal session:`, portalErr.message);
            }

            // Notify the user (NEW — was missing before)
            if (subData.userId) {
              const userDoc = await db.collection('users').doc(subData.userId).get();
              const userData = userDoc.exists ? userDoc.data()! : {};
              const userEmail = userData?.email;
              if (userEmail) {
                const userName = `${userData.familyName || ''} ${userData.givenName || ''}`.trim() || 'お客様';
                const nextAttemptStr = invoice.next_payment_attempt
                  ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('ja-JP')
                  : '近日中';
                await sendTriggeredEmail('payment_failed_user', { name: userName, email: userEmail }, {
                  deviceType: subData.deviceType || '',
                  amount: invoice.amount_due,
                  failureCount: newFailureCount,
                  nextAttemptAt: nextAttemptStr,
                  cardUpdateUrl: portalUrl,
                  myPageUrl,
                });
                log(`[stripeWebhook] Notified user ${userEmail} of payment failure.`);
              }
            }

            // Notify admin (existing trigger)
            if (adminEmail) {
              await sendTriggeredEmail('payment_failed', { name: 'Admin', email: adminEmail }, {
                subscriptionId: subDoc.id,
                deviceType: subData.deviceType || '',
                amount: invoice.amount_due,
                failureCount: newFailureCount,
                declineCode: declineCode || '不明',
              });
            }
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // (recovery path) — existing handler updated above already sets active.
        // Additionally clear the paymentFailure block so the past_due flag is removed.
        const invoice = event.data.object;
        const subId = getInvoiceSubscriptionId(invoice);
        if (subId) {
          const subsSnap = await db.collection('subscriptions')
            .where('stripeSubscriptionId', '==', subId)
            .limit(1).get();
          if (!subsSnap.empty) {
            const subDoc = subsSnap.docs[0];
            const hadFailures = !!subDoc.data().paymentFailure?.count;
            if (hadFailures) {
              await subDoc.ref.update({
                paymentFailure: FieldValue.delete(),
                updatedAt: Timestamp.now(),
              });
              log(`[stripeWebhook] invoice.payment_succeeded: Cleared paymentFailure on sub ${subDoc.id} (recovered).`);
            }
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const subsSnap = await db.collection('subscriptions')
          .where('stripeSubscriptionId', '==', subscription.id)
          .limit(1).get();
        if (!subsSnap.empty) {
          const subDoc = subsSnap.docs[0];
          const cpe = getSubscriptionCurrentPeriodEnd(subscription);
          await subDoc.ref.update({
            'stripeStatus.status': subscription.status,
            'stripeStatus.currentPeriodEnd': cpe ? new Date(cpe * 1000).toISOString() : null,
            'stripeStatus.cancelAt': subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
            'stripeStatus.lastSyncedAt': new Date().toISOString(),
            updatedAt: Timestamp.now(),
          });
          log(`[stripeWebhook] customer.subscription.updated: ${subDoc.id} → ${subscription.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subsSnap = await db.collection('subscriptions')
          .where('stripeSubscriptionId', '==', subscription.id)
          .limit(1).get();
        if (!subsSnap.empty) {
          const subDoc = subsSnap.docs[0];
          const subData = subDoc.data();

          await subDoc.ref.update({
            status: 'canceled',
            'stripeStatus.status': 'canceled',
            'stripeStatus.lastSyncedAt': new Date().toISOString(),
            updatedAt: Timestamp.now(),
          });

          // Release device
          if (subData.deviceId) {
            await db.collection('devices').doc(subData.deviceId).update({
              status: 'available',
              currentUserId: null,
              updatedAt: Timestamp.now(),
            });
            log(`[stripeWebhook] Device ${subData.deviceId} released.`);
          }

          log(`[stripeWebhook] customer.subscription.deleted: ${subDoc.id} canceled`);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const piId = charge.payment_intent;
        if (piId) {
          const subsSnap = await db.collection('subscriptions')
            .where('stripePaymentIntentId', '==', piId)
            .limit(1).get();
          if (!subsSnap.empty) {
            const subDoc = subsSnap.docs[0];
            const existing = subDoc.data().refundHistory || [];
            existing.push({
              refundId: charge.id,
              amount: charge.amount_refunded,
              status: 'refunded',
              refundedAt: new Date().toISOString(),
              source: 'webhook',
            });
            await subDoc.ref.update({
              refundHistory: existing,
              updatedAt: Timestamp.now(),
            });
            log(`[stripeWebhook] charge.refunded: Recorded on sub ${subDoc.id}`);
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        // First-time PaymentIntent failure (card declined at initial charge).
        // The user is on the payment page during this — frontend already surfaces the error,
        // but we still record + notify so support can follow up if the user abandoned.
        const pi = event.data.object;
        const piId = pi.id;
        const failureMessage = pi.last_payment_error?.message || null;
        const declineCode = pi.last_payment_error?.decline_code || pi.last_payment_error?.code || null;

        log(`[stripeWebhook] payment_intent.payment_failed: ${piId}, decline=${declineCode || '-'}, msg=${failureMessage || '-'}`);

        // Find linked paymentLink and (if any) Firestore subscription
        const linkSnap = await db.collection('paymentLinks')
          .where('stripePaymentIntentId', '==', piId)
          .limit(1).get();
        if (!linkSnap.empty) {
          const linkDoc = linkSnap.docs[0];
          await linkDoc.ref.update({
            'paymentFailure.lastFailedAt': new Date().toISOString(),
            'paymentFailure.declineCode': declineCode,
            'paymentFailure.failureMessage': failureMessage,
            'paymentFailure.amount': pi.amount,
            updatedAt: Timestamp.now(),
          });
          log(`[stripeWebhook] Recorded failure on paymentLink ${linkDoc.id}`);

          // Notify admin so they can follow up
          const settingsDoc = await db.collection('settings').doc('global').get();
          const adminEmail = settingsDoc.data()?.managerEmail;
          if (adminEmail) {
            await sendTriggeredEmail('initial_payment_failed', { name: 'Admin', email: adminEmail }, {
              paymentLinkId: linkDoc.id,
              userId: linkDoc.data().userId || '',
              amount: pi.amount,
              declineCode: declineCode || '不明',
              failureMessage: failureMessage || '',
            });
          }
        }
        break;
      }

      case 'customer.source.expiring':
      case 'payment_method.updated': {
        // Card is expiring within 1 month (Stripe fires this once for the soon-to-expire card).
        // Send a heads-up to all active subscribers using this customer.
        const obj = event.data.object;
        const customerId = obj.customer || (obj as any).id;
        if (!customerId || typeof customerId !== 'string') break;

        const subsSnap = await db.collection('subscriptions')
          .where('stripeCustomerId', '==', customerId)
          .where('status', '==', 'active')
          .get();

        if (subsSnap.empty) {
          log(`[stripeWebhook] customer.source.expiring: No active subs for ${customerId}`);
          break;
        }

        const expMonth = obj.exp_month || (obj as any).card?.exp_month;
        const expYear = obj.exp_year || (obj as any).card?.exp_year;
        const last4 = obj.last4 || (obj as any).card?.last4;

        for (const subDoc of subsSnap.docs) {
          const subData = subDoc.data();
          if (!subData.userId) continue;
          const userDoc = await db.collection('users').doc(subData.userId).get();
          if (!userDoc.exists) continue;
          const userData = userDoc.data()!;
          if (!userData.email) continue;

          // Build a portal URL for this customer
          const myPageUrl = 'https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app/mypage/payments';
          let portalUrl = myPageUrl;
          try {
            const portalSession = await stripe.billingPortal.sessions.create({
              customer: customerId,
              return_url: myPageUrl,
            });
            portalUrl = portalSession.url;
          } catch (portalErr: any) {
            log(`[stripeWebhook] Could not create Billing Portal session for expiring card:`, portalErr.message);
          }

          const userName = `${userData.familyName || ''} ${userData.givenName || ''}`.trim() || 'お客様';
          await sendTriggeredEmail('card_expiring', { name: userName, email: userData.email }, {
            deviceType: subData.deviceType || '',
            last4: last4 || '****',
            expMonth: expMonth ? String(expMonth).padStart(2, '0') : '--',
            expYear: expYear || '----',
            cardUpdateUrl: portalUrl,
          });
          log(`[stripeWebhook] Sent card_expiring notice to ${userData.email}`);
        }
        break;
      }

      default:
        log(`[stripeWebhook] Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    log(`[stripeWebhook] ERROR:`, error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Send an ad-hoc email from the admin panel.
 * Wraps body in the HTML email template with company branding.
 */
export const sendAdHocEmail = onCall(async (request) => {
  const { to, subject, body, fromAccountId } = request.data as {
    to?: string;
    subject?: string;
    body?: string;
    fromAccountId?: string;
  };

  if (!to || !subject || !body) {
    throw new HttpsError("invalid-argument", "to, subject, and body are required.");
  }

  log(`[sendAdHocEmail] Sending email to: ${to}, subject: ${subject}, fromAccountId: ${fromAccountId || "(default)"}`);

  try {
    // Fetch email design settings
    const db = getFirestore();
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
    const svcName = settings.serviceName || 'TimeWaverHub';
    const d = settings.emailDesign || {
      primaryColor: '#2563eb',
      fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif",
      footerText: `© ${new Date().getFullYear()} ${svcName}. All rights reserved.\nこのメールは${svcName}システムから自動送信されています。`,
    };

    const isRichHtml = body.includes('<') && body.includes('>');
    const processedBody = isRichHtml ? body : body.replace(/\n/g, '<br>');
    const footerHtml = (d.footerText || '').replace(/\n/g, '<br>');

    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>.email-body p { margin: 0 0 4px 0; } .email-body br { line-height: 1.6; }</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:${d.fontFamily || "'Helvetica Neue', Arial, sans-serif"};">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background-color:${d.primaryColor || '#2563eb'};padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${svcName}</h1>
</td></tr>
<tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
<div class="email-body" style="color:#1f2937;font-size:14px;line-height:1.6;">${processedBody}</div>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:24px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
<p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">${footerHtml}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    await sendViaAccount({ accountId: fromAccountId, to, subject, body: htmlBody });
    log(`[sendAdHocEmail] Email sent successfully to ${to}`);
    return { success: true };
  } catch (error: any) {
    log(`[sendAdHocEmail] Error:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Failed to send email.");
  }
});

export const onApplicationCreate = onDocumentCreated("applications/{applicationId}", async (event) => {
  const snap = event.data;
  if (!snap) {
    log("[onApplicationCreate] No snapshot; exiting.");
    return;
  }
  const data = snap.data();
  const applicationId = event.params.applicationId;

  // Only notify on a fresh user submission (created in 'pending'). Applications
  // created/seeded in other states should not re-trigger the submission flow.
  if (data.status && data.status !== 'pending') {
    return;
  }

  const db = getFirestore();
  const payload = {
    applicationId,
    deviceType: data.deviceType || '',
    deviceName: data.deviceType || '',
    deviceSerialNumber: data.deviceSerialNumber || '',
    userName: data.userName || '',
    userEmail: data.userEmail || '',
  };

  // 1. Receipt to the applicant
  if (data.userEmail) {
    await sendTriggeredEmail('application_submitted', { name: data.userName || '', email: data.userEmail }, payload);
  }

  // 2. Notify admin/staff to start the review
  const settingsDoc = await db.collection('settings').doc('global').get();
  const adminEmail = settingsDoc.data()?.managerEmail || settingsDoc.data()?.adminEmail || null;
  if (adminEmail) {
    await sendTriggeredEmail('application_submitted_admin', { name: 'Admin', email: adminEmail }, payload);
  }

  log(`[onApplicationCreate] Dispatched submission notifications for ${applicationId}.`);
});

export const onApplicationUpdate = onDocumentUpdated("applications/{applicationId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const applicationId = event.params.applicationId;

  if (!before || !after) {
    log("[onApplicationUpdate] Data missing, exiting.");
    return;
  }

  // If status has not changed, do nothing.
  if (before.status === after.status) {
    return;
  }

  log(`[onApplicationUpdate] Status changed for application ${applicationId} from '${before.status}' to '${after.status}'`);

  const db = getFirestore();
  const appRef = db.collection('applications').doc(applicationId);
  const user = { name: after.userName || '', email: after.userEmail };
  const applicationData = { ...after, applicationId, deviceType: after.deviceType || '' };

  // Helper to get admin email
  const getAdminEmail = async () => {
    const settingsDoc = await db.collection('settings').doc('global').get();
    return settingsDoc.data()?.managerEmail || settingsDoc.data()?.adminEmail || null;
  };

  // --- Status Change Handlers ---

  // 審査承認 → 同意書待ち
  if (after.status === 'awaiting_consent_form') {
    await sendTriggeredEmail('application_approved', user, applicationData);
  }

  // 同意書提出 → 管理者に通知
  if (after.status === 'consent_form_review') {
    const adminEmail = await getAdminEmail();
    if (adminEmail) {
      await sendTriggeredEmail('consent_form_submitted', { name: "Admin", email: adminEmail }, applicationData);
    }
  }

  // 同意書承認（決済リンクはまだない段階 — 承認のみ通知）
  if (after.status === 'consent_form_approved') {
    await sendTriggeredEmail('consent_form_approved', user, applicationData);
  }

  // 決済リンク送付（paymentLinkIdがセットされたタイミングで決済案内メール）
  if (after.status === 'payment_sent' && after.paymentLinkId) {
    const paymentBaseUrl = 'https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app';
    await sendTriggeredEmail('payment_link_sent', user, {
      ...applicationData,
      paymentLinkUrl: `${paymentBaseUrl}/payment/${after.paymentLinkId}`,
    });
  }

  // 銀行振込案内 → 振込先・金額・期限を案内メールで送付（一括払いのみ）
  if (after.status === 'awaiting_bank_transfer' && before.status !== 'awaiting_bank_transfer') {
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settingsData = settingsDoc.data() || {};
    const deadlineDays = settingsData.bankTransferDeadlineDays || 7;
    const deadline = addBusinessDays(new Date(), deadlineDays);
    const deadlineStr = `${deadline.getFullYear()}/${deadline.getMonth() + 1}/${deadline.getDate()}`;
    const amount = after.payAmount ?? 0;

    // Persist the transfer details on the application for admin reference.
    await appRef.update({
      paymentMethod: 'bank_transfer',
      'bankTransfer.amount': amount,
      'bankTransfer.deadline': deadline.toISOString(),
      'bankTransfer.instructionsSentAt': new Date().toISOString(),
      updatedAt: Timestamp.now(),
    });

    const transferData = {
      ...applicationData,
      transferAmount: amount.toLocaleString(),
      transferDeadline: deadlineStr,
      applicationId,
    };

    // 1. Instructions to the applicant
    await sendTriggeredEmail('bank_transfer_instructions', user, transferData);

    // 2. Notify admin/staff to watch for the incoming transfer
    const btAdminEmail = await getAdminEmail();
    if (btAdminEmail) {
      await sendTriggeredEmail('bank_transfer_pending_admin', { name: 'スタッフ', email: btAdminEmail }, transferData);
    }
    log(`[onApplicationUpdate] Bank transfer instructions sent for ${applicationId} (deadline ${deadlineStr}).`);
  }

  // 決済完了 → ユーザーに決済完了メール + スタッフに発送準備依頼
  if (after.status === 'completed' && before.status !== 'completed') {
    // 銀行振込など、決済ページ(handlePaymentSuccess)を経由しないルートでは
    // サブスク（契約期間レコード）が未作成。存在しなければサーバー側で作成する。
    const existingSub = await db.collection('subscriptions')
      .where('applicationId', '==', applicationId)
      .limit(1).get();
    if (existingSub.empty) {
      const settingsDoc = await db.collection('settings').doc('global').get();
      const bufferDays = settingsDoc.data()?.shippingBufferDays ?? 3;
      const isRenewal = !!after.isRenewal && !!after.previousEndAt;
      const startDate = isRenewal ? new Date(after.previousEndAt) : addBusinessDays(new Date(), bufferDays);
      const rentalMonths = after.rentalType || after.rentalPeriod || 12;
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + Number(rentalMonths));

      await db.collection('subscriptions').add({
        userId: after.userId || null,
        deviceId: after.deviceId || null,
        deviceType: after.deviceType || '',
        payType: after.payType || 'full',
        paymentMethod: after.paymentMethod || 'bank_transfer',
        rentalMonths: Number(rentalMonths),
        startAt: Timestamp.fromDate(startDate),
        endAt: Timestamp.fromDate(endDate),
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePaymentIntentId: null,
        payAmount: after.payAmount ?? 0,
        status: 'active',
        applicationId,
        previousSubscriptionId: after.previousSubscriptionId || null,
        isRenewal,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      log(`[onApplicationUpdate] Created server-side subscription for ${applicationId} (no Stripe — bank transfer path).`);

      // Record confirmation metadata for bank transfers.
      if (after.paymentMethod === 'bank_transfer') {
        await appRef.update({ 'bankTransfer.confirmedAt': new Date().toISOString(), updatedAt: Timestamp.now() });
      }
    }

    const settingsDoc = await db.collection('settings').doc('global').get();
    const settingsData = settingsDoc.data();
    const bufferDays = settingsData?.shippingBufferDays || 3;
    const deadline = addBusinessDays(new Date(), bufferDays);
    const deadlineStr = `${deadline.getFullYear()}/${deadline.getMonth() + 1}/${deadline.getDate()}`;

    // Send payment completed email to user
    await sendTriggeredEmail('payment_completed', user, {
      ...applicationData,
      deliveryDate: deadlineStr,
    });

    // Build shipping address from application data
    const shippingAddress = [after.shippingZipcode, after.shippingPrefecture, after.shippingAddress1, after.shippingAddress2]
      .filter(Boolean).join(' ') || after.address || '（住所未登録）';

    // Send to all operations staff, fallback to managerEmail
    const staff = settingsData?.staff || [];
    const opsStaff = staff.filter((s: any) => s.role === 'operations');
    const recipients = opsStaff.length > 0
      ? opsStaff.map((s: any) => ({ name: s.name, email: s.email }))
      : [{ name: 'スタッフ', email: settingsData?.managerEmail || '' }];

    for (const staffMember of recipients) {
      if (staffMember.email) {
        await sendTriggeredEmail('device_prep_required', staffMember, {
          ...applicationData,
          shippingAddress,
          deadline: deadlineStr,
        });
      }
    }
  }

  // 発送済み → send email → auto-switch to 利用中
  if (after.status === 'shipped') {
    await sendTriggeredEmail('device_shipped', user, applicationData);
    // Auto-transition to in_use after email
    await appRef.update({ status: 'in_use', updatedAt: Timestamp.now() });
    log(`[onApplicationUpdate] Auto-transitioned ${applicationId} from 'shipped' to 'in_use'.`);
  }

  // 利用中 → ensure device is set to 'active'
  if (after.status === 'in_use' && before.status !== 'in_use') {
    if (after.deviceId) {
      const deviceDoc = await db.collection('devices').doc(after.deviceId).get();
      const currentStatus = deviceDoc.data()?.status;
      if (currentStatus !== 'active') {
        await db.collection('devices').doc(after.deviceId).update({
          status: 'active',
          currentUserId: after.userId || null,
          updatedAt: Timestamp.now(),
        });
        log(`[onApplicationUpdate] Device ${after.deviceId} → active (application in_use).`);
      }
    }
  }

  // completed → ensure device is set to 'active' (payment completed, may skip shipped flow)
  if (after.status === 'completed' && before.status !== 'completed') {
    if (after.deviceId) {
      const deviceDoc = await db.collection('devices').doc(after.deviceId).get();
      const currentStatus = deviceDoc.data()?.status;
      if (currentStatus && currentStatus !== 'active') {
        await db.collection('devices').doc(after.deviceId).update({
          status: 'active',
          currentUserId: after.userId || null,
          updatedAt: Timestamp.now(),
        });
        log(`[onApplicationUpdate] Device ${after.deviceId} → active (application completed).`);
      }
    }
  }

  // 契約満了 → update subscription + send 契約終了通知 + 返却案内 → auto-switch to 返却手続中
  if (after.status === 'expired') {
    // Update linked subscriptions to 'expired'
    const expiredSubs = await db.collection('subscriptions')
      .where('applicationId', '==', applicationId)
      .where('status', '==', 'active')
      .get();
    for (const subDoc of expiredSubs.docs) {
      await subDoc.ref.update({ status: 'expired', updatedAt: Timestamp.now() });
      log(`[onApplicationUpdate] Subscription ${subDoc.id} → expired.`);

      // Cancel Stripe subscription if still active
      const stripeSubId = subDoc.data().stripeSubscriptionId;
      if (stripeSubId) {
        try {
          const stripe = await getStripeClient();
          await stripe.subscriptions.cancel(stripeSubId);
          await subDoc.ref.update({ 'stripeStatus.status': 'canceled' });
          log(`[onApplicationUpdate] Stripe subscription ${stripeSubId} canceled (expired).`);
        } catch (stripeErr: any) {
          log(`[onApplicationUpdate] Failed to cancel Stripe sub:`, stripeErr.message);
        }
      }
    }

    await sendTriggeredEmail('contract_expired', user, applicationData);
    await sendTriggeredEmail('device_return_guide', user, applicationData);
    // Notify staff: contract ended + device coming back for inspection
    const expiredAdminEmail = await getAdminEmail();
    if (expiredAdminEmail) {
      await sendTriggeredEmail('contract_expired_admin', { name: 'スタッフ', email: expiredAdminEmail }, applicationData);
      await sendTriggeredEmail('device_return_guide_admin', { name: 'スタッフ', email: expiredAdminEmail }, applicationData);
    }
    // Auto-transition to returning
    await appRef.update({ status: 'returning', updatedAt: Timestamp.now() });
    log(`[onApplicationUpdate] Auto-transitioned ${applicationId} from 'expired' to 'returning'.`);
  }

  // 解約 → send 解約通知 + 返却案内 → auto-switch to 返却手続中
  if (after.status === 'canceled' && before.status !== 'pending' && before.status !== 'rejected') {
    await sendTriggeredEmail('subscription_canceled', user, applicationData);
    await sendTriggeredEmail('device_return_guide', user, applicationData);
    // Notify staff: device coming back for inspection
    const canceledAdminEmail = await getAdminEmail();
    if (canceledAdminEmail) {
      await sendTriggeredEmail('device_return_guide_admin', { name: 'スタッフ', email: canceledAdminEmail }, applicationData);
    }
    // Auto-transition to returning
    await appRef.update({ status: 'returning', updatedAt: Timestamp.now() });
    log(`[onApplicationUpdate] Auto-transitioned ${applicationId} from 'canceled' to 'returning'.`);
  }

  // 点検中 → notify staff to inspect
  if (after.status === 'inspection') {
    const adminEmail = await getAdminEmail();
    if (adminEmail) {
      await sendTriggeredEmail('device_inspection', { name: "スタッフ", email: adminEmail }, applicationData);
    }
  }

  // 返却完了（点検OK） → send user email → auto-switch to 終了
  if (after.status === 'returned') {
    await sendTriggeredEmail('device_returned', user, applicationData);
    // Auto-transition to closed
    await appRef.update({ status: 'closed', updatedAt: Timestamp.now() });
    log(`[onApplicationUpdate] Auto-transitioned ${applicationId} from 'returned' to 'closed'.`);
  }

  // 終了 → release device + update subscription status
  if (after.status === 'closed' && before.status !== 'closed') {
    // Update linked subscription to 'completed'
    const closedSubs = await db.collection('subscriptions')
      .where('applicationId', '==', applicationId)
      .where('status', '==', 'active')
      .get();
    for (const subDoc of closedSubs.docs) {
      await subDoc.ref.update({ status: 'completed', updatedAt: Timestamp.now() });
      log(`[onApplicationUpdate] Subscription ${subDoc.id} → completed (application closed).`);

      // Cancel Stripe subscription if active
      const stripeSubId = subDoc.data().stripeSubscriptionId;
      if (stripeSubId) {
        try {
          const stripe = await getStripeClient();
          await stripe.subscriptions.cancel(stripeSubId);
          await subDoc.ref.update({ 'stripeStatus.status': 'canceled' });
          log(`[onApplicationUpdate] Stripe subscription ${stripeSubId} canceled.`);
        } catch (stripeErr: any) {
          log(`[onApplicationUpdate] Failed to cancel Stripe sub:`, stripeErr.message);
        }
      }
    }

    // Release device
    if (after.deviceId) {
      const deviceDoc = await db.collection('devices').doc(after.deviceId).get();
      const deviceType = deviceDoc.data()?.type || after.deviceType || 'Unknown Device';

      await db.collection('devices').doc(after.deviceId).update({
        status: 'available',
        currentUserId: null,
        updatedAt: Timestamp.now(),
      });
      log(`[onApplicationUpdate] Device ${after.deviceId} released to available (application closed).`);
      await onDeviceReleased(after.deviceId, deviceType, 'expired');
    }
  }

  // 破損・不具合あり → notify user about deposit + alert staff for claim/replacement
  if (after.status === 'damaged') {
    await sendTriggeredEmail('device_damaged', user, applicationData);
    const damagedAdminEmail = await getAdminEmail();
    if (damagedAdminEmail) {
      await sendTriggeredEmail('device_damaged_admin', { name: 'スタッフ', email: damagedAdminEmail }, applicationData);
    }
  }

  // --- Cleanup for Canceled/Rejected Applications ---
  const isNowCanceled = ['canceled', 'rejected'].includes(after.status);
  const wasNotCanceled = !['canceled', 'rejected'].includes(before.status);

  if (isNowCanceled && wasNotCanceled) {
    log(`[onApplicationUpdate] Cleanup initiated for ${applicationId} due to status: ${after.status}.`);

    // Update linked subscriptions to 'canceled'
    const canceledSubs = await db.collection('subscriptions')
      .where('applicationId', '==', applicationId)
      .where('status', '==', 'active')
      .get();
    for (const subDoc of canceledSubs.docs) {
      await subDoc.ref.update({ status: 'canceled', updatedAt: Timestamp.now() });
      log(`[onApplicationUpdate] Subscription ${subDoc.id} → canceled (application ${after.status}).`);

      // Cancel Stripe subscription if active
      const stripeSubId = subDoc.data().stripeSubscriptionId;
      if (stripeSubId) {
        try {
          const stripe = await getStripeClient();
          await stripe.subscriptions.cancel(stripeSubId);
          await subDoc.ref.update({ 'stripeStatus.status': 'canceled' });
          log(`[onApplicationUpdate] Stripe subscription ${stripeSubId} canceled.`);
        } catch (stripeErr: any) {
          log(`[onApplicationUpdate] Failed to cancel Stripe sub:`, stripeErr.message);
        }
      }
    }

    // Release device back to available
    if (after.deviceId) {
      const deviceDoc = await db.collection('devices').doc(after.deviceId).get();
      if (deviceDoc.exists) {
        const currentStatus = deviceDoc.data()?.status;
        // Only release if device is in a locked state (processing/active), not already available
        if (currentStatus && currentStatus !== 'available') {
          const deviceType = deviceDoc.data()?.type || after.deviceType || 'Unknown Device';
          await db.collection('devices').doc(after.deviceId).update({
            status: 'available',
            currentUserId: null,
            updatedAt: Timestamp.now(),
          });
          log(`[onApplicationUpdate] Device ${after.deviceId} released to available (application ${after.status}).`);
          await onDeviceReleased(after.deviceId, deviceType, 'canceled');
        }
      }
    }

    const bucket = getStorage().bucket();
    const filesToDelete = [after.identificationImageUrl, after.agreementPdfUrl].filter(Boolean);

    for (const url of filesToDelete) {
      try {
        const decodedUrl = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
        const file = bucket.file(decodedUrl);
        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
          log(`[onApplicationUpdate] Deleted file: ${decodedUrl}`);
        }
      } catch (err) {
        log(`[onApplicationUpdate] Failed to delete file at ${url}:`, err);
      }
    }
  }
});

/**
 * Hard-delete cleanup. When an admin deletes an application document outright
 * (申請管理画面の削除ボタン), the onApplicationUpdate cleanup never runs because
 * there is no "after" state. This trigger mirrors the canceled/rejected cleanup:
 * release the linked device, cancel any active subscription (+ Stripe), and
 * delete the uploaded documents from Storage so nothing is orphaned.
 */
export const onApplicationDeleted = onDocumentDeleted("applications/{applicationId}", async (event) => {
  const data = event.data?.data();
  const applicationId = event.params.applicationId;
  if (!data) {
    log("[onApplicationDeleted] No snapshot data; exiting.");
    return;
  }

  const db = getFirestore();
  log(`[onApplicationDeleted] Cleanup initiated for deleted application ${applicationId}.`);

  // 1. Cancel linked active subscriptions (+ Stripe)
  const subs = await db.collection('subscriptions')
    .where('applicationId', '==', applicationId)
    .where('status', '==', 'active')
    .get();
  for (const subDoc of subs.docs) {
    await subDoc.ref.update({ status: 'canceled', updatedAt: Timestamp.now() });
    const stripeSubId = subDoc.data().stripeSubscriptionId;
    if (stripeSubId) {
      try {
        const stripe = await getStripeClient();
        await stripe.subscriptions.cancel(stripeSubId);
        await subDoc.ref.update({ 'stripeStatus.status': 'canceled' });
        log(`[onApplicationDeleted] Stripe subscription ${stripeSubId} canceled.`);
      } catch (stripeErr: any) {
        log(`[onApplicationDeleted] Failed to cancel Stripe sub:`, stripeErr.message);
      }
    }
  }

  // 2. Release the linked device if it is locked
  if (data.deviceId) {
    const deviceDoc = await db.collection('devices').doc(data.deviceId).get();
    if (deviceDoc.exists) {
      const currentStatus = deviceDoc.data()?.status;
      if (currentStatus && currentStatus !== 'available') {
        const deviceType = deviceDoc.data()?.type || data.deviceType || 'Unknown Device';
        await db.collection('devices').doc(data.deviceId).update({
          status: 'available',
          currentUserId: null,
          updatedAt: Timestamp.now(),
        });
        log(`[onApplicationDeleted] Device ${data.deviceId} released to available.`);
        await onDeviceReleased(data.deviceId, deviceType, 'canceled');
      }
    }
  }

  // 3. Delete uploaded documents from Storage
  const bucket = getStorage().bucket();
  const filesToDelete = [data.identificationImageUrl, data.agreementPdfUrl, ...(data.agreementImageUrls || [])].filter(Boolean);
  for (const url of filesToDelete) {
    try {
      const decodedUrl = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
      const file = bucket.file(decodedUrl);
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        log(`[onApplicationDeleted] Deleted file: ${decodedUrl}`);
      }
    } catch (err) {
      log(`[onApplicationDeleted] Failed to delete file at ${url}:`, err);
    }
  }

  log(`[onApplicationDeleted] Cleanup completed for ${applicationId}.`);
});

/**
 * Send follow-up emails when a new early booking (先行予約) is created.
 * Both emails are driven by the email-template system — admins can edit
 * subject/body via /admin/email-templates and swap the bound template via
 * /admin/email-triggers. Default content comes from SYSTEM_TEMPLATES when no
 * custom template is bound.
 */
export const onEarlyBookingCreated = onDocumentCreated("earlyBookings/{bookingId}", async (event) => {
  const snap = event.data;
  if (!snap) {
    log("[onEarlyBookingCreated] No snapshot; exiting.");
    return;
  }
  const booking = snap.data();
  const bookingId = event.params.bookingId;

  const db = getFirestore();
  const settingsDoc = await db.collection('settings').doc('global').get();
  const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
  const managerEmail: string = settings.managerEmail || settings.adminEmail || '';

  log(`[onEarlyBookingCreated] New booking ${bookingId} from ${booking.email}`);

  const submittedAt = booking.createdAt?.toDate
    ? booking.createdAt.toDate().toLocaleString('ja-JP')
    : new Date().toLocaleString('ja-JP');

  const sharedData = {
    companyName: booking.companyName || '（未入力）',
    phone: booking.phone || '（未入力）',
    desiredDevice: booking.desiredDevice || '（未選択）',
    message: booking.message || '（なし）',
    submittedAt,
    bookingId,
  };

  // --- 1. Confirmation email to user ---
  try {
    await sendTriggeredEmail(
      'early_booking_confirmation',
      { name: booking.name, email: booking.email },
      sharedData,
    );
    await snap.ref.update({ followUpSentAt: Timestamp.now() });
    log(`[onEarlyBookingCreated] Confirmation trigger dispatched for ${booking.email}`);
  } catch (err: any) {
    log(`[onEarlyBookingCreated] Failed confirmation trigger:`, err.message || err);
  }

  // --- 2. Admin notification ---
  if (managerEmail) {
    try {
      await sendTriggeredEmail(
        'early_booking_admin_notification',
        { name: settings.managerName || 'Admin', email: managerEmail },
        {
          ...sharedData,
          // For admin template: use booking's user info explicitly so {{userName}} / {{userEmail}}
          // reflect the applicant, not the admin recipient.
          userName: booking.name,
          userEmail: booking.email,
        },
      );
      await snap.ref.update({ adminNotifiedAt: Timestamp.now() });
      log(`[onEarlyBookingCreated] Admin trigger dispatched for ${managerEmail}`);
    } catch (err: any) {
      log(`[onEarlyBookingCreated] Failed admin trigger:`, err.message || err);
    }
  }
});

/**
 * Manual resend of early-booking follow-up (called from /admin/early-bookings).
 * Uses the same templated pipeline as the onCreate trigger.
 */
export const resendEarlyBookingFollowUp = onCall(async (request) => {
  const { bookingId } = request.data;
  if (!bookingId) throw new HttpsError("invalid-argument", "bookingId is required.");

  const db = getFirestore();
  const ref = db.collection('earlyBookings').doc(bookingId);
  const docSnap = await ref.get();
  if (!docSnap.exists) throw new HttpsError("not-found", "Booking not found.");

  const booking = docSnap.data()!;
  const submittedAt = booking.createdAt?.toDate
    ? booking.createdAt.toDate().toLocaleString('ja-JP')
    : new Date().toLocaleString('ja-JP');

  await sendTriggeredEmail(
    'early_booking_confirmation',
    { name: booking.name, email: booking.email },
    {
      companyName: booking.companyName || '（未入力）',
      phone: booking.phone || '（未入力）',
      desiredDevice: booking.desiredDevice || '（未選択）',
      message: booking.message || '（なし）',
      submittedAt,
      bookingId,
    },
  );
  await ref.update({ followUpSentAt: Timestamp.now() });
  return { success: true };
});

/**
 * Manual bulk send of the "applications are now open" launch notice to
 * early-booking (先行予約) leads. Intended to be run by an admin from
 * /admin/early-bookings after turning OFF preBookingMode.
 *
 * Uses the same templated pipeline as the other early-booking emails. The
 * trigger config is auto-seeded on first use so it works without prior setup,
 * while remaining editable via /admin/email-triggers afterward.
 *
 * Request data:
 *   - bookingIds?: string[]  Restrict to these bookings; otherwise all.
 *   - resend?: boolean       Re-send to leads already notified (default false).
 */
export const sendEarlyBookingLaunchNotice = onCall(async (request) => {
  await requireAdmin(request);
  const { bookingIds, resend } = (request.data || {}) as {
    bookingIds?: string[];
    resend?: boolean;
  };

  const db = getFirestore();

  // Ensure a trigger config exists so sendTriggeredEmail can resolve a template.
  const triggerRef = db.collection('emailTriggers').doc('early_booking_launch_notice');
  const triggerSnap = await triggerRef.get();
  if (!triggerSnap.exists) {
    await triggerRef.set({
      triggerPoint: 'early_booking_launch_notice',
      enabled: true,
      userTemplateId: 'sys_early_booking_launch_notice',
      adminTemplateId: '',
      channels: { email: true },
      updatedAt: Timestamp.now(),
    }, { merge: true });
    log('[sendEarlyBookingLaunchNotice] Seeded default trigger config.');
  }

  // Resolve target bookings.
  let docs: FirebaseFirestore.DocumentSnapshot[] = [];
  if (Array.isArray(bookingIds) && bookingIds.length > 0) {
    const snaps = await Promise.all(
      bookingIds.map((id) => db.collection('earlyBookings').doc(id).get())
    );
    docs = snaps.filter((s) => s.exists);
  } else {
    const all = await db.collection('earlyBookings').get();
    docs = all.docs;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const docSnap of docs) {
    const b = docSnap.data() as any;
    if (!b?.email) { skipped++; continue; }
    if (b.launchNoticeSentAt && !resend) { skipped++; continue; }
    try {
      await sendTriggeredEmail(
        'early_booking_launch_notice',
        { name: b.name || 'お客様', email: b.email },
        {
          companyName: b.companyName || '',
          desiredDevice: b.desiredDevice || '',
        },
      );
      await docSnap.ref.update({ launchNoticeSentAt: Timestamp.now() });
      sent++;
    } catch (err: any) {
      failed++;
      log(`[sendEarlyBookingLaunchNotice] Failed for ${b.email}:`, err?.message || err);
    }
  }

  log(`[sendEarlyBookingLaunchNotice] Done. total=${docs.length} sent=${sent} skipped=${skipped} failed=${failed}`);
  return { success: true, total: docs.length, sent, skipped, failed };
});
