
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {log} from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import axios from "axios";

log("Top-level: functions/index.ts file loaded. If you see this, the function is starting.");

// Initialize Firebase Admin SDK
initializeApp();

// Define a type for our global settings for type safety
interface GlobalSettings {
  mode: 'test' | 'production';
  firstpayTest?: {
    apiKey?: string;
    bearerToken?: string;
  };
  firstpayProd?: {
    apiKey?: string;
    bearerToken?: string;
  };
}

export const getPaymentData = onCall(async (request) => {
  const {mode, data} = request.data;
  const {paymentId, recurringId} = data || {};

  log("[getPaymentData] Called with mode:", mode, "and data:", data);

  try {
    // 1. Get settings from Firestore
    const db = getFirestore();
    const settingsDoc = await db.collection('settings').doc('global').get();

    if (!settingsDoc.exists) {
      log("[getPaymentData] FATAL: Global settings document not found.");
      throw new HttpsError("failed-precondition", "System settings are not configured.");
    }

    const settings = settingsDoc.data() as GlobalSettings;
    const apiMode = settings.mode || 'test'; // Default to test mode

    log(`[getPaymentData] Operating in '${apiMode}' mode.`);

    // 2. Determine API credentials and base URL based on mode
    const isTest = apiMode === 'test';
    const creds = isTest ? settings.firstpayTest : settings.firstpayProd;
    const baseURL = isTest ? 'https://dev.api.firstpay.jp' : 'https://www.api.firstpay.jp';

    const apiKey = creds?.apiKey;
    const bearerToken = creds?.bearerToken;

    if (!apiKey || !bearerToken) {
      log("[getPaymentData] FATAL: API key or bearer token is missing for the current mode.");
      throw new HttpsError("failed-precondition", `API credentials for '${apiMode}' mode are not configured.`);
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
      
      const createdAt = (subscription.createdAt as Timestamp)?.toDate().toISOString() || null;
      const updatedAt = (subscription.updatedAt as Timestamp)?.toDate().toISOString() || null;

      return {
        id: doc.id,
        ...subscription,
        customerName: user.displayName,
        email: user.email,
        createdAt,
        updatedAt,
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
