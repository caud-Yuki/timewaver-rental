'use client';

/**
 * @fileOverview FirstPay Payment API Client-side Implementation
 * 
 * トークン発行方式: ウィジェットJS（公式推奨）
 * - 公開鍵取得API + トークン発行APIの手動暗号化は、jsencryptとサーバー側のRSA実装間で
 *   互換性問題（500エラー）が発生したため、ウィジェットJSに切り替え。
 * - ウィジェットJSは暗号化・トークン発行を内部で一括処理するため、互換性問題が解消される。
 * - カード情報がアプリケーションのJSに一切触れないため、PCI DSS準拠の観点でも優位。
 */

import { doc, getDoc, Firestore } from 'firebase/firestore';
import { getFirstPaySecrets } from '@/lib/secret-actions';

// --- Types ---

export interface FirstPayConfig {
  apiKey: string;
  bearerToken: string;
  mode: 'test' | 'production';
}

export interface WidgetTokenResult {
  cardToken: string;
  brand: string;
  expireYear: string;
  expireMonth: string;
  lastFour: string;
  errors?: { code: string; message: string };
}

// --- Internal Helpers ---

const getApiBase = (mode: 'test' | 'production') => {
  return mode === 'production'
    ? 'https://www.api.firstpay.jp'
    : 'https://dev.api.firstpay.jp';
};

const getWidgetBase = (mode: 'test' | 'production') => {
  return mode === 'production'
    ? 'https://www.widget.firstpay.jp'
    : 'https://dev.widget.firstpay.jp';
};

const getHeaders = (config: FirstPayConfig) => {
  const rawToken = config.bearerToken?.trim().replace(/^Bearer\s+/i, '') || '';
  return {
    'Content-Type': 'application/json',
    'FIRSTPAY-PAYMENT-API-KEY': config.apiKey.trim(),
    'Authorization': `Bearer ${rawToken}`,
  };
};

const parseGatewayError = (data: any, status: number) => {
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map((e: any) => e.message || e.code).join(', ') || 'API Error';
  }
  if (data.error && typeof data.error === 'object') {
    return data.error.message || data.error.code || JSON.stringify(data.error);
  }
  if (data.error && typeof data.error === 'string') {
    return data.error;
  }
  for (const key in data) {
    if (Array.isArray(data[key]) && data[key].length > 0) {
      return `${key}: ${data[key][0]}`;
    }
  }
  return `Gateway Error (${status})`;
};

// --- Config ---

/**
 * Get FirstPay configuration.
 * Reads the mode (test/production) from Firestore, then fetches
 * API credentials from Google Cloud Secret Manager.
 */
export async function getFirstPayConfig(db: Firestore): Promise<FirstPayConfig | null> {
  // Read mode from Firestore (non-sensitive setting)
  const settingsRef = doc(db, 'settings', 'global');
  const snap = await getDoc(settingsRef);

  if (!snap.exists()) return null;

  const data = snap.data();
  const mode = (data.mode || 'test') as 'test' | 'production';

  // Read credentials from Secret Manager
  const secrets = await getFirstPaySecrets(mode);
  if (!secrets) return null;

  return {
    apiKey: secrets.apiKey,
    bearerToken: secrets.bearerToken,
    mode,
  };
}

// ============================================================
// Widget JS - トークン発行
// ============================================================

/**
 * ウィジェットJSのscriptタグを動的にロードする。
 * 既にロード済みの場合は即座にresolveする。
 */
export function loadWidgetScript(mode: 'test' | 'production'): Promise<void> {
  return new Promise((resolve, reject) => {
    // 既にグローバルに存在する場合
    if (typeof window !== 'undefined' && (window as any).FirstPayWidget) {
      console.log('[PAYMENT_DEBUG] Widget script already loaded (global found).');
      resolve();
      return;
    }

    // scriptタグが既に挿入されている場合（ロード待ち）
    const existingScript = document.querySelector('script[data-firstpay-widget]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('ウィジェットJSの読み込みに失敗しました')));
      return;
    }

    const script = document.createElement('script');
    // UMD版を使用: ESM版(client.js)はtype="module"でロードしてもwindow.FirstPayWidgetに公開されない
    // UMD版(client.umd.cjs)はグローバルにwindow.FirstPayWidgetを公開する
    script.src = `${getWidgetBase(mode)}/client.umd.cjs`;
    script.setAttribute('data-firstpay-widget', 'true');
    script.onload = () => {
      console.log('[PAYMENT_DEBUG] FirstPay Widget script loaded successfully.');
      resolve();
    };
    script.onerror = () => {
      reject(new Error('ウィジェットJSの読み込みに失敗しました'));
    };
    document.head.appendChild(script);
  });
}

