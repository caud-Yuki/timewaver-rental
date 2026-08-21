# V1 緊急セキュリティ修正（本番運用前）

対象: `TWRENTAL-PLATFORM_vrs.1.1`
状態: **コード修正・検証済み / デプロイ済み（2026-08-21）・キー未ローテーション**

デプロイ実績:
- Firestore ルール: `firebase deploy --only firestore:rules` 実行済み（2026-08-21）
- Cloud Functions: `rm -rf lib/ && npx tsc`（exit 0）後に `firebase deploy --only functions` 実行済み。
  全関数が「No changes detected」＝既にこのコードが本番に載っていた。
  本番エンドポイントへの無認証 POST で `sendAdHocEmail` / `resendEarlyBookingFollowUp` とも
  `UNAUTHENTICATED: Authentication required.` を返すことを確認（オープンリレー解消を実機検証）。
- App Hosting (Next.js): 修正コミット `8ff1c53` は `origin/main` に push 済み（自動ビルド対象）。

2026-08-21 追記: セクション 3 の **Custom Claims 移行を完了**（管理者 4 名へ Claim 付与、
3 層すべてから Firestore role フォールバックを削除）。Firestore ルールは本番反映済み。
Cloud Functions / Next.js の Claim 専用版は**デプロイ待ち**（下記）。

残タスク:
- セクション 2 のキーローテーション（未実施）
- Cloud Functions のデプロイ（`functions/src/pricing.ts` を使う金額検証の実装が完了し、
  `tsc` は exit 0・テストも通過済み。保留解除 → デプロイ可。
  内容は [SECURITY-payment-amount-verification.md](./SECURITY-payment-amount-verification.md) 参照）
- Next.js の push（App Hosting 自動ビルド）
- ~~`/admin/settings` の表示確認（App Hosting サービスアカウント権限の検証）~~ → **完了（2026-08-21）**

### 2026-08-21 独立検証（別セッションによる実データ確認）

**Custom Claim 付与（セクション 3 ステップ 1-3）: 完了を確認**

Identity Toolkit `accounts:query` と Firestore `users` の突き合わせ結果:

| | 件数 |
|---|---|
| Auth 総ユーザー数 | 14 |
| Custom Claim `admin:true` 保持者 | 4 |
| Firestore `users.role == 'admin'` | 4 |
| Claim 未付与の管理者 | **0** |
| Claim 保持者だが `role != 'admin'` | **0** |

```
9zFJ9JcGjvQxdA3SCNCl4YbeS6c2  keiri@caud.jp             {admin:true, role:'admin'}
H1R4w7z28eNDOwZbmjUYnWo3q3G2  hakusyocho@caudesign.jp   {admin:true, role:'admin'}
UE2iItBomNhcM7kIc5xfLy83cNR2  yukiteraoka@caudesign.jp  {admin:true, role:'admin'}
jgqbvpkOqOZdv33T8aBfnKX6iOo2  ual.yuuki@gmail.com       {admin:true, role:'admin'}
```

両集合が完全一致するため、フォールバック削除によるロックアウトは発生しない。

**本番 Firestore ルール: Claim 専用版が反映済み**

`firebaserules.googleapis.com` の `releases/cloud.firestore` を直接取得して確認。
ruleset `bac561ab-7cc1-4081-87c5-68eac55f89e4` / updateTime `2026-08-21T06:55:50Z`（JST 15:55）。
`isAdmin()` は `request.auth.token.get('admin', false) == true` のみで、role 参照なし。

**App Hosting サービスアカウント権限: 要件充足**

`firebase-app-hosting-compute@studio-3681859885-cd9c1.iam.gserviceaccount.com` の保有ロール:

- `roles/firebase.sdkAdminServiceAgent` — `firebaseauth.users.get`（ユーザー参照）、
  `datastore.entities.get` / `.list`（Firestore 読み取り）を含む。
  当初想定の `roles/firebaseauth.viewer` は不要（本ロールが上位互換）。
- `roles/secretmanager.admin` — シークレット操作
- `roles/firebaseapphosting.computeRunner` / `roles/developerconnect.readTokenAccessor`

**`/admin/settings` 実画面: 正常表示**

`https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app/admin/settings`
を管理者セッションで開き、以下を確認:

