# 銀行振込フロー（案内 → 入金確認 → 契約作成）

対象: `TWRENTAL-PLATFORM_vrs.1.1`
状態: **実装・自動テスト済み / 未デプロイ**（2026-08-21 時点。デプロイは別途）
関連: [workflow.md](./workflow.md) §5b, [SECURITY-payment-amount-verification.md](./SECURITY-payment-amount-verification.md)

カードを使わない支払い経路。**一括払いのみ**対応（月々払いは継続課金が必要なのでカード決済のみ）。
決済ページ `/payment/{paymentLinkId}` を通らないため、カード決済ならブラウザ側が行う
「契約レコードの作成」「デバイスの貸出中化」をサーバー (`onApplicationUpdate`) が肩代わりする。

---

## 1. 全体像

```
consent_form_approved
   │  Admin:「銀行振込案内」            ← /admin/applications（一括払いの申請にのみ表示）
   ▼
awaiting_bank_transfer                  application.bankTransfer に 金額 / 期限 / 案内送付日時
   │                                    メール: 利用者へ振込案内 + 管理者へ入金確認待ち通知
   │  Admin:「入金確認」                 ← 通帳で入金を確認してから。確認ダイアログあり
   ▼
completed                               subscriptions を1件作成（Stripe ID なし）
                                        devices: status=active / currentUserId / contractStartAt
                                        メール: 決済完了（利用者）+ 発送準備依頼（スタッフ）
   │
   ▼  以降はカード決済と同じ（shipped → in_use → …）
```

利用者側は マイページ → 申請履歴 の **振込先を表示** で、案内メールと同じ内容
（口座・金額・期限・申請番号）をいつでも確認できる。

---

## 2. 事前設定（これが無いと動かない）

| 設定 | 場所 | 未設定だとどうなるか |
|---|---|---|
| 振込先口座・振込期限（営業日） | `/admin/settings` → 銀行振込 設定 | 案内メールの口座欄が空で届く。期限は既定 7 営業日 |
| 銀行振込案内時 のテンプレート割当と有効化 | `/admin/email-triggers` | **メールが 1 通も飛ばない**（`emailTriggers` に doc が無いと `sendTriggeredEmail` は送信前に中断する） |

テンプレート実体は `functions/src/email-defaults.ts` の
`sys_bank_transfer_instructions`（利用者向け）と `sys_bank_transfer_pending_admin`（管理者向け）。
管理UIの行定義（`src/app/admin/email-triggers/page.tsx` の `EVENT_POINTS`）と id が一致していないと
選択肢に出てこない／送信時に黙って落ちるため、id の対応は自動テストで固定している。

---

## 3. 実装マップ

| 場所 | 役割 |
|---|---|
| `src/app/admin/applications/page.tsx` `handleSendBankTransfer` | `status: awaiting_bank_transfer` + `paymentMethod: 'bank_transfer'` に更新するだけ。金額はクライアントから送らない |
| `src/app/admin/applications/page.tsx` `handleConfirmBankTransfer` | `status: completed` + `bankTransfer.confirmedBy` |
| `functions/src/index.ts` `onApplicationUpdate`（`awaiting_bank_transfer`） | 請求額をサーバー再計算し `bankTransfer.{amount,deadline,instructionsSentAt}` を刻む → 案内メール2通 |
| `functions/src/index.ts` `onApplicationUpdate`（`completed`） | 契約レコードが無ければ作成 → デバイスに契約日を刻む → `bankTransfer.confirmedAt` |
| `functions/src/index.ts` `getPaymentHistory` | Stripe の明細が無い契約は、契約レコードから「一括 / 決済完了」1行を組み立てて返す |
| `functions/src/triggers.ts` `buildTemplateData` | メール差し込み値（口座情報は `settings/global` から） |
| `src/app/mypage/applications/page.tsx` `BankTransferModal` | 利用者向けの振込先表示 |

金額は一貫して `resolveTrustedPricing`（申込時スナップショット or 再計算）由来で、
`application.payAmount` をそのまま請求に使う箇所は無い。詳細は
[SECURITY-payment-amount-verification.md](./SECURITY-payment-amount-verification.md)。

