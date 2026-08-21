# 課金金額のサーバー側再計算（payAmount 改ざん対策）

対象: `TWRENTAL-PLATFORM_vrs.1.1`
状態: **デプロイ済み（2026-08-21）**
関連: [SECURITY-V1-URGENT-FIXES.md](./SECURITY-V1-URGENT-FIXES.md)

デプロイ実績（2026-08-21）:
- Firestore ルール: `firebase deploy --only firestore:rules` 実行。本番 ruleset
  `72999707-10bf-48bf-8026-873d76c957ce` に `lockedPricingFields` / `pricing` 制限が
  含まれることを firebaserules API で確認。
- Cloud Functions: `rm -rf lib && npx tsc`（exit 0）後にデプロイ。
  `createStripePayment` / `createStripeSubscription` / `onApplicationCreate` /
  `onApplicationUpdate` を更新、`onSubscriptionCreate` を新規作成。
- Next.js (App Hosting): コミット `009517c` を `origin/main` に push。
  `rollout-2026-08-21-001` / `build-2026-08-21-001`（branch: main）が **SUCCEEDED**、
  本番 URL が 200 応答することを確認（2026-08-21 16:34 JST）。

---

## 1. 何が起きていたか

請求金額 `payAmount` は**ブラウザが計算した値**で、そのまま Firestore に保存され、
その値で Stripe に課金していた。サーバー側の検証は「50円以上の整数か」だけだった。

```
/apply/new  calculateAmount()          … 機器価格 + モジュール − クーポン割引をブラウザで計算
   ↓ applications.payAmount            … 本人が update 可能（firestore.rules）
   ↓ paymentLinks.payAmount            … 管理者が申込の値をそのままコピー
   ↓ createStripePayment               … 「50円以上の整数」しか見ていない
   ↓ Stripe PaymentIntent(amount)      … ← 改ざんされた金額で課金が通る
```

改ざん経路は 3 つあった。

| # | 経路 | 内容 |
|---|---|---|
| A | `applications.payAmount` | 本人が自分の申込を update できるため、DevTools から書き換え可能 |
| B | `paymentLinks.payAmount` | ルールにフィールド制限が無く、status を `used` にする更新に金額改ざんを同梱できた |
| C | `createStripeSubscription(payAmount)` | **クライアントが送った金額をそのまま** Stripe の動的 Price にして毎月課金していた（Firestore すら経由しない） |

C は継続課金（月額プラン）に効くため、影響が最も大きい。

---

## 2. 修正方針

**4 層。**「サーバーで算出した金額だけが請求される」ようにする。

| 層 | 実装 | 役割 |
|---|---|---|
| 1. 正規化 | `onApplicationCreate` | 申込作成直後にサーバーで再計算し `payAmount` を上書き。根拠を `pricing` スナップショットとして刻む |
| 2. 決済時の照合 | `createStripePayment` | 決済リンクの金額とサーバー値を突き合わせ、**不一致なら決済を拒否** |
| 3. 継続課金 | `createStripeSubscription` | クライアントの `payAmount` / `monthlyPriceId` を**一切使わない**。PaymentIntent → 決済リンク → 申込から導出 |
| 4. 書き込み禁止 | `firestore.rules` | 本人が `payAmount` / `pricing` / 契約条件を後から書き換えられないようにする |

算出ロジックは `functions/src/pricing.ts` に集約した（サーバー側の Single Source of Truth）。

### 算出式（クライアント `src/lib/module-pricing.ts` と一致）

```
モジュール加算(月額) = Σ(settings.moduleBasePrice × module.point)

月額払い = device.price[期間].monthly + モジュール加算
一括払い = device.price[期間].full    + モジュール加算 × 月数

割引 = 率引き: floor(割引前金額 × discountValue / 100)
       額引き: min(discountValue, 割引前金額)

請求額 = 割引前金額 − 割引            （0 未満にはならない）
```

クーポンは **クーポン文書を読み直して** 再計算する（`couponDiscount` は信用しない）。
有効期限は「申込時点」で判定する — 決済が数日後になる運用で、正規の申込を弾かないため。

---