- ヘッダに `権限: admin` が表示（サーバ側の管理者判定が成功）
- Stripe TEST/LIVE 各 3 キー・GEMINI API KEY がいずれも「設定済み」
  （Secret Manager 読み取りが成功＝SA 権限が実際に機能している）
- Google Chat Webhook 2 件が「URL設定済」
- コンソールエラー 0 件

---

## 1. Stripe / Gemini 秘密鍵の公開（最優先）

### 何が起きていたか

`src/lib/secret-actions.ts` は `'use server'` ファイルで、
`getStripeSecrets` / `getStripeWebhookSecret` / `getGeminiSecret` を含む
10 個の Server Action をエクスポートしていた。認可チェックは 1 件も無かった。

Next.js は `'use server'` ファイルの **エクスポート関数すべてを公開 HTTP エンドポイント**
として登録する。どの画面が import しているかは無関係で、未認証の訪問者が直接呼べる。

さらに悪いことに、`src/lib/stripe.ts` は **`'use client'`** ファイルでありながら
`getStripeSecrets(mode)` を呼んでいた。この関数は publishableKey と **secretKey の両方**
を返すため、攻撃されるまでもなく、**通常の決済ページ表示だけで Stripe 本番 Secret Key が
ブラウザへ送信されていた**（`getStripeConfig` は publishableKey しか使っていない）。

### 修正内容

| ファイル | 変更 |
|---|---|
| `src/lib/secret-server.ts` (新規) | 生の資格情報を返す 3 関数を移設。**`'use server'` を持たない**＝エンドポイント化されない |
| `src/lib/secret-actions.ts` | 残った管理者向け 7 アクションすべてに `requireAdmin(idToken)` を追加 |
| `src/lib/secret-actions.ts` | `getStripePublishableKey()` を新設（publishable key のみ返す。公開鍵なので未認証で可） |
| `src/lib/stripe.ts` | `getStripeSecrets` → `getStripePublishableKey` に変更。**Secret Key はブラウザへ行かない** |
| `src/lib/admin-auth.ts` (新規) | ID トークン検証 + 管理者判定 |
| `src/lib/firebase-admin.ts` (新規) | Next.js 側の Admin SDK 初期化 |
| `src/lib/admin-id-token.ts` (新規) | クライアントから ID トークンを取得するヘルパー |
| AI フロー 3 本 | `getGeminiSecret` の import 先を `secret-server` へ変更 |
| 管理画面 5 ファイル | 各アクション呼び出しに ID トークンを渡すよう修正 |
| `package.json` | `firebase-admin` を明示的な依存に追加（従来は genkit 経由の推移的依存） |

### 現在の Server Action の状態

```
saveSecrets                    GATED (requireAdmin)
getStripePublishableKey        公開（設計どおり・publishable key のみ）
getSecretsStatus               GATED (requireAdmin)
saveGoogleChatDestinationUrl   GATED (requireAdmin)
deleteGoogleChatDestinationUrl GATED (requireAdmin)
testGoogleChatDestination      GATED (requireAdmin)
testGoogleChatTemplatePreview  GATED (requireAdmin)
testStripeConnection           GATED (requireAdmin)
```

---

## 2. キーのローテーション手順（**実施はユーザー側**）

漏洩済み前提で全キーを再発行する。**コード修正のデプロイより先に着手してよい**
（アプリは Secret Manager から読むため、Secret Manager を更新すれば追従する）。

### 2-1. Stripe

1. Stripe Dashboard → 開発者 → APIキー
2. **本番(Live)**・**テスト(Test)** 両方で Secret Key を「ロールする」
   - 旧キーの失効猶予は **即時** を推奨（既に公開済みのため）
3. Dashboard → 開発者 → Webhook → 各エンドポイントの「署名シークレット」を再生成
4. 管理画面 `/admin/settings` から新しい値を保存
   （＝ Secret Manager の `stripe-live-secret-key` 等が新バージョンになる）
5. `/admin/settings` の「接続テスト」で疎通確認

> Publishable Key (`pk_live_...`) は公開前提の鍵なのでローテーション不要。

### 2-2. Gemini

1. Google AI Studio / Cloud Console → APIキー
2. 既存キーを **削除**し、新規発行
3. 新キーに **API 制限**（Generative Language API のみ）を設定
4. `/admin/settings` から保存

### 2-3. Gmail OAuth / Chatwork / Google Chat

