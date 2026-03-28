
import {onCall, HttpsError} from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import {log} from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import axios from "axios";
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
      body: '',
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

export const getPaymentData = onCall(async (request) => {
  const {mode, data} = request.data;
  const {paymentId, recurringId} = data || {};

  log("[getPaymentData] Called with mode:", mode, "and data:", data);

  try {
    // 1. Get mode from Firestore (non-sensitive)
    const db = getFirestore();
    const settingsDoc = await db.collection('settings').doc('global').get();

    if (!settingsDoc.exists) {
      log("[getPaymentData] FATAL: Global settings document not found.");
      throw new HttpsError("failed-precondition", "System settings are not configured.");
    }

    const settings = settingsDoc.data() as GlobalSettings;
    const apiMode = settings.mode || 'test';

    log(`[getPaymentData] Operating in '${apiMode}' mode.`);

    // 2. Get API credentials from Secret Manager
    const isTest = apiMode === 'test';
    const apiKey = await getSecretValue(isTest ? 'FIRSTPAY_TEST_API_KEY' : 'FIRSTPAY_PROD_API_KEY');
    const bearerToken = await getSecretValue(isTest ? 'FIRSTPAY_TEST_BEARER_TOKEN' : 'FIRSTPAY_PROD_BEARER_TOKEN');
    const baseURL = isTest ? 'https://dev.api.firstpay.jp' : 'https://www.api.firstpay.jp';

    if (!apiKey || !bearerToken) {
      log("[getPaymentData] FATAL: API key or bearer token is missing in Secret Manager.");
      throw new HttpsError("failed-precondition", `API credentials for '${apiMode}' mode are not configured in Secret Manager.`);
    }

    // 3. Construct the API request
    let endpoint = '';
    switch (mode) {
      case 'get-all-payments':
        endpoint = '/charge';
        break;
      case 'get-payment-by-id':
        if (!paymentId) throw new HttpsError("invalid-argument", "Payment ID is required.");
        endpoint = `/charge/${paymentId}`;
        break;
      case 'get-recurring-history':
        if (!recurringId) throw new HttpsError("invalid-argument", "Recurring ID is required.");
        endpoint = `/recurring/${recurringId}/history`;
        break;
      case 'get-payment-by-customer':
        throw new HttpsError("unimplemented", "'get-payment-by-customer' is not supported by the API documentation.");
      default:
        throw new HttpsError("invalid-argument", "Invalid mode specified.");
    }

    const finalURL = baseURL + endpoint;
    log(`[getPaymentData] Making GET request to: ${finalURL}`);

    // 4. Make the API call with Authorization headers
    const response = await axios.get(finalURL, {
      headers: {
        'FIRSTPAY-PAYMENT-API-KEY': apiKey,
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      }
    });

    // 5. Return the data from FirstPay
    log("[getPaymentData] Success: Received data from FirstPay API.", response.data);
    return { status: 'success', data: response.data };

  } catch (error) {
    // 6. Detailed error logging
    log("[getPaymentData] ERROR caught:", error);

    if (axios.isAxiosError(error)) {
      log("[getPaymentData] Axios error details:", {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      });
      throw new HttpsError(
        "unknown",
        `Error from payment gateway: ${error.response?.status || error.code}. Check function logs for details.`,
        error.response?.data
      );
    } else if (error instanceof HttpsError) {
      throw error;
    } else {
      throw new HttpsError("internal", "An unexpected internal server error occurred. Please check function logs.");
    }
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
 * Syncs payment data from FirstPay API for all subscriptions in Firestore.
 * For each subscription, fetches the latest status from FirstPay and updates Firestore.
 */
export const syncPaymentData = onCall(async (request) => {
  log("[syncPaymentData] Function called.");
  const db = getFirestore();

  try {
    // 1. Get mode and credentials
    const settingsDoc = await db.collection('settings').doc('global').get();
    if (!settingsDoc.exists) {
      throw new HttpsError("failed-precondition", "System settings are not configured.");
    }
    const settings = settingsDoc.data() as GlobalSettings;
    const apiMode = settings.mode || 'test';
    const isTest = apiMode === 'test';

    const apiKey = await getSecretValue(isTest ? 'FIRSTPAY_TEST_API_KEY' : 'FIRSTPAY_PROD_API_KEY');
    const bearerToken = await getSecretValue(isTest ? 'FIRSTPAY_TEST_BEARER_TOKEN' : 'FIRSTPAY_PROD_BEARER_TOKEN');
    const baseURL = isTest ? 'https://dev.api.firstpay.jp' : 'https://www.api.firstpay.jp';

    if (!apiKey || !bearerToken) {
      throw new HttpsError("failed-precondition", `API credentials for '${apiMode}' mode are not configured.`);
    }

    const headers = {
      'FIRSTPAY-PAYMENT-API-KEY': apiKey,
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json'
    };

    // 2. Get all subscriptions from Firestore
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    log(`[syncPaymentData] Found ${subscriptionsSnapshot.size} subscriptions to sync.`);

    const results: { synced: number; errors: number; details: any[] } = { synced: 0, errors: 0, details: [] };

    // 3. For each subscription, fetch data from FirstPay
    for (const subDoc of subscriptionsSnapshot.docs) {
      const sub = subDoc.data();
      const subId = subDoc.id;

      try {
        const updates: Record<string, any> = {};

        // Sync recurring subscription status
        if (sub.recurringId) {
          const recurringRes = await axios.get(`${baseURL}/recurring/${sub.recurringId}`, { headers });
          const recurring = recurringRes.data;

          updates.firstpayRecurringStatus = {
            isActive: recurring.isActive,
            nextRecurringAt: recurring.nextRecurringAt || null,
            payAmount: recurring.payAmount,
            cycle: recurring.cycle,
            remainingExecutionNumber: recurring.remainingExecutionNumber ?? null,
            lastSyncedAt: new Date().toISOString(),
          };

          // Update subscription status based on FirstPay isActive
          if (recurring.isActive === false && sub.status === 'active') {
            updates.status = 'completed';
          }

          results.details.push({ id: subId, type: 'recurring', synced: true, isActive: recurring.isActive });
        }

        // Sync one-time payment status
        if (sub.paymentId) {
          const paymentRes = await axios.get(`${baseURL}/charge/${sub.paymentId}`, { headers });
          const payment = paymentRes.data;

          updates.firstpayPaymentStatus = {
            paymentStatus: payment.paymentStatus,
            amount: payment.amount,
            lastSyncedAt: new Date().toISOString(),
          };

          results.details.push({ id: subId, type: 'payment', synced: true, status: payment.paymentStatus });
        }

        // Write updates to Firestore
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = Timestamp.now();
          await db.collection('subscriptions').doc(subId).update(updates);
          results.synced++;
        }
      } catch (err: any) {
        results.errors++;
        const errMsg = axios.isAxiosError(err) ? `${err.response?.status}: ${JSON.stringify(err.response?.data)}` : err.message;
        log(`[syncPaymentData] Error syncing ${subId}:`, errMsg);
        results.details.push({ id: subId, synced: false, error: errMsg });
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
 * Stops a recurring subscription via FirstPay API.
 * DELETE /recurring/{recurringId} — sets isActive to false.
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

    if (!sub.recurringId) {
      throw new HttpsError("failed-precondition", "This subscription does not have a recurringId.");
    }

    // Get credentials
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.data() as GlobalSettings;
    const apiMode = settings?.mode || 'test';
    const isTest = apiMode === 'test';

    const apiKey = await getSecretValue(isTest ? 'FIRSTPAY_TEST_API_KEY' : 'FIRSTPAY_PROD_API_KEY');
    const bearerToken = await getSecretValue(isTest ? 'FIRSTPAY_TEST_BEARER_TOKEN' : 'FIRSTPAY_PROD_BEARER_TOKEN');
    const baseURL = isTest ? 'https://dev.api.firstpay.jp' : 'https://www.api.firstpay.jp';

    if (!apiKey || !bearerToken) {
      throw new HttpsError("failed-precondition", "API credentials are not configured.");
    }

    // Call FirstPay DELETE /recurring/{recurringId}
    const response = await axios.delete(`${baseURL}/recurring/${sub.recurringId}`, {
      headers: {
        'FIRSTPAY-PAYMENT-API-KEY': apiKey,
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      }
    });

    log(`[stopRecurringPayment] FirstPay response:`, JSON.stringify(response.data));

    // Update subscription in Firestore
    await db.collection('subscriptions').doc(subscriptionId).update({
      status: 'canceled',
      'firstpayRecurringStatus.isActive': false,
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
    if (axios.isAxiosError(error)) {
      throw new HttpsError("unknown", `FirstPay API error: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to stop recurring payment.");
  }
});

/**
 * Refunds a payment via FirstPay API.
 * - For one-time charges: POST /refund/{paymentId}
 * - For recurring history: PUT /recurring/{recurringId}/history/{historyId}/refund
 */
export const refundPayment = onCall(async (request) => {
  const { subscriptionId, paymentId, historyId, type } = request.data;

  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "subscriptionId is required.");
  }
  if (type === 'charge' && !paymentId) {
    throw new HttpsError("invalid-argument", "paymentId is required for charge refund.");
  }
  if (type === 'recurring' && (!historyId)) {
    throw new HttpsError("invalid-argument", "historyId is required for recurring refund.");
  }

  log(`[refundPayment] Called: type=${type}, subscriptionId=${subscriptionId}, paymentId=${paymentId}, historyId=${historyId}`);
  const db = getFirestore();

  try {
    const subDoc = await db.collection('subscriptions').doc(subscriptionId).get();
    if (!subDoc.exists) {
      throw new HttpsError("not-found", "Subscription not found.");
    }
    const sub = subDoc.data()!;

    // Get credentials
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.data() as GlobalSettings;
    const apiMode = settings?.mode || 'test';
    const isTest = apiMode === 'test';

    const apiKey = await getSecretValue(isTest ? 'FIRSTPAY_TEST_API_KEY' : 'FIRSTPAY_PROD_API_KEY');
    const bearerToken = await getSecretValue(isTest ? 'FIRSTPAY_TEST_BEARER_TOKEN' : 'FIRSTPAY_PROD_BEARER_TOKEN');
    const baseURL = isTest ? 'https://dev.api.firstpay.jp' : 'https://www.api.firstpay.jp';

    if (!apiKey || !bearerToken) {
      throw new HttpsError("failed-precondition", "API credentials are not configured.");
    }

    const headers = {
      'FIRSTPAY-PAYMENT-API-KEY': apiKey,
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json'
    };

    let response;

    if (type === 'charge') {
      // POST /refund/{paymentId}
      response = await axios.post(`${baseURL}/refund/${paymentId}`, {}, { headers });
      log(`[refundPayment] Charge refund response:`, JSON.stringify(response.data));
    } else if (type === 'recurring') {
      // PUT /recurring/{recurringId}/history/{historyId}/refund
      const recurringId = sub.recurringId;
      if (!recurringId) {
        throw new HttpsError("failed-precondition", "Subscription has no recurringId.");
      }
      response = await axios.put(`${baseURL}/recurring/${recurringId}/history/${historyId}/refund`, {}, { headers });
      log(`[refundPayment] Recurring refund response:`, JSON.stringify(response.data));
    } else {
      throw new HttpsError("invalid-argument", "Invalid refund type. Must be 'charge' or 'recurring'.");
    }

    // Update subscription document with refund info
    const refundRecord = {
      type,
      paymentId: paymentId || null,
      historyId: historyId || null,
      refundedAt: new Date().toISOString(),
      apiResponse: response.data,
    };

    // Add to refundHistory array in Firestore
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
      data: response.data,
    };

  } catch (error: any) {
    log("[refundPayment] ERROR:", error);
    if (axios.isAxiosError(error)) {
      throw new HttpsError("unknown", `FirstPay API error: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Refund failed.");
  }
});

/**
 * Fetches payment history for a specific subscription from FirstPay API.
 * For recurring: GET /recurring/{recurringId}/history
 * For one-time: GET /charge/{paymentId}
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

    // 2. Get credentials
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.data() as GlobalSettings;
    const apiMode = settings?.mode || 'test';
    const isTest = apiMode === 'test';

    const apiKey = await getSecretValue(isTest ? 'FIRSTPAY_TEST_API_KEY' : 'FIRSTPAY_PROD_API_KEY');
    const bearerToken = await getSecretValue(isTest ? 'FIRSTPAY_TEST_BEARER_TOKEN' : 'FIRSTPAY_PROD_BEARER_TOKEN');
    const baseURL = isTest ? 'https://dev.api.firstpay.jp' : 'https://www.api.firstpay.jp';

    if (!apiKey || !bearerToken) {
      throw new HttpsError("failed-precondition", `API credentials for '${apiMode}' mode are not configured.`);
    }

    const headers = {
      'FIRSTPAY-PAYMENT-API-KEY': apiKey,
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json'
    };

    // 3. Build subscription info
    const toISO = (ts: any) => {
      if (!ts) return null;
      if (ts.toDate) return ts.toDate().toISOString();
      if (ts._seconds) return new Date(ts._seconds * 1000).toISOString();
      return null;
    };

    const subscriptionInfo = {
      id: subDoc.id,
      customerId: sub.customerId || null,
      payType: sub.payType || null,
      payAmount: sub.payAmount || 0,
      rentalMonths: sub.rentalMonths || null,
      recurringId: sub.recurringId || null,
      paymentId: sub.paymentId || null,
      status: sub.status,
      startAt: toISO(sub.startAt),
      endAt: toISO(sub.endAt),
    };

    // 4. Fetch history from FirstPay
    let history: any[] = [];
    let recurringDetails: any = null;

    // Fetch one-time payment details first (initial charge)
    if (sub.paymentId) {
      try {
        const paymentRes = await axios.get(`${baseURL}/charge/${sub.paymentId}`, { headers });
        log(`[getPaymentHistory] Charge API response:`, JSON.stringify(paymentRes.data));
        const paymentData = paymentRes.data;
        history.push({
          historyId: null,
          paymentId: paymentData.paymentId || sub.paymentId,
          paymentStatus: paymentData.paymentStatus || 'UNKNOWN',
          amount: paymentData.amount || sub.payAmount,
          type: 'charge',
          errors: paymentData.errors || [],
        });
      } catch (err: any) {
        log(`[getPaymentHistory] Failed to fetch charge:`, err.message, err.response?.data);
      }
    }

    if (sub.recurringId) {
      // Fetch recurring details
      try {
        const recurringRes = await axios.get(`${baseURL}/recurring/${sub.recurringId}`, { headers });
        log(`[getPaymentHistory] Recurring details response:`, JSON.stringify(recurringRes.data));
        recurringDetails = recurringRes.data;
      } catch (err: any) {
        log(`[getPaymentHistory] Failed to fetch recurring details:`, err.message, err.response?.data);
      }

      // Add initial payment (currentlyPayAmount) as first history entry
      if (recurringDetails && recurringDetails.currentlyPayAmount) {
        history.push({
          historyId: null,
          paymentId: null,
          paymentStatus: 'SOLD',
          amount: recurringDetails.currentlyPayAmount,
          type: 'initial',
          label: '初回決済（契約開始時）',
          errors: [],
        });
      }

      // Fetch recurring execution history
      try {
        const historyRes = await axios.get(`${baseURL}/recurring/${sub.recurringId}/history`, { headers });
        log(`[getPaymentHistory] Recurring history response:`, JSON.stringify(historyRes.data));
        const rawHistory = Array.isArray(historyRes.data) ? historyRes.data : [historyRes.data];
        for (const entry of rawHistory) {
          history.push({
            historyId: entry.historyId || null,
            paymentId: null,
            paymentStatus: entry.paymentStatus || 'UNKNOWN',
            amount: entry.amount || 0,
            type: 'recurring',
            errors: entry.errors || [],
          });
        }
      } catch (err: any) {
        log(`[getPaymentHistory] Failed to fetch recurring history:`, err.message, err.response?.data);
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
    const d = settings.emailDesign || {
      primaryColor: '#2563eb',
      fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif",
      footerText: '© 2026 ChronoRent. All rights reserved.\nこのメールはChronoRentシステムから自動送信されています。',
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
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">ChronoRent</h1>
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

  // 契約満了 → send 契約終了通知 + 返却案内 → auto-switch to 返却手続中
  if (after.status === 'expired') {
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

  // 破損・不具合あり → notify user about deposit
  if (after.status === 'damaged') {
    await sendTriggeredEmail('device_damaged', user, applicationData);
  }

  // --- Cleanup for Canceled/Rejected Applications ---
  const isNowCanceled = ['canceled', 'rejected'].includes(after.status);
  const wasNotCanceled = !['canceled', 'rejected'].includes(before.status);

  if (isNowCanceled && wasNotCanceled) {
    log(`[onApplicationUpdate] Cleanup initiated for ${applicationId} due to status: ${after.status}.`);
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
