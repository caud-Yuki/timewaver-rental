# 決済リンクの状態統一と有効期限（+ 公開読み取りの廃止）

対象: `TWRENTAL-PLATFORM_vrs.1.1`
状態: **デプロイ済み（2026-08-22）**
関連: [SECURITY-payment-amount-verification.md](./SECURITY-payment-amount-verification.md) の「7. 残る関連リスク」

デプロイ実績（2026-08-22 01:00-01:06 JST / コミット `79b4743`）:
- Firestore ルール: `firebase deploy --only firestore:rules`。本番 ruleset
  `68b148a1-80ec-4db0-bb4e-d8107cb9ed6b` を Rules API から取得し、`firestore.rules`
  と差分なし（末尾空行のみ）を確認。`isLinkOwner()` / `linkNotExpired()` /
  `status == 'paid'` が live に入っている。
- Cloud Functions: `rm -rf lib && npx tsc`（exit 0）後にデプロイ。
  `createStripePayment` / `stripeWebhook` / `syncPaymentData` / `onApplicationUpdate`
  が `2026-08-21T16:01Z` 更新・ACTIVE。
- Next.js (App Hosting): `rollout-2026-08-21-006` / `build-2026-08-21-006`（branch: main）
  が SUCCEEDED / READY。配信中のチャンク
  `chunks/app/payment/%5BpaymentLinkId%5D/page-e33bbcea20e5037e.js` に
  「ログインが必要です」「お支払い済みです」「このお支払いリンクの有効期限」が
  含まれることを確認。
- 移行スクリプト: 本番 `paymentLinks` が 0 件のため実行不要（デプロイ後に dry-run で再確認）。

**未完了**: Stripe の Webhook エンドポイント
（`stripewebhook-2ssvwicroa-uc.a.run.app`）の有効イベントに
`payment_intent.succeeded` が入っていない。2-3 のサーバー側フォールバックは
このイベントを追加するまで発火しない（主経路の決済ページ側は動作する）。

---

## 1. 何が起きていたか

### A. 状態の語彙が 4 系統に分裂していた

| 場所 | 書いていた／見ていた値 |
|---|---|
| 管理画面の発行 `handleCreatePaymentLink` | `status: 'open'` |
| 本番検証スクリプト `functions/_prod_step3_create_link.js` | `status: 'pending'` |
| 決済ページの完了処理 | `status: 'used'` へ更新 |
| `firestore.rules` | `'pending'` → `'used'` の遷移だけ許可 |
| `src/types.ts` | `'open' | 'paid' | 'expired'` |

実際に発行されるリンクは `'open'`。ルールが許可する遷移元は `'pending'` だけなので、
**決済完了時の更新は必ず PERMISSION_DENIED で失敗**していた。しかもその書き込みは
`Promise.allSettled` + `console.warn` で握り潰されていたため、失敗にも気付けない。
結果、支払い済みのリンクが `'open'`（＝未使用）のまま残り続けていた。

二重課金にはならない（`createStripePayment` が同じ PaymentIntent を再利用する）が、
リンクの使い回し防止がまったく効いていない状態だった。

### B. 有効期限が事実上存在しなかった

`expiresAt` は型では必須なのに、発行時は `serverTimestamp()` をそのまま入れていた。
つまり **「作成時刻 = 有効期限」= 発行した瞬間に期限切れ**。誰もこの値を見ていなかった
ので実害は出ていなかったが、期限として機能する値ではなかった。決済ページも
Cloud Functions も `status` しか見ておらず、リンクは無期限に有効だった。

### C. 全世界に公開読み取りされていた

`allow read: if true`。リンク ID を知っていれば誰でも `userId` / `applicationId` /
`payAmount` / `stripePaymentIntentId` / `stripeCustomerId` を読めた。ID は自動採番の
20 文字だが、決済案内メールに載って外部を流通する値なので秘密として扱えない。

---

## 2. 修正

### 2-1. 語彙を 1 か所に集約

`functions/src/payment-link-status.ts` が唯一の定義元。

```
'pending' | 'paid' | 'expired' | 'canceled'
```

| 関数 | 役割 |
|---|---|
| `normalizePaymentLinkStatus(raw)` | 旧語彙を吸収（`open`/`active` → `pending`、`used` → `paid`）。未知の値は `expired`（安全側） |
| `resolvePaymentLinkExpiry(link)` | 実効的な有効期限。未設定と「作成時刻がそのまま入った」旧データは `null`（期限なし） |
| `paymentLinkUnusableReason(link)` | 使えない理由（`paid` / `expired` / `canceled`）。使えるなら `null` |
| `computePaymentLinkExpiry(from, days)` | 発行時の期限計算 |

フロントエンドは `src/lib/payment-link-status.ts` 経由で**同じ実装**を使う
（`email-defaults.ts` と同じ理由で実体を `functions/src` に置いている。Firebase は
`functions/` 配下しかアップロードしないため、依存はこの向きにしか張れない）。

### 2-2. 期限を実効化する

発行時に `expiresAt = 作成時刻 + settings/global.paymentLinkValidityDays`（既定 7 日）。
管理画面 → 設定 → 「決済リンクの有効期限（日）」で変更できる。

判定は 3 層:

| 層 | 実装 | 効果 |
|---|---|---|
| 表示 | `/payment/[paymentLinkId]` | 期限切れ・支払い済み・キャンセルを区別して案内。フォームに期限日を表示 |
| **実効ゲート** | `createStripePayment` | 期限切れなら `failed-precondition`。**PaymentIntent が作られない＝決済できない** |
| 保存状態 | `firestore.rules` / `syncPaymentData` | 期限切れリンクの `status` 更新を拒否／棚卸しで `expired` に確定 |