`secret-actions.ts` 経由で読めたのは Stripe と Gemini のみだが、
`saveSecrets` が無認可だったため **第三者が上書きできる状態**でもあった。
値が意図しないものに書き換えられていないか、`/admin/settings` で確認すること。

### 2-4. 事後確認

- Stripe Dashboard → 開発者 → **ログ** で、身に覚えのない API 呼び出しが無いか
- Stripe → 支払い / 返金履歴に不審な操作が無いか
- Google Cloud → Gemini API の使用量が想定を超えていないか

---

## 3. 誰でも管理者に昇格できる問題

### 何が起きていたか

`firestore.rules` の users ルールが

```
allow write: if request.auth != null && request.auth.uid == userId;
```

だけで、書き込み可能フィールドの制限も role の不変条件も無かった。
任意のログインユーザーが自分のドキュメントに `role:'admin'` を書くだけで管理者になれた。
管理者判定は 3 層すべてがこの同一フィールドを参照しているため、影響は全体に及んだ。

### 修正内容

`allow write` を `create` / `update` / `delete` に分割し、role を不変化した。

```
allow create: ... && request.resource.data.get('role', 'user') == 'user';
allow update: ... && request.resource.data.get('role','user') == resource.data.get('role','user');
allow delete: if false;
```

あわせて `isAdmin()` に **Custom Claim 経路**を追加した（当初は Firestore の role をフォールバックに残した）。
その後 2026-08-21 に移行が完了し、フォールバックを削除して現在は次の形になっている。

```
function isAdmin() {
  return request.auth != null && request.auth.token.get('admin', false) == true;
}
```

Claim は Admin SDK からしか書けないため、Firestore 側が何らかの理由で書き換えられても
昇格には繋がらない。`get()` による users ドキュメント読み取りも不要になった。

### Custom Claims への移行（2026-08-21 完了）

管理者判定の参照箇所は **3 層**。全層を Custom Claim のみに切り替えた。

| 層 | ファイル | 移行前 | 現在 |
|---|---|---|---|
| Firestore ルール | `firestore.rules` の `isAdmin()` | Claim 優先 + role フォールバック | **Claim のみ**（本番反映済み） |
| Cloud Functions | `functions/src/index.ts:requireAdmin` / `functions/src/mail/lib/auth.ts:requireAdmin` | Firestore role のみ | **Claim のみ**（コード完了・デプロイ待ち） |
| Next.js | `src/lib/admin-auth.ts:requireAdmin` | Claim 優先 + role フォールバック | **Claim のみ**（コード完了・push 待ち） |

#### 実施記録

**1. Claim 付与（完了）**

既存管理者 4 名に `{"admin":true,"role":"admin"}` を付与し、同時にリフレッシュトークンを失効させた
（＝`setUserRole` と同じ副作用）。

```
9zFJ9JcGjvQxdA3SCNCl4YbeS6c2  keiri@caud.jp
H1R4w7z28eNDOwZbmjUYnWo3q3G2  hakusyocho@caudesign.jp
UE2iItBomNhcM7kIc5xfLy83cNR2  yukiteraoka@caudesign.jp
jgqbvpkOqOZdv33T8aBfnKX6iOo2  ual.yuuki@gmail.com
```

付与前は 4 名とも Claim 無し（`customAttributes` が空）で、実質フォールバック経路だけで
動いていた。`setUserRole` は管理者しか呼べず当時 Claim 保持者が 0 名だったため、初回付与は
Admin SDK 相当の帯域外経路（Identity Toolkit `accounts:update`）で行った。
同じ手順を `scripts/set-admin-claim.mjs` としてリポジトリに残してある。

**2. 再ログイン（強制済み）**

`validSince` を更新したため既存 ID トークンは失効済み。各管理者は次回サインイン時に
Claim 入りのトークンを受け取る。Next.js 側は `verifyIdToken(idToken, true)`（checkRevoked）
なので、失効したトークンでの管理操作はその場で拒否される。

**3. 確認（完了）**

```
$ node scripts/set-admin-claim.mjs --list
Claim を持つ管理者: 4 名
```

**4. フォールバック削除**

- `firestore.rules` — `hasAdminClaim()` を `isAdmin()` に統合し、`get(users/{uid}).role` 参照を削除。
  **デプロイ済み**（ruleset `bac561ab-7cc1-4081-87c5-68eac55f89e4`。本番の ruleset を
  取得してローカルの `firestore.rules` と diff し、一致することを確認）。
