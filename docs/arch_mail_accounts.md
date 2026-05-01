# 送信元メールアドレス管理 アーキテクチャ（Phase 26）

> **対象読者**: GoEnHub プロジェクトに新たに参加する人 / AI（Claude 等）が新機能を追加するときに参照するための **網羅的アーキテクチャ仕様**。
> **位置付け**: [spec_mail_system.md](./spec_mail_system.md) の B-17 を補強する詳細ドキュメント。仕様変更が発生したときは本ファイルを **必ず同時に更新** すること。
> **最終更新**: 2026-05-01（初版・Phase 26 デプロイ完了時点）

---

## 0. 概要

GoEnHub では、メール配信に使う **送信元アドレス** を以下の 2 種類のプロバイダで管理する：

| プロバイダ | 認証方式 | 主な用途 |
|---|---|---|
| `gmail_oauth` | Google OAuth 2.0 | Google ワークスペース / 個人 Gmail |
| `smtp` | host + port + user + password | Outlook / Yahoo / 自社 SMTP / メール HUB |

複数アドレスを共有運用でき、配信予約フォームではドロップダウンから既定アカウントが自動プリセレクトされる。SMTP は連続失敗 3 回で自動的に `unauthorized` 状態に降格する。

---

## 1. データアーキテクチャ

### 1.1 コレクション関係図

```
mail_accounts/{accountId}              ← UI で表示・選択するメインのドキュメント（共有・editor read / Cloud Function write）
  ├─ provider: 'gmail_oauth' | 'smtp'
  ├─ status: 'active' | 'pending_oauth' | 'unauthorized' | 'revoked'
  ├─ isDefault: boolean                 ← 配信予約フォームのプリセレクト
  └─ ...

  ├─ (provider='gmail_oauth' のとき)
  │     mail_gmail_tokens/{accountId}   ← Cloud Function のみ read/write（KMS 暗号化）
  │     ├─ encryptedAccessToken
  │     ├─ encryptedRefreshToken
  │     └─ ...
  │
  └─ (provider='smtp' のとき)
        mail_smtp_credentials/{accountId} ← Cloud Function のみ read/write（KMS 暗号化）
        ├─ host / port / secure / username
        ├─ encryptedPassword
        └─ ...

mail_schedules/{scheduleId}             ← 配信予約は fromAccountId で紐付け
  ├─ fromAccountId: string              ← mail_accounts 参照
  ├─ fromAddress: string                ← email スナップショット（監査用）
  └─ ...
```

### 1.2 Firestore Security Rules

```firestore-rules
match /mail_accounts/{accountId} {
  allow read: if hasAnyRole(['owner', 'editor']);
  allow write: if false; // Cloud Function のみ
}

match /mail_gmail_tokens/{accountId} {
  allow read, write: if false; // Cloud Function のみ
}

match /mail_smtp_credentials/{accountId} {
  allow read, write: if false; // Cloud Function のみ
}
```

> **注意**: 旧スキーマでは `mail_gmail_tokens/{uid}` で「本人の uid なら read 可」だったが、accountId キー化に伴い完全 server-only に変更。状態確認は `mail_accounts.status` 経由で行う。

### 1.3 共通型定義

`shared/src/types/mail.ts`：

```ts
export type MailAccountProvider = 'gmail_oauth' | 'smtp';
export type MailAccountStatus =
  | 'active'         // 利用可能
  | 'pending_oauth'  // Gmail 認証フロー中
  | 'unauthorized'   // 認証失敗 / SMTP 連続失敗
  | 'revoked';       // 解除済み

export interface MailAccount {
  displayName: string;
  email: string;
  provider: MailAccountProvider;
  status: MailAccountStatus;
  isDefault: boolean;
  consecutiveFailures?: number;
  lastError?: string | null;
  createdBy: string;
  createdAt: IsoOrTimestamp;
  updatedAt: IsoOrTimestamp;
}

export interface MailSmtpCredential {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  encryptedPassword: string;
  kmsKeyVersion: string;
  fromName?: string;
  createdAt: IsoOrTimestamp;
  updatedAt: IsoOrTimestamp;
}
```

`MailSchedule` には `fromAccountId: string`（必須）と `fromAddress: string`（メール表示・監査用）を併存させる。

---

## 2. サーバー（functions/）アーキテクチャ

### 2.1 ファイル構成

