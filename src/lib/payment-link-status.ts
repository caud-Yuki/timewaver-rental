/**
 * @fileOverview Frontend view of the payment link status vocabulary.
 *
 * This file intentionally holds no logic. The canonical implementation lives in
 * `functions/src/payment-link-status.ts` — it has to, because Firebase uploads
 * only the `functions/` directory and compiles it with `include: ["src"]`, so
 * the backend cannot import a module from outside `functions/src`. The Next app
 * can import across the project root, so the dependency points this way and the
 * two sides can no longer drift apart.
 *
 * Consumers: /payment/[paymentLinkId] (link validity), /admin/applications
 * (link issuing) and src/types.ts (the PaymentLink type).
 */
export type {
  PaymentLinkStatus,
  PaymentLinkLike,
  TimestampLike,
} from '../../functions/src/payment-link-status';
export {
  PAYMENT_LINK_STATUSES,
  DEFAULT_PAYMENT_LINK_VALIDITY_DAYS,
  normalizePaymentLinkStatus,
  toDateOrNull,
  resolvePaymentLinkExpiry,
  isPaymentLinkExpired,
  isPaymentLinkUsable,
  paymentLinkUnusableReason,
  computePaymentLinkExpiry,
} from '../../functions/src/payment-link-status';