- `functions/src/index.ts` / `functions/src/mail/lib/auth.ts` — `request.auth.token` の
  `admin` / `role` claim だけを見る実装に変更。Firestore 読み取りが 1 回減る。**デプロイ待ち**。
- `src/lib/admin-auth.ts` — Firestore フォールバックを削除（`adminFirestore` の import も不要になった）。
  **push 待ち**（App Hosting 自動ビルド）。

**5. ルールテスト**

`npm run test:rules` → **29/29 passed**。フォールバック撤去を検出する負のテストを 2 件追加した:

- `users.role='admin'` だが Claim を持たないコンテキストが管理者専用コレクションを読めない
- 同コンテキストが管理者操作（waitlist 削除）をできない

役目を終えた「Firestore の role:admin フォールバックは移行期間中も有効」テストは、
「Claim を持つ管理者は管理者専用コレクションを読める（管理画面フロー維持）」に置換した。
`asAdmin()` コンテキストは本番と同じ `{admin:true, role:'admin'}` claim を持つように変更してある。

> **現在の中間状態**: ルールだけ先に出したため、
> 「ルール＝Claim のみ / Functions・Next.js＝Claim 優先 + role フォールバック（旧デプロイ）」。
> 4 名とも Claim と Firestore role の両方を持つのでどの層でも管理者として通る。
> 残り 2 層をデプロイすれば完全に Claim 一本になる。

#### ロックアウトからの復旧

認可が Claim のみになったため、**Claim を持つ管理者が 0 人になると `setUserRole` を呼べる者が
いなくなり、自力では復旧できない**。その場合はプロジェクト所有者権限で帯域外に付与する:

```bash
gcloud auth login                                  # プロジェクト所有者/編集者で
node scripts/set-admin-claim.mjs <uid> admin       # 付与（Firestore role も同時に更新）
node scripts/set-admin-claim.mjs <uid> user        # 剥奪
node scripts/set-admin-claim.mjs --list            # Claim 保持者の一覧
```

通常の昇格・降格は管理者が `setUserRole` を呼ぶこと。このスクリプトはあくまで復旧用。

> 注: `setUserRole` を呼ぶ管理画面 UI は未実装のまま。UI 化は別タスク。

---

## 4. sendAdHocEmail の無認証（オープンメールリレー）

### 何が起きていたか

`functions/src/index.ts` の `sendAdHocEmail` は `onCall` だが `request.auth` を一切参照せず、
`to` / `subject` / `body` の存在確認だけで送信していた。`body` は `isRichHtml` 判定で
生 HTML がそのまま通る。第三者が事業者の正規メールアカウント（Gmail OAuth / SMTP）から
任意の宛先へ、TimeWaverHub の正式なヘッダー・フッター付き HTML メールを送信できた。

`resendEarlyBookingFollowUp` も同様に無認証だった。

### 修正内容

- 両関数の先頭に `await requireAdmin(request)` を追加
- `sendAdHocEmail` に宛先バリデーション `assertValidRecipients()` を追加
  - 平文アドレスのみ許可（`"名前 <addr>"` 形式は拒否＝宛先の密輸・なりすまし防止）
  - 上限 20 宛先（管理者アカウント奪取時の被害範囲を限定）
  - ログを「宛先そのもの」から「宛先件数 + 実行者 UID」に変更

### `onCall` 全関数の認可状態（修正後）

```
setUserRole                  requireAdmin      createBillingPortalSession  request.auth
syncDeviceToStripe           requireAdmin      refundPayment               requireAdmin
createStripePayment          request.auth      getPaymentHistory           request.auth
createStripeSubscription     request.auth      sendAdHocEmail              requireAdmin  ← 修正
getPaymentData               requireAdmin      resendEarlyBookingFollowUp  requireAdmin  ← 修正
getSubscriptionsList         requireAdmin      sendEarlyBookingLaunchNotice requireAdmin
syncPaymentData              requireAdmin
stopRecurringPayment         requireAdmin
```

無認可の `onCall` は残っていない。

---

## 5. 検証

### 実施済み

