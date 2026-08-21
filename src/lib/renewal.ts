import type { ApplicationStatus, GlobalSettings } from '@/types';

/**
 * 契約更新（/apply/renew）の共通ルール
 * ==========================================
 * マイデバイス（更新ボタンの出し分け）と更新申込ページ（URL直叩きの防止）で
 * 同じ判定を使うため、ここに集約している。片方だけ変えないこと。
 */

/** 更新受付を開始する「契約終了日の何ヶ月前か」 */
export const RENEWAL_WINDOW_MONTHS_BEFORE_END = 1;

/**
 * 「進行中」とみなす更新申込のステータス。
 *
 * 新規申込（/apply/new）の重複ガードと違い、`completed` / `shipped` / `in_use` は
 * **含めない**。更新は契約期間ごとに繰り返し行うものなので、前回の更新申込が
 * 完了済みのまま残っているだけで次回の更新まで永久にブロックされてしまう。
 * 完了後の二重更新は「更新期間（isRenewalEligible）」側で防ぐ。
 */
export const RENEWAL_IN_PROGRESS_STATUSES: ApplicationStatus[] = [
  'pending',
  'awaiting_consent_form',
  'consent_form_review',
  'consent_form_approved',
  'approved',
  'payment_sent',
  'awaiting_bank_transfer',
];

/** Firestore Timestamp / Date / ISO文字列 のいずれでも Date にそろえる */
export function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 契約更新の受付期間内か。
 * テストモード（settings.mode === 'test'）では期間に関係なく常に受け付ける。
 */
export function isRenewalEligible(
  endAt: any,
  settings: Pick<GlobalSettings, 'mode'> | null | undefined,
): boolean {
  if (!settings) return false;
  if (settings.mode === 'test') return true;

  const end = toDateOrNull(endAt);
  if (!end) return false;

  const windowOpensAt = new Date(end);
  windowOpensAt.setMonth(windowOpensAt.getMonth() - RENEWAL_WINDOW_MONTHS_BEFORE_END);
  return new Date() >= windowOpensAt;
}
