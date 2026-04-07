
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import {log} from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeSDK = require("stripe") as typeof import("stripe");
import {sendTriggeredEmail} from "./triggers";
import {sendMail} from "./gmail";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

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
      } catch (emailErr) {
        log(`[onDeviceReleased] Failed to notify ${user.email}:`, emailErr);
      }
    }
  } catch (err) {
    log(`[onDeviceReleased] Failed to process waitlist:`, err);
  }
}

// --- Stripe Helper ---

async function getStripeClient(): Promise<any> {
  const db = getFirestore();
  const settingsDoc = await db.collection('settings').doc('global').get();
  const settings = settingsDoc.data() as GlobalSettings;
  const apiMode = settings?.mode || 'test';
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
 * Creates a Stripe PaymentIntent (for one-time payments) or Subscription (for monthly),
 * and returns the clientSecret for frontend confirmation via Stripe Elements.
 */

/**
 * Syncs a device's pricing plans to Stripe as Products and Prices.
 * Creates 3 Products (one per plan: 3m, 6m, 12m) with 2 Prices each (monthly + full).
 * Saves the generated IDs back to the device document.
 */
export const syncDeviceToStripe = onCall(async (request) => {
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
  const { paymentLinkId, userId } = request.data;

  if (!paymentLinkId || !userId) {
    throw new HttpsError("invalid-argument", "paymentLinkId and userId are required.");
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

    // 2. Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    const userData = userDoc.data()!;

    // 3. Get application data
    const appDoc = await db.collection('applications').doc(link.applicationId).get();
    const appData = appDoc.exists ? appDoc.data()! : {};

    // 4. Initialize Stripe
    const stripe = await getStripeClient();

    // 5. Get or create Stripe customer
    let stripeCustomerId = userData.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: `${userData.familyName || ''} ${userData.givenName || ''}`.trim(),
        phone: userData.tel,
        metadata: { firebaseUserId: userId },
      });
      stripeCustomerId = customer.id;
      log(`[createStripePayment] Created Stripe customer: ${stripeCustomerId}`);
    } else {
      // Update card info by letting Elements handle it
      log(`[createStripePayment] Reusing existing Stripe customer: ${stripeCustomerId}`);
    }

    const amount = link.payAmount || 0;
    const deviceName = link.deviceName || 'TimeWaver Rental';

    let clientSecret: string;
    let paymentIntentId: string = '';

    if (link.payType === 'full') {
      // --- One-time payment via PaymentIntent ---
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'jpy',
        customer: stripeCustomerId,
        description: `Rental: ${deviceName}`,
        metadata: {
          paymentLinkId,
          applicationId: link.applicationId,
          deviceId: link.deviceId || '',
          payType: 'full',
        },
        automatic_payment_methods: { enabled: true },
      });

      clientSecret = paymentIntent.client_secret!;
      paymentIntentId = paymentIntent.id;
      log(`[createStripePayment] Created full PaymentIntent: ${paymentIntent.id}`);
    } else {
      // --- Monthly: charge 1st month + save card for future subscription ---
      // Look up the device's pre-created Stripe priceId to avoid duplicates
      let monthlyPriceId: string | null = null;
      if (link.deviceId) {
        const deviceDoc = await db.collection('devices').doc(link.deviceId).get();
        if (deviceDoc.exists) {
          const deviceData = deviceDoc.data()!;
          // Determine which term (3m, 6m, 12m) from rentalPeriod
          const rentalPeriod = appData.rentalPeriod || 12;
          const termKey = rentalPeriod <= 3 ? '3m' : rentalPeriod <= 6 ? '6m' : '12m';
          monthlyPriceId = deviceData.stripeProducts?.[termKey]?.monthlyPriceId || null;
          log(`[createStripePayment] Device priceId for ${termKey}: ${monthlyPriceId}`);
        }
      }

      const rentalMonths = appData.rentalPeriod || 12;

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'jpy',
        customer: stripeCustomerId,
        description: `Monthly Rental (1st month): ${deviceName}`,
        metadata: {
          paymentLinkId,
          applicationId: link.applicationId,
          deviceId: link.deviceId || '',
          payType: 'monthly',
          rentalMonths: String(rentalMonths),
          monthlyPriceId: monthlyPriceId || '',
        },
        automatic_payment_methods: { enabled: true },
        setup_future_usage: 'off_session',
      });

      clientSecret = paymentIntent.client_secret!;
      paymentIntentId = paymentIntent.id;
      log(`[createStripePayment] Created monthly PaymentIntent: ${paymentIntent.id} (¥${amount}), priceId: ${monthlyPriceId}`);
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
 */