| 検証 | 結果 |
|---|---|
| Firestore ルールテスト (`npm run test:rules`) | **29/29 passed**（Claim 移行後。移行前は 27/27） |
| ネガティブコントロール（旧ルールに戻して実行） | 昇格テスト 5 件が**意図どおり FAIL** → テストが実際に穴を検出することを確認 |
| `functions` の `tsc` | **exit 0**（デプロイ可） |
| Next.js `npm run build` | **exit 0**（全ルート生成成功） |
| Next.js `tsc --noEmit` | 既存エラー 93 件。**今回変更したファイルには 0 件**（`next.config.mjs` が `ignoreBuildErrors: true` のため元から通っていない） |

### ルールテストの実行方法

```
npm run test:rules
```

Firestore エミュレータ上で `firestore.rules` をそのまま評価する。本番には接続しない。
`tests/firestore-rules.test.mjs` に以下を追加済み:

- 一般ユーザーが自分の role を admin に書き換えられない
- `setDoc(merge)` でも昇格できない
- 新規登録時に `role:'admin'` で作成できない / `role:'user'` なら作成できる
- 本人のプロフィール更新・stripeCustomerId 更新は通る（既存フロー維持）
- 他人のプロフィールを更新・昇格できない
- 管理者自身も自分の role を書き換えられない
- Custom Claim `admin:true` は users ドキュメント無しでも管理者扱いになる
- Claim を持つ管理者は管理者専用コレクションを読める（管理画面フロー維持）
- **Claim 無しで `users.role='admin'` だけでは管理者扱いにならない**（フォールバック撤去の回帰テスト × 2）

### 未カバー（今後の推奨）

1. **Server Action の認可テスト** — Next.js の Server Action は HTTP で直接叩けるため、
   `getSecretsStatus` 等に無効トークンで POST して 拒否されることを確認する
   統合テストを追加したい。現状は手動確認のみ。
2. **Cloud Functions の認可テスト** — `firebase-functions-test`（既に devDependency にある）
   で `requireAdmin` を通らない呼び出しが弾かれることを検証する。
3. 別タスクの `applications` / `subscriptions` / `paymentLinks` / `waitlist` の権限ホールも、
   同じ `tests/firestore-rules.test.mjs` に追記していくのが低コスト。

### 手動での確認手順（デプロイ後）

0. **管理者は再ログインする** — 2026-08-21 の Claim 付与でリフレッシュトークンを失効させたため、
   既存セッションは無効。再ログインしないと管理画面が `PERMISSION_DENIED` になる（想定動作）
1. **一般ユーザーで昇格を試す** — 一般アカウントでログインし、ブラウザのコンソールから
   自分の users ドキュメントに `role:'admin'` を書き込む → `PERMISSION_DENIED` になること
2. **決済ページ** — `/payment/[id]` を開き、DevTools の Network で Server Action の
   レスポンスに `sk_live_` / `sk_test_` が**含まれない**こと（publishable key のみ）
3. **管理画面** — `/admin/settings` でシークレット状態表示・保存・Stripe 接続テストが
   従来どおり動くこと
4. **メール送信** — `/admin/applications` の個別メール送信が動くこと
5. **新規登録** — 新規ユーザー登録とマイページのプロフィール編集が通ること

---

## 6. デプロイ手順

**順序が重要。** Firestore ルールと Functions を先に、App Hosting を後に。

### 6-1. Firestore ルール（App Hosting では自動デプロイされない）

```
firebase deploy --only firestore:rules
```

### 6-2. Cloud Functions

```
cd functions && rm -rf lib/ && npx tsc && cd .. && firebase deploy --only functions
```

`tsc` でエラーが出たらデプロイしないこと（確認済み: 現状 exit 0）。

### 6-3. Next.js (App Hosting)

App Hosting はリポジトリへの push で自動ビルド・デプロイされる。
`package.json` に `firebase-admin` を追加したため、ビルド時に依存が解決される。

> **App Hosting のサービスアカウントに権限が必要**
> `src/lib/firebase-admin.ts` は ADC で Admin SDK を初期化する。
> App Hosting のバックエンドサービスアカウントに以下が必要:
> - `roles/firebaseauth.viewer`（ID トークン検証・ユーザー参照）
> - Firestore 読み取り（既存の Secret Manager 権限と同様）
>
> 付与されていないと管理画面のシークレット操作が全て失敗する。
> デプロイ後に `/admin/settings` が正常表示されるかで確認できる。

### 6-4. デプロイ後

1. 上記「手動での確認手順」を実施
2. キーのローテーション（セクション 2）を完了させる
3. 管理者への Custom Claim 付与（セクション 3）に着手