```
functions/src/mail/
├─ accounts.ts              ← Callable CRUD + テスト送信
├─ gmailOAuth.ts            ← Gmail OAuth 開始 / コールバック
├─ revokeGmail.ts           ← OAuth 解除
├─ migrateAccounts.ts       ← 旧 uid キー → accountId キー移行
├─ schedules.ts             ← scheduleMailSend / executeScheduledMails / createScheduleInternal
├─ sendIndividualTask.ts    ← Cloud Tasks 経由の個別送信ハンドラ
├─ gmailSend.ts             ← sendMail / sendTestMail / requestMailReview
└─ lib/
    ├─ gmail.ts             ← Gmail API ラッパー (getDecryptedTokens, sendViaGmail)
    ├─ smtp.ts              ← SMTP ラッパー (verify / send / save credential)
    ├─ sendDispatcher.ts    ← provider 自動振り分け (sendViaAccount)
    └─ kms.ts               ← Cloud KMS 暗号化共通ヘルパ
```

### 2.2 中核：sendDispatcher.ts

すべての送信は `sendViaAccount(accountId, mailInput)` を経由する。

```ts
export async function sendViaAccount(input: DispatchSendInput): Promise<DispatchSendResult> {
  // 1) mail_accounts/{accountId} を取得し status=active を確認
  // 2) provider に応じて gmail / smtp に振り分け
  //    - gmail_oauth: getDecryptedTokens(accountId) → sendViaGmail()
  //    - smtp:        getDecryptedSmtpCredential(accountId) → sendViaSmtp()
  // 3) 成功時: consecutiveFailures をリセット
  // 4) 失敗時: registerFailure() でカウンタ増加。
  //    - GmailAuthError/SmtpAuthError は即 unauthorized
  //    - smtp の連続 3 回失敗で unauthorized
}
```

このディスパッチャを通すことで、すべての送信パスが単一の場所で：
- アカウント active 状態のチェック
- プロバイダ別の認証情報復号
- 連続失敗カウンタ更新
- 自動的な `unauthorized` 降格 + `system_logs` 記録

を行う。

### 2.3 主要 Callable とその責務

| 関数 | パラメータ | 主な処理 | 権限 |
|---|---|---|---|
| `listMailAccounts` | (なし) | `mail_accounts` を `orderBy('createdAt', 'asc')` で全件返却。認証情報は含まない | editor+ |
| `createSmtpAccount` | displayName / email / host / port / secure / username / password / fromName? / setAsDefault? | **接続 verify → 通った場合のみ** KMS 暗号化保存 + `mail_accounts` 作成。失敗時は何も書き込まない | owner |
| `updateSmtpAccount` | accountId + 上記 + password? | password 省略時は既存復号値で再 verify。verify 通れば保存・status を active に戻す | owner |
| `deleteMailAccount` | accountId | 進行中予約があれば拒否。該当 credential / token doc を削除 → `mail_accounts` を削除 | owner |
| `setDefaultMailAccount` | accountId | 全件の `isDefault` を一括更新（指定 1 件のみ true）。active 以外は拒否 | owner |
| `testMailAccount` | accountId / toEmail | `sendViaAccount` 経由でテストメール 1 通送信 | owner |
| `gmailOAuthStart` | accountId? / displayName? | accountId 指定 = 再認証 / 未指定 = 新規（pending_oauth な placeholder doc を即作成） | owner |
| `gmailOAuthCallback` | code / state | token 交換 → KMS 暗号化 → `mail_gmail_tokens/{accountId}` 保存 → `mail_accounts.status='active'` 昇格 | n/a (HTTPS) |
| `revokeGmailAuth` | accountId | Google revoke エンドポイント呼び出し → token doc クリア → `mail_accounts.status='revoked'` | owner |
| `migrateGmailTokensToAccounts` | (なし) | 旧 `mail_gmail_tokens/{uid}` から `mail_accounts/{newId}` + `mail_gmail_tokens/{newId}` を生成。`mail_schedules.fromAccountId` を逆引き補完 | owner |
| `cleanupLegacyGmailTokens` | (なし) | `migratedTo` が付いた旧 uid キー doc を削除 | owner |
| `scheduleMailSend` | mailId / targetType / targetIds / fromAccountId / sendAt / ctaUrl? | `mail_accounts.status='active'` を確認し `mail_schedules` 作成。`fromAddress` には email スナップショットを保存 | editor+ |

### 2.4 OAuth state パラメータ設計

`gmailOAuthStart` → Google OAuth → `gmailOAuthCallback` 間の状態維持は `oauth_states/{state}` doc を使う：