---

## 4. 今回入れた修正

1. **契約開始日がデバイスに刻まれていなかった** — カード決済は決済ページが
   `devices.contractStartAt` を書くが、振込ルートはそのページを通らないため、
   マイページ「契約開始日」が空欄のままだった。契約作成と同じ場所で刻むようにした
   （更新契約は開始日を据え置き `contractEndAt` を延長。カード決済と同じ扱い）。
2. **決済履歴が「決済明細はありません」になっていた** — 振込には PaymentIntent も Invoice も
   無く `getPaymentHistory` が空配列を返していた。契約レコードから 1 行を組み立てて返すようにし、
   併せて Stripe の初期化を「Stripe ID を持つ契約のときだけ」に変更した。
   マイページの一覧には 銀行振込 バッジを追加。
3. **管理者が請求額を確認できないまま「入金確認」を押せた** — 申請一覧に請求額・振込期限
   （期限超過は赤字）を表示し、入金確認に確認ダイアログを追加した。
4. **利用者が案内メールを見失うと振込先が分からなかった** — マイページに 振込先を表示 を追加。
5. **`linkPaymentHistory` が 404 の URL を指していた** — `/mypage/payment-history` は存在しない。
   実在する `/mypage/payments` に修正（メール差し込みと管理画面のメール作成の両方）。
6. **ステータス直接変更で一括払い限定を迂回できた** — 申請一覧のステータス選択から
   月々払いの申請を 銀行振込待ち にすると、継続課金の相手が居ない契約ができてしまう。
   ボタン経路と同じ条件で弾くようにした。

---

## 5. 検証

```bash
npm run test:bank-transfer
```

`tests/bank-transfer.test.mjs`。Firestore + Functions エミュレータ上で、
**管理画面が実際に行う書き込み（`applications` の status 更新）だけ**を行い、
残りは本番と同じトリガーに処理させる。本番プロジェクトには接続しない。

確認している内容（14 アサーション、2026-08-21 時点で全て PASS）:

- 案内送付で `bankTransfer.{amount,deadline,instructionsSentAt}` と `paymentMethod` が刻まれる
- 請求額はクライアントが送った `payAmount`（改ざん値 ¥1）ではなくサーバー再計算値（¥610,000）
- 振込期限は `settings.bankTransferDeadlineDays` の営業日計算どおり
- 入金確認前は契約レコードが存在しない
- 入金確認で契約が 1 件だけ作成され、金額・支払区分・`paymentMethod`・期間（発送バッファ起算の
  12ヶ月）・Stripe ID が null であることが揃う
- デバイスが `active` + `currentUserId` + `contractStartAt`（= 契約開始日）になる
- 入金確認をやり直しても契約が重複しない
- 管理UIが割り当てているテンプレート id が実在する（元の不具合の再発防止）
- 案内メール（利用者・管理者）に未解決の `{{差し込み}}` が残らず、口座情報・金額・期限・
  申請番号が本文に入る

メール送信自体はエミュレータでは行わない（`emailTriggers` を「割当済み・送信無効」で投入し、
テンプレート解決までを本番と同じ経路で走らせている）。実際の着信確認と、
`/admin/settings` の口座情報の内容確認は本番での手動確認が必要。

---

## 6. 既知の制限

- **振込期限を過ぎた申請の自動処理は無い。** 案内メールは「期限までに入金が無い場合は無効に
  なることがある」と伝えるが、失効させる仕組みは無く、申請一覧の期限超過表示を見て
  運用で対応する。自動化するなら `syncPaymentData` の契約更新リマインダーと同じ場所に足すのが近い。
- **返金は Stripe 前提**（`refundPayment`）。振込の返金は銀行側の操作で、システムには記録されない。
  管理画面の支払履歴で返金を押しても「返金に必要なIDが見つかりません」となる（決済IDが無いため）。
- **月々払いは非対応。** 一括払いの申請にのみ 銀行振込案内 ボタンが出る。
