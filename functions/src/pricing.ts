/**
 * 課金金額のサーバー側再計算（Single Source of Truth）
 * =====================================================
 *
 * これまで `payAmount` はブラウザ（/apply/new, /apply/renew）で計算した値を
 * そのまま Firestore に保存し、決済もその値で行っていた。
 * `applications` は本人が update できるため、DevTools から payAmount を
 * 書き換えれば任意の金額で決済できてしまう状態だった。
 *
 * このモジュールは機器価格・期間・モジュール・クーポンから
 * 「請求すべき金額」をサーバー側で算出する唯一の実装。
 *
 *   1. onApplicationCreate  … 申込作成直後に再計算し payAmount を上書き（正規化）
 *                             + 監査用スナップショット `pricing` を刻む
 *   2. createStripePayment  … 決済直前に再照合し、不一致なら決済を拒否
 *   3. createStripeSubscription … 継続課金額をサーバー値で確定（クライアント値は不使用）
 *   4. firestore.rules      … 本人による payAmount / pricing 等の書き換えを禁止
 *
 * クライアント側の算出式（src/lib/module-pricing.ts, /apply/new）と一致させること。
 */
import { getFirestore } from "firebase-admin/firestore";
import { log } from "firebase-functions/logger";

/** `pricing` スナップショットの形式バージョン。算出式を変えたら上げる。 */
export const PRICING_VERSION = 1;

/**
 * 更新（renew）申込にモジュール料金を含めるか。
 *
 * 2026-08-21: 新規申込（/apply/new）と料金体系を統一するため true にした。
 * /apply/renew も `calculateTotalMonthly` / `calculateTotalFull` を使って
 * モジュール込みの見積りを提示している（両者が一致していないと、正規の更新申込が
 * 金額不一致で拒否される）。片方だけ変更しないこと。
 */
export const RENEWAL_INCLUDES_MODULES = true;

/**
 * 更新（renew）申込でクーポンを使えるか。
 *
 * 2026-08-21: /apply/renew にクーポン入力欄を追加し、新規申込と同水準にそろえたため
 * true にした（以前は UI が無いことを理由に一律で割引 0 にしていた）。
 * false に戻す場合は /apply/renew のクーポン UI も同時に外すこと。
 * なお「新規限定クーポン（newCustomerOnly）」は更新申込では常に無効。
 */
export const RENEWAL_ALLOWS_COUPON = true;

export type PayType = 'monthly' | 'full';
export type TermKey = '3m' | '6m' | '12m';

export interface DeviceModuleLike {
  point?: number;
}

export interface PricingBreakdown {
  version: number;
  /** 請求すべき金額（円）。月額払いなら 1 か月分、一括払いなら総額。 */
  expected: number;
  /** クーポン適用前の金額 */
  baseAmount: number;
  discount: number;
  months: number;
  termKey: TermKey;
  payType: PayType;
  /** device.price[termKey][payType] の素の単価 */
  unitBase: number;
  moduleBasePrice: number;
  /** モジュール加算（月額換算） */
  moduleAddonMonthly: number;
  includesModules: boolean;
  couponId: string | null;
  couponCode: string | null;
  /** クーポンを無効と判定して割引 0 にした場合の理由 */
  couponRejectedReason: string | null;
  isRenewal: boolean;
  deviceId: string | null;
  computedAt: string;
}

/** 金額として妥当な整数か（Stripe JPY は 1 円単位・整数のみ） */
function toAmount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * モジュール加算（月額）。src/lib/module-pricing.ts の calculateModuleAddon と同一。
 * 式: Σ(moduleBasePrice × module.point)
 */
export function calculateModuleAddon(
  modules: DeviceModuleLike[] | undefined | null,
  moduleBasePrice: number,
): number {
  if (!modules || modules.length === 0 || !moduleBasePrice) return 0;
  return modules.reduce((total, mod) => total + moduleBasePrice * toAmount(mod?.point), 0);
}

/**
 * 契約月数。申込ドキュメントは経緯上 `rentalType`（数値）と `rentalPeriod` の
 * どちらにも月数が入りうるので両方を見る（/apply/new は rentalType、
 * 一部の管理・集計コードは rentalPeriod を参照している）。
 */
export function resolveMonths(app: Record<string, any>): number {
  const candidates = [app?.rentalType, app?.rentalPeriod];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 12;
}

/** 月数 → 価格テーブルのキー。index.ts 既存の判定と同じ丸め方。 */
export function termKeyFor(months: number): TermKey {
  return months <= 3 ? '3m' : months <= 6 ? '6m' : '12m';
}