```ts
{
  uid: string,         // 認証フロー開始者
  accountId: string,   // 対象アカウント
  mode: 'create' | 'reauth',
  expiresAt: Timestamp, // 10 分
  scope: 'gmail',
}
```

CSRF 防止 + accountId の安全な受け渡し。コールバック時に 1 回だけ消費 → 削除。

### 2.5 失敗時の状態遷移

```
[active]
   │
   ├─ Gmail 401 (refresh 失敗) ──→ [unauthorized]
   │
   ├─ SMTP 認証エラー (1 回) ──→ [active, consecutiveFailures++]
   │                              │
   │                              └─ 3 回目 ──→ [unauthorized]
   │
   └─ revokeGmailAuth/UI ──→ [revoked]

[pending_oauth] ─→ OAuth callback 成功 ─→ [active]
                ─→ 衝突検出 (同 email) ─→ doc 削除 + 409 エラー
```

---

## 3. フロントエンド（admin-web/）アーキテクチャ

### 3.1 ファイル構成

```
admin-web/src/
├─ hooks/
│   └─ useMailAccounts.ts                ← React Query hooks（CRUD + テスト送信）
└─ pages/mail/
    ├─ settings/
    │   ├─ MailSettingsPage.tsx          ← セクション統合
    │   ├─ MailAccountsSection.tsx       ← 一覧カード + 操作ボタン
    │   ├─ AddAccountDialog.tsx          ← Gmail/SMTP 切替 2 step ダイアログ
    │   └─ TestSendDialog.tsx            ← テスト送信
    └─ schedules/
        └─ ScheduleFormDialog.tsx        ← 送信元 <Select> ドロップダウン
```

### 3.2 React Query キー一覧

| Key | 取得元 | invalidate トリガ |
|---|---|---|
| `['mail_accounts']` | `useMailAccounts` → `listMailAccounts` Callable | create / update / delete / setDefault / revokeGmail mutations |

### 3.3 重要な UI 制約

- **追加ボタン**：owner のみ表示
- **既定にする**：active かつ非既定のアカウントにのみ表示
- **再認証 / 解除**：Gmail プロバイダにのみ表示
- **テスト送信**：active 状態のアカウントのみ有効
- **削除**：進行中予約があれば server 側で 400 拒否（UI 側で再フェッチして反映）

---

## 4. ユーザー操作フロー

### 4.1 Gmail アカウントを新規追加

```
1. メール設定 → 「+ アカウントを追加」
2. ダイアログ：「Gmail（推奨）」を選択
3. 表示名を任意入力（未入力なら認証完了時の email を自動採用）
4. 「Google で認証する」押下
   → gmailOAuthStart Callable
     ├─ pending_oauth な mail_accounts/{newId} を即作成
     └─ Google OAuth URL を返す
5. ポップアップで Google 認証画面が開く
6. ユーザーが Google アカウント選択 + スコープ承認
7. Google → gmailOAuthCallback HTTPS → token 取得 + KMS 暗号化保存
   → mail_accounts.status を 'pending_oauth' から 'active' に昇格
   → 既定アカウント不在なら isDefault=true に昇格
8. ポップアップが「認証完了」ページを表示し 3 秒後に自動 close
9. 元タブで設定画面を更新（手動 or 自動再フェッチ）
```

**衝突時**：同 email の active アカウントが既存 → placeholder を削除して 409 エラー表示。

### 4.2 SMTP アカウントを新規追加

```
1. メール設定 → 「+ アカウントを追加」
2. ダイアログ：「SMTP（その他のメール）」を選択
3. 入力：表示名 / 送信元メール / FROM 表示名（任意）/ host / port / SSL チェック / username / password
4. 「検証して保存」押下
   → createSmtpAccount Callable
     ├─ verifySmtpCredential() で nodemailer.verify を実行
     ├─ 失敗: 400 エラー（SMTP 接続検証に失敗しました: ...）／何も書き込まない
     └─ 成功: KMS 暗号化保存 + mail_accounts 作成
5. リストに追加され status='active' で表示
```

### 4.3 配信予約での送信元選択

```
1. 配信予約 → 「新規配信予約」
2. メール選択
3. 送信元アドレス：ドロップダウンで自動的に既定アカウントが選択済み
4. 必要なら別アカウントに変更（active のみ表示）
5. 送信先・日時を指定 → 「予約する」
   → scheduleMailSend Callable
     ├─ fromAccountId が active か検証
     └─ mail_schedules doc 作成（fromAddress = email スナップショット）
```

### 4.4 テスト送信