/**
 * ウィジェットを初期化して入力コンポーネントを構築する。
 * 
 * @param element       - ウィジェットを配置するDOM要素
 * @param apiCredential - Bearer Headerに付与するトークン値（bearerTokenからBearer接頭辞を除いた値）
 * @param mode          - 'test' | 'production'
 * @param phoneNumber   - 3DS認証用電話番号（任意。設定できない場合はダミー値で非表示になる）
 * @returns FirstPayWidget インスタンス
 */
export async function initWidget(
  element: HTMLElement,
  apiCredential: string,
  mode: 'test' | 'production',
  phoneNumber?: string,
): Promise<any> {
  await loadWidgetScript(mode);

  const WidgetGlobal = (window as any).FirstPayWidget;
  if (!WidgetGlobal) {
    throw new Error('FirstPayWidget が見つかりません。スクリプトの読み込みを確認してください。');
  }

  // UMDモジュールのエクスポート形式を診断
  console.log('[PAYMENT_DEBUG] FirstPayWidget type:', typeof WidgetGlobal);
  console.log('[PAYMENT_DEBUG] FirstPayWidget keys:', Object.keys(WidgetGlobal));
  if (WidgetGlobal.default) {
    console.log('[PAYMENT_DEBUG] FirstPayWidget.default type:', typeof WidgetGlobal.default);
  }
  if (WidgetGlobal.prototype) {
    console.log('[PAYMENT_DEBUG] FirstPayWidget has prototype (is constructor)');
  }

  // エクスポート形式に応じてインスタンスを生成
  let widget: any;

  // パターン1: { default: class FirstPayWidget } (UMD wrapped ESM default export)
  if (WidgetGlobal.default && typeof WidgetGlobal.default === 'function') {
    console.log('[PAYMENT_DEBUG] Using FirstPayWidget.default as constructor');
    widget = new WidgetGlobal.default();
  }
  // パターン2: class FirstPayWidget (直接コンストラクタ)
  else if (typeof WidgetGlobal === 'function' && WidgetGlobal.prototype) {
    console.log('[PAYMENT_DEBUG] Using FirstPayWidget directly as constructor');
    widget = new WidgetGlobal();
  }
  // パターン3: 既にインスタンスとして公開されている（init, subscribe, publishToken を持つ）
  else if (typeof WidgetGlobal === 'object' && typeof WidgetGlobal.init === 'function') {
    console.log('[PAYMENT_DEBUG] FirstPayWidget is already an instance');
    widget = WidgetGlobal;
  }
  else {
    console.error('[PAYMENT_DEBUG] Unknown FirstPayWidget format:', WidgetGlobal);
    throw new Error(`FirstPayWidget の形式が不明です (type: ${typeof WidgetGlobal})`);
  }

  const options = {
    styles: {
      formGroup: 'margin-bottom: 16px;',
      formField: {
        default: [
          'border: 1px solid #d1d5db',
          'border-radius: 12px',
          'padding: 12px 16px',
          'font-size: 16px',
          'width: 100%',
          'box-sizing: border-box',
          'outline: none',
          'transition: border-color 0.2s',
        ].join('; ') + ';',
        invalid: 'border-color: #ef4444; box-shadow: 0 0 0 1px #ef4444;',
        focused: 'border-color: #2563eb; box-shadow: 0 0 0 1px #2563eb;',
      },
      errorMessage: 'color: #ef4444; font-size: 12px; margin-top: 4px;',
    },
  };

  // phoneNumber: 初期値として設定できない場合はダミーの数字を設定すると非表示になる（仕様記載）
  const phone = phoneNumber?.replace(/[^\d]/g, '') || '00000000000';

  console.log('[PAYMENT_DEBUG] Initializing widget on element:', element.id || element.tagName);
  widget.init(element, apiCredential, options, phone);
  console.log('[PAYMENT_DEBUG] Widget initialized successfully.');

  return widget;
}

/**
 * ウィジェットからトークンを発行する。
 */