/** この申込が本物の更新（過去に同一機器の契約実績がある）か検証する。 */
async function isVerifiedRenewal(app: Record<string, any>): Promise<boolean> {
  if (!app?.isRenewal) return false;
  const userId = app.userId;
  if (!userId) return false;

  const db = getFirestore();

  // previousSubscriptionId があればそれを最優先で検証
  if (app.previousSubscriptionId) {
    const prev = await db.collection('subscriptions').doc(String(app.previousSubscriptionId)).get();
    if (prev.exists && prev.data()?.userId === userId) return true;
  }

  // URL パラメータ欠落などで previousSubscriptionId が無い正規の更新もあるため、
  // 同一ユーザー・同一機器の契約実績があれば更新とみなす。
  if (app.deviceId) {
    const prior = await db.collection('subscriptions')
      .where('userId', '==', userId)
      .where('deviceId', '==', app.deviceId)
      .limit(1)
      .get();
    if (!prior.empty) return true;
  }

  return false;
}

/**
 * クーポン割引額をサーバー側で算出する。
 * クーポン文書そのものを読み直すので、`couponDiscount` の改ざんは効かない。
 */
async function resolveCouponDiscount(
  app: Record<string, any>,
  baseAmount: number,
  isRenewal: boolean,
): Promise<{ discount: number; couponId: string | null; couponCode: string | null; reason: string | null }> {
  const couponId = app?.couponId ? String(app.couponId) : null;
  if (!couponId) return { discount: 0, couponId: null, couponCode: null, reason: null };

  const db = getFirestore();
  const couponDoc = await db.collection('coupons').doc(couponId).get();
  if (!couponDoc.exists) {
    return { discount: 0, couponId, couponCode: null, reason: 'coupon_not_found' };
  }
  const coupon = couponDoc.data()!;

  // 停止・削除されたクーポン（クライアント側でも同じ判定をしている）
  if (coupon.isActive === false || (coupon.status && coupon.status !== 'active')) {
    return { discount: 0, couponId, couponCode: coupon.code || null, reason: 'coupon_inactive' };
  }

  // 利用上限。判定するのは「この申込がまだ 1 枠も消費していないとき」だけ。
  // `pricing` は Admin SDK しか書けない（firestore.rules）ので、これが無い＝申込作成直後の
  // 初回算出。再計算時（決済時など）は自分自身の消費分で上限に達して正規の申込を
  // 弾いてしまうため、上限チェックはしない。
  const isInitialPricing = !app?.pricing;
  if (isInitialPricing && coupon.maxTotalUsers && toAmount(coupon.currentUsageCount) >= toAmount(coupon.maxTotalUsers)) {
    return { discount: 0, couponId, couponCode: coupon.code || null, reason: 'coupon_usage_limit_reached' };
  }

  // 新規限定クーポンは更新申込では常に対象外（/apply/renew も同じ理由で弾いている）。
  if (coupon.newCustomerOnly && isRenewal) {
    return { discount: 0, couponId, couponCode: coupon.code || null, reason: 'coupon_new_customer_only' };
  }

  // 有効期限は「申込時点」で判定する。決済が数日後になる運用のため、
  // 申込後に期限切れになった正規の申込を弾かない。
  const createdAt: Date | null = app?.createdAt?.toDate ? app.createdAt.toDate() : null;
  if (coupon.expiresAt?.toDate) {
    const expiresAt: Date = coupon.expiresAt.toDate();
    const at = createdAt || new Date();
    if (expiresAt < at) {
      return { discount: 0, couponId, couponCode: coupon.code || null, reason: 'coupon_expired' };
    }
  }

  // 新規限定クーポン: この申込より前に作られた申込があれば対象外
  if (coupon.newCustomerOnly && app.userId) {
    const priorApps = await db.collection('applications')
      .where('userId', '==', app.userId)
      .limit(50)
      .get();
    const hasPrior = priorApps.docs.some((d) => {
      const other = d.data();
      const otherCreated: Date | null = other?.createdAt?.toDate ? other.createdAt.toDate() : null;
      if (!otherCreated || !createdAt) return false;
      return otherCreated.getTime() < createdAt.getTime();
    });
    if (hasPrior) {
      return { discount: 0, couponId, couponCode: coupon.code || null, reason: 'coupon_new_customer_only' };
    }
  }

  const discountValue = toAmount(coupon.discountValue);
  const discount = coupon.discountType === 'percentage'
    ? Math.floor(baseAmount * (discountValue / 100))
    : Math.min(discountValue, baseAmount);

  return { discount: Math.max(0, Math.min(discount, baseAmount)), couponId, couponCode: coupon.code || null, reason: null };
}