```
1. メール設定 → アカウントカードの「テスト送信」
2. ダイアログ：送信先（初期値 = Firebase Auth email、編集可）
3. 「テスト送信」押下
   → testMailAccount Callable
     └─ sendViaAccount() でメール送信（Gmail / SMTP プロバイダ自動判定）
4. 成功トースト「テストメールを送信しました（gmail_oauth | smtp）」
```

### 4.5 既定切替

```
1. メール設定 → 非既定アカウントの「既定にする」
2. setDefaultMailAccount Callable
   └─ バッチ更新：全件 isDefault=false → 指定 1 件 isDefault=true
3. UI で ★既定 バッジが移動
```

### 4.6 アカウント削除

```
1. メール設定 → アカウントカードの「削除」
2. 確認ダイアログ
3. deleteMailAccount Callable
   ├─ mail_schedules で進行中予約をチェック → あれば拒否
   ├─ provider に応じて mail_gmail_tokens/{id} or mail_smtp_credentials/{id} を delete
   └─ mail_accounts/{id} を delete
4. 既定アカウントを削除した場合、最古の active を新既定に自動昇格
```

---

## 5. 既存 Callable との互換性

### 5.1 即時送信系（gmailSend.ts）

`sendMail` / `sendTestMail` / `requestMailReview` の 3 Callable は payload に `fromAccountId?: string` を任意で受け取る。未指定時は `resolveAccountId()` が以下の優先度で解決する：

1. payload `fromAccountId`
2. `isDefault=true` かつ `status='active'` のアカウント
3. `status='active'` の最古アカウント（fallback）
4. 該当なし → `failed-precondition` エラー（UI から「アカウントを設定してください」と案内）

これにより、即時送信ボタンを押すたびにユーザーが選択する手間を省き、UI 操作の簡潔さを保つ。

### 5.2 キャンペーン dispatcher (campaigns/dispatch.ts)

`mail_send` カードは `fromAccountId?: string` と `fromAddress?: string` の両方を持つ：

- `fromAccountId` 優先
- 未設定時は `fromAddress` から `mail_accounts.email` を逆引き
- 両方なし or 逆引き失敗で `skipped`

旧データ（fromAddress 文字列のみ）でも動作するための後方互換性。

---

## 6. デプロイチェックリスト

### 6.1 新規環境（dev / staging / prod）への初回デプロイ

```
[ ] firestore.rules を最新化（mail_accounts / mail_smtp_credentials のルール）
[ ] firestore.indexes.json で複合インデックスを宣言
       - mail_accounts (status ASC, createdAt ASC)
       - mail_schedules (fromAccountId ASC, status ASC)
[ ] firebase deploy --only firestore:rules,firestore:indexes
[ ] functions ビルド & deploy
       - 新規 6 関数 (listMailAccounts, createSmtpAccount, updateSmtpAccount, deleteMailAccount, setDefaultMailAccount, testMailAccount)
       - 移行系 2 関数 (migrateGmailTokensToAccounts, cleanupLegacyGmailTokens)
[ ] gcloud run services add-iam-policy-binding {fn} --member=allUsers --role=roles/run.invoker
       ↑ Firebase Functions v2 で onCall を初回 deploy したとき、自動で付与されない場合あり
[ ] admin-web build & deploy (hosting)
[ ] 旧データがあれば owner が migrateGmailTokensToAccounts を手動実行
[ ] 検証完了後 cleanupLegacyGmailTokens を手動実行
```

### 6.2 IAM 付与の自動化（推奨）

CI で以下を自動実行するスクリプトを `scripts/ensure_invoker_iam.sh` に追加することを推奨：

```bash
#!/usr/bin/env bash
PROJECT="${1:-caud-goenhub-dev}"
FUNCTIONS=(
  listmailaccounts createsmtpaccount updatesmtpaccount
  deletemailaccount setdefaultmailaccount testmailaccount
  migrategmailtokenstoaccounts cleanuplegacygmailtokens
)
for fn in "${FUNCTIONS[@]}"; do
  gcloud run services add-iam-policy-binding "$fn" \
    --region=asia-northeast1 --project="$PROJECT" \
    --member=allUsers --role=roles/run.invoker
done
```

---

## 7. 監視・ログ

### 7.1 system_logs に記録される文脈

| context | 発火条件 |
|---|---|
| `mail.account.create` | SMTP アカウント追加 |
| `mail.account.delete` | アカウント削除 |
| `mail.account.test` | テスト送信成功 |
| `mail.account.deactivate` | 連続失敗で unauthorized 降格 |
| `mail.gmail` | OAuth 認証完了 / 解除 |
| `mail.migrate` | 移行 Callable 実行 |

