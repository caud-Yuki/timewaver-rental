/**
 * @fileOverview 決済リンクの状態語彙と有効期限判定 — 唯一の定義元。
 *
 * これまで状態の語彙が 4 系統に分裂していた:
 *   - 管理画面の発行時    : status: 'open'
 *   - 本番用スクリプト    : status: 'pending'
 *   - 決済ページの完了処理 : status: 'used'
 *   - types.ts の型宣言   : 'open' | 'paid' | 'expired'
 * さらに Firestore ルールが「'pending' → 'used'」の遷移しか許可していなかったため、
 * 'open' で発行されたリンクは決済完了後の更新がルールに弾かれ、いつまでも未使用
 * （＝再利用可能）のまま残っていた。書き込みは Promise.allSettled で握り潰されて
 * いたので、失敗にも気付けなかった。
 *
 * 語彙は 'pending' | 'paid' | 'expired' | 'canceled' の 4 値に統一し、判定は
 * すべてこのモジュールを通す。旧データは normalizePaymentLinkStatus が吸収する。
 *
 * このファイルが functions/src にあるのは email-defaults.ts と同じ理由:
 * Firebase は functions/ 配下しかアップロードしないためバックエンドは外部の
 * モジュールを import できない。Next 側はプロジェクトルートを跨げるので、
 * 依存の向きをこちら向きに固定して両者が二度と乖離しないようにしている。
 * フロントエンドからは src/lib/payment-link-status.ts 経由で参照する。
 */

/** 決済リンクの状態。これ以外の値は書き込まない。 */
export type PaymentLinkStatus = 'pending' | 'paid' | 'expired' | 'canceled';

export const PAYMENT_LINK_STATUSES: readonly PaymentLinkStatus[] = [
  'pending',
  'paid',
  'expired',
  'canceled',
];

/** 既定の有効期限（日）。settings/global.paymentLinkValidityDays で上書きできる。 */
export const DEFAULT_PAYMENT_LINK_VALIDITY_DAYS = 7;

/**
 * 旧語彙 → 現行語彙。過去に書き込まれた値をすべて列挙している。
 * ここに無い値は「意図しない状態」なので使用不可（expired）側へ倒す。
 */
const LEGACY_STATUS_MAP: Record<string, PaymentLinkStatus> = {
  pending: 'pending',
  open: 'pending',
  active: 'pending',
  paid: 'paid',
  used: 'paid',
  succeeded: 'paid',
  expired: 'expired',
  canceled: 'canceled',
  cancelled: 'canceled',
};

/** status フィールドの値を現行語彙に正規化する。未設定は未払い扱い。 */
export function normalizePaymentLinkStatus(raw: unknown): PaymentLinkStatus {
  if (raw === undefined || raw === null || raw === '') return 'pending';
  if (typeof raw !== 'string') return 'expired';
  return LEGACY_STATUS_MAP[raw.toLowerCase()] ?? 'expired';
}

/**
 * Firestore の Timestamp（Admin SDK / Web SDK / JSON 化された物）と Date/文字列を
 * まとめて受けるための型。呼び出し側でクライアント種別を気にしなくて済むようにする。
 */
export type TimestampLike =
  | Date
  | string
  | number
  | { toDate?: () => Date; seconds?: number; _seconds?: number }
  | null
  | undefined;

/** TimestampLike を Date に変換する。変換できなければ null。 */
export function toDateOrNull(value: TimestampLike): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  const seconds = value.seconds ?? value._seconds;
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

/** 判定に使う最小限のリンク形状。Web SDK / Admin SDK のどちらのドキュメントでも通る。 */
export interface PaymentLinkLike {
  status?: unknown;
  expiresAt?: TimestampLike;
  createdAt?: TimestampLike;
}

/**
 * 実効的な有効期限を返す。期限なしの場合は null。
 *
 * 管理画面の旧実装は expiresAt に `serverTimestamp()` をそのまま入れていた
 * （＝作成時刻 = 期限 で、発行した瞬間に期限切れ）。この値をそのまま信じると
 * 既存リンクが全滅するため、作成時刻以下の期限は「未設定」とみなす。
 * 該当データは scripts/migrate-payment-link-status.mjs が正しい期限に書き直す。
 * Firestore ルール側の linkNotExpired() も同じ判定を行っている。
 */
export function resolvePaymentLinkExpiry(link: PaymentLinkLike): Date | null {
  const expiresAt = toDateOrNull(link.expiresAt);
  if (!expiresAt) return null;
  const createdAt = toDateOrNull(link.createdAt);
  if (createdAt && expiresAt.getTime() <= createdAt.getTime()) return null;
  return expiresAt;
}

/** 期限切れかどうか。期限が設定されていなければ常に false。 */
export function isPaymentLinkExpired(link: PaymentLinkLike, now: Date = new Date()): boolean {
  const expiry = resolvePaymentLinkExpiry(link);
  return !!expiry && expiry.getTime() <= now.getTime();
}

/**
 * 決済に使えるリンクかどうか。使えない理由が要る場合は
 * paymentLinkUnusableReason() を使う。
 */
export function isPaymentLinkUsable(link: PaymentLinkLike, now: Date = new Date()): boolean {
  return paymentLinkUnusableReason(link, now) === null;
}

/** 使えない理由。使える場合は null。 */
export function paymentLinkUnusableReason(
  link: PaymentLinkLike,
  now: Date = new Date(),
): PaymentLinkStatus | null {
  const status = normalizePaymentLinkStatus(link.status);
  if (status !== 'pending') return status;
  return isPaymentLinkExpired(link, now) ? 'expired' : null;
}

/** 発行時の有効期限を計算する。 */
export function computePaymentLinkExpiry(
  from: Date,
  validityDays: number = DEFAULT_PAYMENT_LINK_VALIDITY_DAYS,
): Date {
  const days = Number.isFinite(validityDays) && validityDays > 0
    ? Math.floor(validityDays)
    : DEFAULT_PAYMENT_LINK_VALIDITY_DAYS;
  const expiry = new Date(from.getTime());
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}
