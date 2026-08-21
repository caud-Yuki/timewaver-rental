# 契約更新フロー（/apply/renew）

更新申込を新規申込（`/apply/new`）と同じ水準にそろえた記録。2026-08-21。

対象: `src/app/apply/renew/page.tsx` / `src/lib/renewal.ts` / `functions/src/pricing.ts` /
`functions/src/index.ts`（`onApplicationCreate`）/ `firestore.rules` / `src/app/admin/applications/page.tsx`

---

## 1. 何がズレていたか

更新申込は新規申込より後から作られた画面で、申込ドキュメントを作るところだけを真似ており、
新規申込側に後から入った検証・入力項目が反映されていなかった。

| 論点 | 以前の更新申込 | 現在 |
|---|---|---|
| モジュール加算 | 機器ベース価格のみ＝**過小請求** | 新規と同じ `calculateTotalMonthly` / `calculateTotalFull`（先行して修正済み） |
| 本人確認（対象契約） | `deviceId` を URL から受け取るだけで所有者確認なし | 自分の有効な契約を引き当てられた場合のみ受付 |
| 更新可能期間 | 画面側の判定のみ（URL 直叩きで素通り） | 申込ページでも同じ判定を再チェック |
| セッション | 無制限に開きっぱなし | 無操作 `applicationSessionMinutes` でセッション終了 |
| 重複ガード | 無し（連打・再訪で二重申請が作れた） | 進行中の更新申込があればブロック |
| 法人情報 | 記録されない（更新すると法人区分が落ちる） | 申込タイプ＋法人情報を新規と同項目で記録 |
| クーポン | 入力欄が無く、サーバーも一律で割引 0 | 新規と同条件で利用可（新規限定クーポンを除く） |

---

## 2. 更新の受付条件

`src/lib/renewal.ts` に集約し、マイデバイス（更新ボタンの出し分け）と更新申込ページの両方から使う。
**片方だけ変えないこと。**

- `isRenewalEligible(endAt, settings)` — 契約終了日の **1ヶ月前**（`RENEWAL_WINDOW_MONTHS_BEFORE_END`）から受付。
  `settings.mode === 'test'` のときは期間を無視して常に受付。
- `RENEWAL_IN_PROGRESS_STATUSES` — 重複ガードで「進行中」とみなすステータス。

更新申込ページは表示前に次を確認し、満たさない場合は理由別の案内を出して申込フォーム自体を描画しない。

1. 対象機器が存在する
2. **自分の**有効な契約（`subscriptions`: `userId` + `deviceId` + `status: 'active'`）が引き当てられる
3. 更新可能期間内である

延長の対象は、引き当てた契約のうち **終了日が最も遅いもの**。
更新が成立すると旧契約と新契約がどちらも `active` で残るため、URL の `subscriptionId` を
そのまま採用すると既に更新済みの古い契約を対象にして二重更新になりうる。
URL のパラメータは互換のため受け取るだけで、対象の決定には使わない。
次期契約の開始日（`previousEndAt`）も、この確認済み契約の `endAt` から取る。
同じ理由で、マイデバイスの契約終了日・更新ボタンの判定も最新の契約を見るようにした。

---

## 3. 重複ガード（新規申込との違いに注意）

新規申込は「同一機種で進行中の申請」を `completed` / `shipped` / `in_use` も含めてブロックする
（利用中に同機種をもう一台申し込ませないため）。

更新申込は **`completed` 以降を含めない**。更新は契約期間ごとに繰り返すものなので、
前回の更新申込が完了済みで残っているだけで次回の更新が永久にブロックされてしまう。
完了直後の二重更新は、更新可能期間（更新が成立すると `endAt` が先に延びる）の判定で防ぐ。

判定対象は `isRenewal === true` かつ同一 `deviceId` の申込のみ。
新規申込時に作られた元の申込（`isRenewal` なし）はブロック要因にならない。

---

## 4. クーポン

更新申込にもクーポン入力欄を追加し、サーバー側の可否も `RENEWAL_ALLOWS_COUPON = true`
（`functions/src/pricing.ts`）にそろえた。**画面とフラグは必ず同時に変えること** —
片方だけだと正規の申込が金額不一致で拒否される。