## 3. 変更ファイル

| ファイル | 変更 |
|---|---|
| `functions/src/pricing.ts` (新規) | 金額算出の Single Source of Truth。`computeExpectedAmount` / `resolveTrustedPricing` |
| `functions/src/index.ts` `onApplicationCreate` | 申込作成時に再計算し `payAmount` / `originalAmount` / `couponDiscount` を上書き、`pricing` を保存 |
| `functions/src/index.ts` `createStripePayment` | 決済直前に照合し不一致なら拒否。申込の所有者チェックも追加。痕跡を `paymentLinks.amountVerification` に記録 |
| `functions/src/index.ts` `createStripeSubscription` | 継続課金額をサーバー導出に変更。呼び出し元と Stripe 顧客 / 申込 / 契約レコードの所有者一致を検証 |
| `functions/src/index.ts` `onSubscriptionCreate` (新規) | 契約レコードの `payAmount` をサーバー値に正規化（管理画面の表示・集計の整合） |
| `functions/src/index.ts` `onApplicationUpdate` | 銀行振込の請求額・サーバー生成の契約レコードもサーバー値を使う |
| `firestore.rules` | `applications`: 金額・契約条件フィールドを本人から変更不可・`pricing` の持ち込み禁止。`paymentLinks`: 一般ユーザーの更新を `status`/`updatedAt` のみに限定 |
| `src/app/payment/[paymentLinkId]/page.tsx` | `createStripeSubscription` に金額・priceId を送らない |
| `src/app/apply/renew/page.tsx` | 更新申込の見積りをモジュール込みに統一（新規申込と同じ算出式へ） |
| `src/types.ts` | `PricingBreakdown` 型、`Application.pricing`、`PaymentLink.amountVerification` |

---

## 4. 挙動の要点

- **申込後に機器価格が改定されても、申込時に提示した金額で請求する。**
  `pricing` スナップショットを優先し、無い場合（本機能デプロイ前の申込）だけ再計算する。
- **偽装スナップショットは効かない。** `pricing` は Admin SDK でのみ書き込まれ、ルールで
  クライアント書き込みを禁止。加えて deviceId / payType / 月数が申込本体と食い違えば破棄して再計算する。
- **更新(renew)申込も新規と同じくモジュール料金を含める**（2026-08-21 に統一）。
  以前の `/apply/renew` は機器ベース価格のみを提示していたため算出式が新規と食い違っていた。
  更新画面を `calculateTotalMonthly` / `calculateTotalFull` に揃え、
  `functions/src/pricing.ts` の `RENEWAL_INCLUDES_MODULES` も `true` にしてある。
  **片方だけ変えると正規の更新申込が金額不一致で拒否される**ので必ず両方を直すこと。
  なお `isRenewal` はクーポン可否の判定にも使うため、フラグを立てただけでは更新扱いにならず、
  **同一ユーザー・同一機器の契約実績がある場合のみ**更新と判定する。
  > 2026-08-21 追記: その後、更新申込にもクーポン欄を追加して新規と同条件にそろえた
  > （`RENEWAL_ALLOWS_COUPON`。新規限定クーポンのみ更新では無効）。
  > 更新フロー全体の整合は `docs/FLOW-renewal.md` を参照。
- **金額を確定できない申込は決済できない。** 機器削除・価格未設定などで算出に失敗した場合は
  `pricing.version = 0` として記録し、決済時に「金額を検証できませんでした」で拒否する。
- **継続課金のフォールバック。** 申込から導出できない場合（旧 PaymentIntent 等）は、
  クライアント申告値ではなく **実際に決済された 1 か月目の金額**（Stripe 側の確定値）を使う。

---

## 5. 検証

| 検証 | 結果 |
|---|---|
| `npm run test:pricing`（新規・Firestore エミュレータ） | **18/18 passed** |
| `npm run test:rules` | **50/50 passed**（うち今回追加 13 件） |
| `functions` の `tsc` | **exit 0** |
| Next.js `tsc --noEmit` | 今回変更したファイルに新規エラー 0 件（既存エラーは 59 → 52 件に減少） |