案内メール `payment_link_sent` に `{{paymentDeadline}}` を追加した（期限を伝えないと
ユーザーが黙って詰まるため）。

### 2-3. 決済後にリンクを確実に閉じる

- 決済ページ: `status: 'paid'` + `paidAt` を書く（旧: `'used'`）
- `firestore.rules`: 本人が `pending`（旧語彙 `open` / `active` も可）→ `paid` にできる。
  書けるのは `status` / `paidAt` / `updatedAt` のみ（金額改ざんの同梱を防ぐ既存の制限を維持）
- **Webhook `payment_intent.succeeded`**: サーバー側でも `paid` に確定させる。
  クライアントの書き込みが失敗しても支払い済みリンクが再利用可能なまま残らない
  （Admin SDK はルールを迂回するので確実に通る／冪等）

### 2-4. 読み取りを本人と管理者に限定

```
allow read: if isAdmin() || isLinkOwner();
```

決済ページは未ログインだとリンクを読めないため、「ログインが必要です」を表示して
`/auth/login?redirect=/payment/{id}` へ誘導する（ログイン画面に `redirect` 対応を追加。
オープンリダイレクト防止のため同一サイトの絶対パスのみ許可）。

> `userId` を持たない移行前のリンクは、認証済みなら読める（従来動作）。
> 移行スクリプトが `userId` を埋めたあと、`isLinkOwner()` のフォールバックは削除すること。

---

## 3. 変更ファイル

| ファイル | 内容 |
|---|---|
| `functions/src/payment-link-status.ts` | **新規**。語彙と期限判定の定義元 |
| `src/lib/payment-link-status.ts` | **新規**。フロントエンド用の re-export |
| `functions/src/index.ts` | `createStripePayment` のゲート、`payment_intent.succeeded`、`syncPaymentData` の棚卸し、案内メールの期限 |
| `functions/src/email-defaults.ts` | `payment_link_sent` に `{{paymentDeadline}}` |
| `firestore.rules` | 公開読み取り廃止、`pending` → `paid`、期限切れ拒否、所有者チェック |
| `src/app/payment/[paymentLinkId]/page.tsx` | 状態・期限判定の共通化、未ログイン導線、`paid` 書き込み、書き込み失敗のログ |
| `src/app/admin/applications/page.tsx` | 発行を `pending` + 実効的な `expiresAt` に。失敗時の握り潰しも解消 |
| `src/app/admin/settings/page.tsx` | 有効期限（日）の設定欄 |
| `src/app/admin/email-templates/page.tsx` | `paymentDeadline` を差し込み変数一覧に追加 |
| `src/app/auth/login/page.tsx` | `?redirect=` 対応 |
| `src/types.ts` | `PaymentLinkStatus`、`paidAt`、`isPaid` を deprecated、`paymentLinkValidityDays` |
| `tests/firestore-rules.test.mjs` | 決済リンクのルール回帰テスト（10 件） |
| `scripts/migrate-payment-link-status.cjs` | **新規**。既存データの移行 |

---

## 4. 既存データの移行

```bash
npm --prefix functions run build
node scripts/migrate-payment-link-status.cjs           # dry-run
node scripts/migrate-payment-link-status.cjs --apply   # 書き込み
```

直すもの: `status` の語彙、`expiresAt`（未設定／作成時刻のまま）、`userId` の補完。

未払い（`pending`）のリンクには「実行時刻 + 有効日数」を与える。移行の巻き添えで
いきなり期限切れにしないため。`createdAt` 起算に揃えたい場合は `--strict-expiry`。

> デプロイ完了時点（2026-08-22）の本番 `paymentLinks` は **0 件**で、移行対象は
> 無かった（デプロイ前後の 2 回とも dry-run で確認）。スクリプトは残しておく
> — 旧仕様で発行されたリンクが後から見つかった場合に使う。

---

## 5. デプロイ順序（実施済み — 上の「デプロイ実績」を参照）

1. **Firestore ルール** — 先に出しても壊れない（旧語彙 `open` からの遷移も許可しているため）
2. **Cloud Functions** — `rm -rf lib && npx tsc` の後にデプロイ
3. **Next.js (App Hosting)**
4. 移行スクリプト（1〜3 の間に発行されたリンクを拾うため**最後**に実行）

> ルールを最後に回さないこと。ルールだけ遅れると公開読み取りが残る。

### デプロイ後の確認

1. 管理画面から決済リンクを発行 → `status: 'pending'` と 7 日後の `expiresAt` が入ること
2. 案内メールに期限日が差し込まれること
3. 決済 → リンクが `paid` + `paidAt` になること（Functions ログの
   `payment_intent.succeeded: Closed paymentLink ...` でも確認できる）
4. 同じリンクを再度開くと「お支払い済みです」が出ること
5. 未ログインで開くと「ログインが必要です」→ ログイン後に決済ページへ戻ること
6. 他人のアカウントで同じ URL を開くとリンクを読めないこと

---

## 6. 残る関連リスク

- **`isLinkOwner()` の `userId` 未設定フォールバック。** 移行スクリプト実行後に削除する。
- **決済ページの Firestore 書き込みは今もクライアント発行。** `subscriptions` の作成と
  `applications` の完了更新はブラウザ側で行っている。リンクの `paid` 化だけは Webhook で
  二重化したが、他の書き込みは失敗すると整合性が崩れる（今回はログを `console.error` に
  格上げして可視化しただけ）。本来は Webhook 側に寄せるべき。
- **`syncPaymentData` は管理者が手動で叩く `onCall`。** 期限切れリンクの `expired` 確定は
  この関数を実行したときにしか走らない（決済自体は毎回の判定で確実に弾かれる）。