### 7.2 Cloud Function ログで監視すべきパターン

- `Unhandled error.*FAILED_PRECONDITION.*requires an index`：複合インデックス未デプロイ
- `Empty Authorization header value`：Cloud Run の Invoker 権限が allUsers に未付与
- `getaddrinfo ENOTFOUND`：SMTP host 設定ミスまたは DNS 障害（連続失敗カウントに影響）
- `Gmail send failed: 401`：OAuth トークン期限切れ → 自動 refresh が機能しているか確認

---

## 8. 既知の制約・将来の改善余地

### 8.1 現在の制約

- **アカウント所有モデル**：共有のみ（プライベートアカウントには未対応）
- **OAuth クライアント**：dev / prod とも単一の `GMAIL_OAUTH_CLIENT_ID`。スコープ最小化のため将来的に分離検討
- **SMTP プール**：`pool: false` のため毎送信で TCP 接続を張る（中量送信なら問題なし、大量送信なら検討余地）
- **複合インデックス**：手動でデプロイ。空コレクションでも build に数十秒かかるので新規環境では待ち時間あり

### 8.2 将来検討項目

1. **アカウント単位の権限制御**：editor がアカウント追加できる Self-service モード
2. **送信メトリクス**：プロバイダ別の delivery rate / open rate 統合ダッシュボード
3. **bounce ハンドリング**：SMTP の bounce email を解析して連続失敗カウントに反映
4. **OAuth scope 分離**：「読み取り」「送信のみ」など権限プロファイル
5. **SMTP 接続プール**：大量送信時のパフォーマンス改善

---

## 9. 改修・拡張時の指針

### 9.1 新しいプロバイダを追加する場合（例：SendGrid API）

1. `shared/src/types/mail.ts` の `MailAccountProvider` に値を追加
2. `functions/src/mail/lib/{provider}.ts` を新設（send / verify / save credential）
3. `sendDispatcher.ts` の `sendViaAccount` に分岐を追加
4. `accounts.ts` に専用 Callable（`create{Provider}Account` 等）を追加
5. UI の `AddAccountDialog.tsx` に選択肢追加
6. `MailAccountsSection.tsx` の status バッジ・ボタン表示を調整
7. 本ファイル `arch_mail_accounts.md` および `spec_mail_system.md` を更新

### 9.2 mail_accounts スキーマを変更する場合

1. `shared/src/types/mail.ts` の `MailAccount` を更新
2. 影響を受ける Callable（特に `accounts.ts` の `toPublic()` 関数）を更新
3. UI の `MailAccountRecord`（`useMailAccounts.ts`）と表示を更新
4. firestore.rules / indexes に変更があれば反映
5. 移行が必要なら新たな migration Callable を追加（idempotent 必須）

### 9.3 認証情報暗号化方式を変更する場合

`functions/src/mail/lib/kms.ts` の `LOCATION` / `KEYRING` / `KEY` を変更し、再暗号化スクリプトを別途用意する。`kmsKeyVersion` フィールドにより複数バージョンの並存は可能なので、無停止ローテーションができる。

---

## 10. テスト戦略

### 10.1 ユニット（推奨追加）

- `sendDispatcher.sendViaAccount` の provider 振り分け
- `registerFailure` の連続失敗カウントと unauthorized 昇格境界
- `gmailOAuthCallback` の衝突検出
- `migrateGmailTokensToAccounts` の冪等性

### 10.2 統合（dev 環境で確認済み）

- ✅ 移行 Callable の冪等再実行
- ✅ Gmail OAuth 新規 / 再認証 / 解除
- ✅ SMTP 追加（接続成功 / 失敗時のロールバック）
- ✅ テスト送信（Gmail / SMTP 双方）
- ✅ 既定切替
- ✅ 配信予約フォームのドロップダウン
- ✅ キャンペーン mail_send カードの送信元選択

---

## 関連ドキュメント

- [spec_mail_system.md](./spec_mail_system.md) — メールシステム全体仕様（B-17 で本ファイルを参照）
- [spec_common.md](./spec_common.md) — 認証・KMS・rate limit 等の共通基盤
- [gmail_oauth_setup.md](./gmail_oauth_setup.md) — Gmail OAuth クライアント初期セットアップ
- `feedback_security.md`（メモリ） — シークレット類のチャット・git 露出禁止ルール