### 金額算出のテスト（`tests/pricing.test.mjs`）

`functions/lib/pricing.js` をエミュレータ上の Firestore に対してそのまま実行する。

- 月額 / 一括 / 3・6・12ヶ月の各料金テーブルが申込画面の見積りと一致すること
- 改ざんされた `payAmount` / `couponDiscount` が結果に影響しないこと
- 存在しないクーポン ID・期限切れクーポンでは割引されないこと
- 割引額が請求額を超えない（マイナス請求にならない）こと
- 契約実績が無いのに `isRenewal` を立てても更新扱いにならないこと
- 偽装 `pricing` スナップショットは破棄して再計算されること

### ルールのテスト（`tests/firestore-rules.test.mjs`）

- 本人が `payAmount` / `pricing` / クーポン / 契約条件を書き換えられないこと
- 他の変更（status 更新など）に紛れ込ませても拒否されること
- 申込作成時に `pricing` を偽装して持ち込めないこと
- 決済リンクの `payAmount` を書き換えられないこと（`status: used` との同梱も不可）
- **既存フローが壊れないこと**: 申込キャンセル / 本人確認書類・同意書アップロード /
  決済完了時の `status: used` 更新 / 管理者による金額修正

---

## 6. デプロイ手順

**順序が重要。** ルール → Functions → Next.js。

### 6-1. Firestore ルール

```
firebase deploy --only firestore:rules
```

### 6-2. Cloud Functions

```
cd functions && rm -rf lib/ && npx tsc && cd .. && firebase deploy --only functions
```

新規関数 `onSubscriptionCreate` が追加されるため、初回デプロイで作成確認が入る。

### 6-3. Next.js (App Hosting)

`src/app/payment/[paymentLinkId]/page.tsx` / `src/app/apply/renew/page.tsx` / `src/types.ts`
の変更を push すれば自動ビルド。

> **更新申込は Functions と足並みを揃えること。**
> `RENEWAL_INCLUDES_MODULES = true` の Functions を出したあと `/apply/renew` の
> モジュール込み表示が未反映だと、モジュール付き機器の更新申込が
> 「金額が一致しません」で決済できなくなる（モジュール未設定の機器は影響なし）。

> **順序の注意**: Next.js を先に出しても壊れない（サーバーが金額を無視するだけ）。
> 逆に Functions を先に出しても壊れない（クライアントが送る値が使われなくなるだけ）。
> ただし**ルールは Functions と同時か先**に出すこと。ルールだけ遅れると改ざん経路 A/B が残る。

### 6-4. デプロイ後の確認

1. 新規申込を 1 件作成 → `applications/{id}.pricing` が書かれ、`payAmount` が正しいこと
2. 月額プランで決済 → Stripe の Subscription 金額が申込金額と一致すること
3. Cloud Functions ログに `AMOUNT MISMATCH` が出ていないこと
   （出ていれば改ざん試行、または算出式のズレ。`paymentLinks.amountVerification` にも記録される）

---

## 7. 残る関連リスク（今回のスコープ外）

- ~~**`paymentLinks` が公開読み取り (`allow read: if true`)。**~~
  ~~リンク ID を知る第三者が金額・PaymentIntent ID・Stripe 顧客 ID を読める。~~
  → **対応済み（2026-08-21・未デプロイ）**: 本人と管理者のみに限定。
  [SECURITY-payment-link-status.md](./SECURITY-payment-link-status.md) を参照。
- ~~**決済リンクが `status: 'open'` で作られ、`used` に遷移できない。**~~
  ~~ルールは `pending → used` のみ許可しているため、決済完了後もリンクが `open` のまま残る。~~
  → **対応済み（2026-08-21・未デプロイ）**: 語彙を `pending`/`paid`/`expired`/`canceled` に
  統一し、`expiresAt` を実効化。同上のドキュメントを参照。
- **更新(renew)の請求額が上がる。** モジュール込みに統一したため、モジュールが設定された
  機器では更新時の月額・一括金額が従来より高くなる（新規申込と同額になる）。
  既存の顧客案内・料金表に更新価格を書いている場合は合わせて更新すること。