/**
 * 申込ドキュメントから請求すべき金額を算出する。
 * 参照するのはサーバー上の devices / settings / coupons のみで、
 * 申込ドキュメント側の金額フィールド（payAmount 等）は一切信用しない。
 */
export async function computeExpectedAmount(app: Record<string, any>): Promise<PricingBreakdown> {
  const db = getFirestore();
  const deviceId = app?.deviceId ? String(app.deviceId) : null;
  const payType: PayType = app?.payType === 'full' ? 'full' : 'monthly';
  const months = resolveMonths(app);
  const termKey = termKeyFor(months);
  const computedAt = new Date().toISOString();

  if (!deviceId) {
    throw new Error('Cannot price application: deviceId is missing.');
  }

  const [deviceDoc, settingsDoc] = await Promise.all([
    db.collection('devices').doc(deviceId).get(),
    db.collection('settings').doc('global').get(),
  ]);

  if (!deviceDoc.exists) {
    throw new Error(`Cannot price application: device ${deviceId} not found.`);
  }
  const device = deviceDoc.data()!;
  const tier = device?.price?.[termKey];
  if (!tier || typeof tier[payType] !== 'number') {
    throw new Error(`Cannot price application: device ${deviceId} has no price for ${termKey}/${payType}.`);
  }

  const unitBase = toAmount(tier[payType]);
  const moduleBasePrice = toAmount(settingsDoc.data()?.moduleBasePrice);

  const renewal = await isVerifiedRenewal(app);
  const includesModules = renewal ? RENEWAL_INCLUDES_MODULES : true;
  const moduleAddonMonthly = includesModules
    ? calculateModuleAddon(device.modules, moduleBasePrice)
    : 0;

  // 月額払い: 1 か月分（モジュール加算込み）
  // 一括払い : ベース総額 + モジュール加算 × 月数
  const baseAmount = payType === 'monthly'
    ? unitBase + moduleAddonMonthly
    : unitBase + moduleAddonMonthly * months;

  // クーポンは新規・更新のどちらでも同じ検証を通す（RENEWAL_ALLOWS_COUPON で切替可）。
  const coupon = (renewal && !RENEWAL_ALLOWS_COUPON)
    ? { discount: 0, couponId: app?.couponId ? String(app.couponId) : null, couponCode: null, reason: app?.couponId ? 'coupon_not_allowed_on_renewal' : null }
    : await resolveCouponDiscount(app, baseAmount, renewal);

  return {
    version: PRICING_VERSION,
    expected: Math.max(0, baseAmount - coupon.discount),
    baseAmount,
    discount: coupon.discount,
    months,
    termKey,
    payType,
    unitBase,
    moduleBasePrice,
    moduleAddonMonthly,
    includesModules,
    couponId: coupon.couponId,
    couponCode: coupon.couponCode,
    couponRejectedReason: coupon.reason,
    isRenewal: renewal,
    deviceId,
    computedAt,
  };
}

/**
 * 決済時に使う「信頼できる金額」を返す。
 *
 * 申込作成時にサーバーが刻んだスナップショット（app.pricing）があればそれを採用する。
 * スナップショットは Admin SDK でのみ書き込まれ、firestore.rules がクライアントからの
 * 書き換えを禁止しているため信用できる。申込後に機器価格が改定されても、
 * 申込時に提示した金額で請求するのが正しいため再計算値では上書きしない。
 *
 * スナップショットが無い（本機能デプロイ前の申込）か、申込内容と食い違う場合は
 * その場で再計算した値を使う。
 */
export async function resolveTrustedPricing(
  app: Record<string, any>,
  context: string,
): Promise<{ breakdown: PricingBreakdown; source: 'snapshot' | 'recomputed' }> {
  const snap = app?.pricing;
  const months = resolveMonths(app);
  const payType: PayType = app?.payType === 'full' ? 'full' : 'monthly';

  const snapshotUsable = !!snap
    && snap.version === PRICING_VERSION
    && Number.isInteger(snap.expected)
    && snap.deviceId === (app?.deviceId ?? null)
    && snap.payType === payType
    && snap.months === months;

  if (snapshotUsable) {
    return { breakdown: snap as PricingBreakdown, source: 'snapshot' };
  }

  if (snap) {
    log(`[pricing:${context}] Snapshot unusable (version/deviceId/payType/months mismatch) — recomputing.`);
  }
  const breakdown = await computeExpectedAmount(app);
  return { breakdown, source: 'recomputed' };
}