サーバー側 `resolveCouponDiscount` の判定（クーポン文書を読み直すので改ざんは効かない）:

| 条件 | `couponRejectedReason` |
|---|---|
| クーポンが存在しない | `coupon_not_found` |
| `isActive === false` / `status !== 'active'` | `coupon_inactive` |
| 利用上限に達している（初回算出時のみ判定） | `coupon_usage_limit_reached` |
| 新規限定クーポン × 更新申込 | `coupon_new_customer_only` |
| 新規限定クーポン × 過去に申込がある | `coupon_new_customer_only` |
| 申込時点で期限切れ | `coupon_expired` |

### 利用回数の加算（今回あわせて修正）

以前はブラウザ（`/apply/new`）が `coupons` を直接 update していたが、`firestore.rules` 上
`coupons` の write は管理者のみのため **常に permission-denied** になり、
`currentUsageCount` が増えず利用上限（`maxTotalUsers`）が実質機能していなかった。

現在は `onApplicationCreate` が Admin SDK のトランザクションで加算し、申込側に
`couponUsageCountedAt` を刻む（トリガー再実行時の二重加算防止）。
この印はクライアントから持ち込めない（`firestore.rules` で create/update ともに禁止）。
持ち込めると「枠を消費せずにクーポンを使い回す」ことができてしまうため。

利用上限のチェックは **申込作成時の初回算出のみ**行う。決済時などの再計算では、
自分自身が消費した 1 枠で上限に達し、正規の申込を弾いてしまうため判定しない
（サーバー書き込み専用の `pricing` スナップショットの有無で初回かどうかを判断する）。

> 同時申込が重なった場合、上限を 1〜2 件超えて発行される可能性は残る（読み取りは
> トランザクション外）。運用規模に対して許容範囲として扱っている。

---

## 5. 法人情報

新規申込と同じ項目（法人番号 / インボイス登録番号 / 法人名 / 会社住所・電話 / 担当者名・メール）を
更新申込でも入力・記録する。会員情報から初期値を引き継ぎ、送信時に `users` 側にも反映する
（`applicantType` / `companyName` / `invoiceNumber`）。

あわせて管理画面の申請詳細（`/admin/applications`）に、申込タイプ・契約更新・クーポンのバッジと
法人情報ブロックを追加した。**新規申込も含めて**これまで画面に出ていなかったため、
記録されていても運用側から見えない状態だった。

---

## 6. 検証

| 検証 | 結果 |
|---|---|
| `npm run test:renewal`（新規） | **9/9 passed**（受付期間・重複ガード対象ステータス） |
| `npm run test:pricing` | **22/22 passed**（更新クーポン・停止中・利用上限の 5 件を追加） |
| `npm run test:rules` | **62/62 passed**（`couponUsageCountedAt` の 2 件を追加） |
| `functions` の `tsc` | **exit 0** |
| Next.js `tsc --noEmit` | 変更ファイルに新規エラー 0 件 |

ローカルの dev サーバーでは、未ログインで `/apply/renew?deviceId=...` を開くと
ログイン導線（`?redirect=` 付き）が出ることまで確認済み。

未実施: ログイン済みアカウントでの申込〜決済の通し確認（別タスク
「V2 中核フロー検証（申込〜決済）」の範囲）。`tests/renewal.test.mjs` は
`node --experimental-strip-types` で TS をそのまま実行している（ビルド不要）。

---

## 7. 運用上の注意

- **更新でクーポンが使えるようになった。** 既存の新規限定でないクーポンは更新申込でも
  適用される。更新に使わせたくないクーポンは `newCustomerOnly` を立てること。
- **クーポンの利用上限が実際に効き始める。** これまで `currentUsageCount` は 0 のままだったため、
  上限付きクーポンが無制限に使えていた。既存クーポンの上限設定を確認すること。
- **更新申込の受付が厳しくなる。** 契約が引き当てられない・期間外の URL 直叩きは通らない。
  テスト時は `settings.mode = 'test'` で期間判定を無効化できる（所有者確認は無効化されない）。

## 8. 関連

- `docs/SECURITY-payment-amount-verification.md` — 金額のサーバー再計算と改ざん対策
- `src/lib/renewal.ts` — 更新の受付条件（画面間で共有）