export async function publishWidgetToken(
  widget: any,
  phoneNumber?: string,
): Promise<WidgetTokenResult> {
  console.log('[PAYMENT_DEBUG] Publishing token via widget...');

  const result = await widget.publishToken(phoneNumber);

  console.log('[PAYMENT_DEBUG] Widget publishToken result:', {
    hasToken: !!result.cardToken,
    brand: result.brand,
    lastFour: result.lastFour,
    errors: result.errors ?? null,
    fullResult: JSON.stringify(result),
  });

  // 仕様: cardTokenは「正常に発行された場合のみ返却」、errorsは「失敗した場合のみ返却」
  // → cardTokenがあれば成功として扱う
  if (result.cardToken) {
    return result;
  }

  // cardTokenがなく、errorsがある場合はエラー
  if (result.errors) {
    const msg = result.errors.message || result.errors.code || JSON.stringify(result.errors);
    throw new Error(`トークン発行エラー: ${msg}`);
  }

  throw new Error('カードトークンの発行に失敗しました。');
}

// ============================================================
// 3DS Polling
// ============================================================

export async function poll3dsStatus(config: FirstPayConfig, cardToken: string): Promise<boolean> {
  const API_BASE = getApiBase(config.mode);
  const headers = getHeaders(config);

  for (let i = 0; i < 300; i++) {
    const res = await fetch(`${API_BASE}/token/${cardToken}/status/three-ds`, { headers });
    const resData = await res.json();
    console.log(`[PAYMENT_DEBUG] 3DS Poll #${i + 1}: status=${resData.status}`);
    if (resData.status === 'AVAILABLE') return true;
    if (resData.status === 'NOT_AVAILABLE') return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// ============================================================
// Customer / Charge / Recurring （変更なし）
// ============================================================

export async function registerCustomer(
  config: FirstPayConfig,
  customerData: {
    customerId: string;
    cardToken: string;
    familyName: string;
    givenName: string;
    email: string;
    tel: string;
  },
) {
  const API_BASE = getApiBase(config.mode);
  const res = await fetch(`${API_BASE}/customer`, {
    method: 'POST',
    headers: getHeaders(config),
    body: JSON.stringify({
      ...customerData,
      tel: customerData.tel.replace(/[^\d-]/g, ''),
    }),
  });

  const data = await res.json();
  console.log('[PAYMENT_DEBUG] Customer Registration Response:', { status: res.status, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(parseGatewayError(data, res.status));
  return data;
}

/**
 * 登録済み会員のカードトークンを更新する（会員更新API）
 */
export async function updateCustomer(
  config: FirstPayConfig,
  customerId: string,
  cardToken: string,
) {
  const API_BASE = getApiBase(config.mode);
  const res = await fetch(`${API_BASE}/customer/${customerId}`, {
    method: 'PUT',
    headers: getHeaders(config),
    body: JSON.stringify({ cardToken }),
  });

  const data = await res.json();
  console.log('[PAYMENT_DEBUG] Customer Update Response:', { status: res.status, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(parseGatewayError(data, res.status));
  return data;
}

export async function createCharge(
  config: FirstPayConfig,
  chargeData: {
    customerId: string;
    paymentId: string;
    paymentName: string;
    amount: number;
  },
) {
  const API_BASE = getApiBase(config.mode);
  const res = await fetch(`${API_BASE}/charge`, {
    method: 'POST',
    headers: getHeaders(config),
    body: JSON.stringify({ ...chargeData, payTimes: 1 }),
  });

  const data = await res.json();
  console.log('[PAYMENT_DEBUG] Charge Response:', { status: res.status, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(parseGatewayError(data, res.status));
  return data;
}

export async function createRecurring(
  config: FirstPayConfig,
  recurringData: {
    reccuringId: string;
    paymentName: string;
    customerId: string;
    startAt: string;
    payAmount: number;
    currentlyPayAmount: number;
    recurringDayOfMonth?: number;
    maxExecutionNumber?: number;
  },
) {
  const API_BASE = getApiBase(config.mode);
  const res = await fetch(`${API_BASE}/recurring`, {
    method: 'POST',
    headers: getHeaders(config),
    body: JSON.stringify({
      ...recurringData,
      cycle: 'MONTHLY',
      notifyCustomerBeforeRecurring: false,
      notifyCustomerRecurred: false,
    }),
  });

  const data = await res.json();
  console.log('[PAYMENT_DEBUG] Recurring Response:', { status: res.status, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(parseGatewayError(data, res.status));
  return data;
}