export const createStripeSubscription = onCall(async (request) => {
  const { stripeCustomerId, monthlyPriceId, paymentIntentId, firestoreSubscriptionId, payAmount, deviceName } = request.data;

  if (!stripeCustomerId || !paymentIntentId) {
    throw new HttpsError("invalid-argument", "stripeCustomerId and paymentIntentId are required.");
  }

  log(`[createStripeSubscription] Customer: ${stripeCustomerId}, basePriceId: ${monthlyPriceId}, payAmount: ${payAmount}`);

  try {
    const stripe = await getStripeClient();
    const db = getFirestore();

    // 1. Get the payment method from the successful PaymentIntent
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentMethodId = typeof pi.payment_method === 'string' ? pi.payment_method : (pi.payment_method as any)?.id;

    if (!paymentMethodId) {
      throw new HttpsError("failed-precondition", "No payment method found on PaymentIntent.");
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
          // Amount differs (modules added) — create a dynamic price with the total
          const dynamicPrice = await stripe.prices.create({
            unit_amount: payAmount,
            currency: 'jpy',
            recurring: { interval: 'month' },
            product_data: { name: `${deviceName || 'TimeWaver Rental'} (カスタム)` },
            metadata: { basePriceId: monthlyPriceId, includesModules: 'true' },
          });
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

    // 4. Create the subscription starting from next billing cycle
    // (first month already paid via PaymentIntent)
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(nextMonth.getDate() > 28 ? 28 : nextMonth.getDate());

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: subscriptionPriceId }],
      default_payment_method: paymentMethodId,
      billing_cycle_anchor: Math.floor(nextMonth.getTime() / 1000),
      proration_behavior: 'none',
      metadata: {
        firestoreSubscriptionId: firestoreSubscriptionId || '',
        paymentIntentId,
      },
    });

    log(`[createStripeSubscription] Created Subscription: ${subscription.id}`);

    // 4. Update Firestore subscription doc with Stripe IDs
    if (firestoreSubscriptionId) {
      await db.collection('subscriptions').doc(firestoreSubscriptionId).update({
        stripeSubscriptionId: subscription.id,
        stripePaymentIntentId: paymentIntentId,
        stripeCustomerId,
        updatedAt: Timestamp.now(),
      });
      log(`[createStripeSubscription] Updated Firestore sub: ${firestoreSubscriptionId}`);
    }

    return {
      status: 'success',
      stripeSubscriptionId: subscription.id,
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
  const {mode, data} = request.data;
  const {paymentIntentId, subscriptionId} = data || {};

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

          updates.stripeStatus = {
            status: stripeSub.status,
            currentPeriodEnd: new Date((stripeSub as any).current_period_end * 1000).toISOString(),
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
              await sendTriggeredEmail('contract_renewal_reminder', { name: userName, email: userEmail }, {
                deviceType: sub.deviceType || '',
                endDate: endAt.toLocaleDateString('ja-JP'),
              });

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

    // --- Auto-expire subscriptions past their end date ---
    let expired = 0;
    for (const subDoc of subscriptionsSnapshot.docs) {
      const sub = subDoc.data();
      if (sub.status !== 'active') continue;

      const endAt = sub.endAt?.toDate ? sub.endAt.toDate() : (sub.endAt?._seconds ? new Date(sub.endAt._seconds * 1000) : null);
      if (!endAt) continue;

      if (endAt < new Date()) {
        // Subscription has passed its end date — mark as expired
        await db.collection('subscriptions').doc(subDoc.id).update({
          status: 'expired',
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

    log(`[syncPaymentData] Sync complete. Synced: ${results.synced}, Errors: ${results.errors}, Expired: ${expired}, Reminders: ${reminders}`);
    return { status: 'success', ...results, expired, reminders };

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
 * Refunds a payment via Stripe API.
 * Uses stripe.refunds.create() with the PaymentIntent ID.
 */
export const refundPayment = onCall(async (request) => {
  const { subscriptionId, paymentIntentId } = request.data;

  if (!subscriptionId || !paymentIntentId) {
    throw new HttpsError("invalid-argument", "subscriptionId and paymentIntentId are required.");
  }

  log(`[refundPayment] Called: subscriptionId=${subscriptionId}, paymentIntentId=${paymentIntentId}`);
  const db = getFirestore();

  try {
    const subDoc = await db.collection('subscriptions').doc(subscriptionId).get();
    if (!subDoc.exists) {
      throw new HttpsError("not-found", "Subscription not found.");
    }

    const stripe = await getStripeClient();
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
    });

    log(`[refundPayment] Stripe refund created: ${refund.id}, status: ${refund.status}`);

    // Record refund in Firestore
    const refundRecord = {
      refundId: refund.id,
      paymentIntentId,
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
      data: { refundId: refund.id, status: refund.status, amount: refund.amount },
    };

  } catch (error: any) {
    log("[refundPayment] ERROR:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Refund failed.");
  }
});

/**
 * Fetches payment history for a specific subscription from Stripe API.
 * For subscriptions: retrieves invoices list.
 * For one-time: retrieves the PaymentIntent.
 * Also returns subscription metadata from Firestore for context.
 */
export const getPaymentHistory = onCall(async (request) => {
  const { subscriptionId } = request.data;
  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "subscriptionId is required.");
  }

  log(`[getPaymentHistory] Called for subscription: ${subscriptionId}`);
  const db = getFirestore();

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
      stripeCustomerId: sub.stripeCustomerId || null,
      payType: sub.payType || null,
      payAmount: sub.payAmount || 0,
      rentalMonths: sub.rentalMonths || null,
      stripeSubscriptionId: sub.stripeSubscriptionId || null,
      stripePaymentIntentId: sub.stripePaymentIntentId || null,
      status: sub.status,
      startAt: toISO(sub.startAt),
      endAt: toISO(sub.endAt),
    };

    // 4. Fetch history from Stripe
    let history: any[] = [];
    let stripeDetails: any = null;

    // For one-time payments — fetch PaymentIntent
    if (sub.stripePaymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(sub.stripePaymentIntentId);
        history.push({
          id: pi.id,
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
        stripeDetails = {
          status: stripeSub.status,
          currentPeriodEnd: new Date((stripeSub as any).current_period_end * 1000).toISOString(),
          cancelAt: (stripeSub as any).cancel_at ? new Date((stripeSub as any).cancel_at * 1000).toISOString() : null,
        };
      } catch (err: any) {
        log(`[getPaymentHistory] Failed to fetch subscription:`, err.message);
      }

      try {
        const invoices = await stripe.invoices.list({
          subscription: sub.stripeSubscriptionId,
          limit: 100,
        });
        for (const inv of invoices.data) {
          history.push({
            id: inv.id,
            type: 'invoice',
            status: inv.status,
            amount: inv.amount_paid || inv.amount_due,
            created: new Date((inv as any).created * 1000).toISOString(),
            paymentIntentId: typeof inv.payment_intent === 'string' ? inv.payment_intent : (inv.payment_intent as any)?.id || null,
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
    // 1. Get webhook secret
    const webhookSecret = await getSecretValue('STRIPE_WEBHOOK_SECRET');
    const stripe = await getStripeClient();

    // 2. Verify signature
    let event: any;
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'] as string;
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      } catch (err: any) {
        log(`[stripeWebhook] Signature verification failed:`, err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }
    } else {
      // No webhook secret configured — accept without verification (test mode only)
      event = req.body;
      log('[stripeWebhook] WARNING: No webhook secret configured, accepting without verification.');
    }

    log(`[stripeWebhook] Event: ${event.type}, ID: ${event.id}`);

    // 3. Handle events
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
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
        const subId = invoice.subscription;
        if (subId) {
          const subsSnap = await db.collection('subscriptions')
            .where('stripeSubscriptionId', '==', subId)
            .limit(1).get();
          if (!subsSnap.empty) {
            const subDoc = subsSnap.docs[0];
            await subDoc.ref.update({
              'stripeStatus.status': 'past_due',
              'stripeStatus.lastSyncedAt': new Date().toISOString(),
              updatedAt: Timestamp.now(),
            });
            log(`[stripeWebhook] invoice.payment_failed: Updated sub ${subDoc.id}`);

            // Notify admin
            const settingsDoc = await db.collection('settings').doc('global').get();
            const adminEmail = settingsDoc.data()?.managerEmail;
            if (adminEmail) {
              const userData = subDoc.data();
              await sendTriggeredEmail('payment_failed', { name: 'Admin', email: adminEmail }, {
                subscriptionId: subDoc.id,
                deviceType: userData.deviceType || '',
                amount: invoice.amount_due,
              });
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
          await subDoc.ref.update({
            'stripeStatus.status': subscription.status,
            'stripeStatus.currentPeriodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
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
  const { to, subject, body } = request.data;

  if (!to || !subject || !body) {
    throw new HttpsError("invalid-argument", "to, subject, and body are required.");
  }

  log(`[sendAdHocEmail] Sending email to: ${to}, subject: ${subject}`);

  try {
    // Fetch email design settings
    const db = getFirestore();
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};
    const svcName = settings.serviceName || 'ChronoRent';
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

    await sendMail(to, subject, htmlBody);
    log(`[sendAdHocEmail] Email sent successfully to ${to}`);
    return { success: true };
  } catch (error: any) {
    log(`[sendAdHocEmail] Error:`, error);
    throw new HttpsError("internal", error.message || "Failed to send email.");
  }
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
    await sendTriggeredEmail('payment_link_sent', user, applicationData);
  }

  // 決済完了 → ユーザーに決済完了メール + スタッフに発送準備依頼
  if (after.status === 'completed' && before.status !== 'completed') {
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
    // Auto-transition to returning
    await appRef.update({ status: 'returning', updatedAt: Timestamp.now() });
    log(`[onApplicationUpdate] Auto-transitioned ${applicationId} from 'expired' to 'returning'.`);
  }

  // 解約 → send 解約通知 + 返却案内 → auto-switch to 返却手続中
  if (after.status === 'canceled' && before.status !== 'pending' && before.status !== 'rejected') {
    await sendTriggeredEmail('subscription_canceled', user, applicationData);
    await sendTriggeredEmail('device_return_guide', user, applicationData);
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

  // 破損・不具合あり → notify user about deposit
  if (after.status === 'damaged') {
    await sendTriggeredEmail('device_damaged', user, applicationData);
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
