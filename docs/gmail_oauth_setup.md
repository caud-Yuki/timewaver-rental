# Gmail OAuth 2.0 セットアップ手順（TWRENTAL-PLATFORM）

最終更新: 2026-05-01（TWRENTAL 適用版・初期セットアップ向け）

本ドキュメントは TWRENTAL-PLATFORM の **基本設定 → メール設定 → 「+ アカウントを追加」 → Gmail（推奨）** ボタンを動作させるまでの手順をまとめたもの。

> **対象プロジェクト**: `studio-3681859885-cd9c1`
> **Functions リージョン**: `us-central1`

---

## 前提

- Firebase プロジェクト `studio-3681859885-cd9c1` がセットアップ済
- `gmailOAuthStart` / `gmailOAuthCallback` / `listMailAccounts` 等の mail Functions がデプロイ済
- 自分が `admin` 権限でサインイン済

---

## セットアップ手順（6 ステップ）

### Step 1: Google Cloud Console で OAuth 2.0 Client ID を作成

1. [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) を開く（対象プロジェクトを選択）
2. Firebase Auth 有効化時に自動作成された `Web client (auto created by Google Service)` がすでに存在するはず。無ければ `+ CREATE CREDENTIALS → OAuth client ID → Web application` で新規作成
3. **Client ID** をコピー: 形式は `xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com`

### Step 2: Client Secret を取得（重要）

Google の仕様変更により **既存の Client Secret は再表示できない**。選択肢は 2 つ:

- **オプション A**: 作成時に保存済なら、それを使う（1Password 等）
- **オプション B**: 新規発行する（既存 Secret は自動で Disabled になる）

オプション B 手順:
1. OAuth Client 編集画面の右側「Client secrets」→ **+ Add secret** ボタン
2. モーダルに新 Secret が **一度だけ**表示される（`GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx` 形式）
3. **必ずその場でコピーして 1Password 等に保管**（閉じたら二度と見れない）

### Step 3: Authorized redirect URIs を登録

OAuth Client 編集画面の **Authorized redirect URIs** に以下 2 つを**両方**追加:

```
https://gmailoauthcallback-<HASH>-uc.a.run.app
https://us-central1-studio-3681859885-cd9c1.cloudfunctions.net/gmailOAuthCallback
```

- `<HASH>` は Cloud Run が自動生成する文字列（例: `63lsve6bfa`）。`gcloud run services describe gmailoauthcallback --region=us-central1 --format="value(status.url)"` で取得可
- TWRENTAL は `us-central1` リージョン（`-uc.a.run.app` ホスト）

⚠ **重要**: Cloud Functions v2 は `.run.app` と `.cloudfunctions.net` の両方で実際に動くが、コード側 (`getRedirectUri()` in `functions/src/mail/lib/gmail.ts`) は現状 `.cloudfunctions.net` を出力している。Console に `.run.app` 側しか登録してないと `redirect_uri_mismatch` エラーが出る。両方登録するのが最も安全。

### Step 4: 基本設定 → メール設定タブで Client ID / Secret を登録

`/admin/settings` → 「メール設定」タブ → 「Gmail OAuth クライアント」カード で以下 2 件を入力 → 「シークレットを保存」:

| Key | Value |
|---|---|
| GMAIL OAUTH CLIENT ID | Step 1 でコピーした値 |
| GMAIL OAUTH CLIENT SECRET | Step 2 でコピーした値（GOCSPX-...） |

登録されると「✅ 設定済」バッジに変わる。実値は Google Cloud Secret Manager の `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET` に保存される。

### Step 5: Cloud KMS API 有効化 + Keyring/Key 作成 + IAM 付与

Gmail OAuth トークン / SMTP パスワードは KMS で暗号化して `mail_gmail_tokens/{accountId}` または `mail_smtp_credentials/{accountId}` に保存する設計。KMS が未設定だと OAuth コールバック時に暗号化エラーで失敗する。

```bash
PROJECT=studio-3681859885-cd9c1
# Compute SA は `gcloud projects describe $PROJECT --format='value(projectNumber)'` で取得した番号で置換
SA_EMAIL=<PROJECT_NUMBER>-compute@developer.gserviceaccount.com

# 1. API 有効化
gcloud services enable cloudkms.googleapis.com --project=$PROJECT

# 2. Keyring 作成
gcloud kms keyrings create gmail-tokens \
  --location=us-central1 \
  --project=$PROJECT

# 3. Key 作成（90 日自動ローテート）
gcloud kms keys create gmail-token-encryption \
  --keyring=gmail-tokens \
  --location=us-central1 \
  --purpose=encryption \
  --rotation-period=90d \
  --next-rotation-time="$(date -u -v+90d '+%Y-%m-%dT%H:%M:%SZ')" \
  --project=$PROJECT

# 4. Compute SA に encrypt/decrypt 権限付与
gcloud kms keys add-iam-policy-binding gmail-token-encryption \
  --keyring=gmail-tokens \
  --location=us-central1 \
  --member="serviceAccount:$SA_EMAIL" \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter \
  --project=$PROJECT
```

⚠ API 有効化直後は伝播待ちが必要（数分）。Keyring 作成が成功しても Key 作成で PERMISSION_DENIED が出たら数十秒待って再試行。

> **環境変数で上書き可**: `MAIL_KMS_LOCATION` / `MAIL_KMS_KEYRING` / `MAIL_KMS_KEY` を Cloud Functions 環境変数に設定すると、コード変更なしで別 KMS リソースに切り替えられる。

### Step 6: Gmail 関連 Functions を redeploy

Cloud Functions v2 は **起動時にのみ** Secret 値をキャッシュするため、Step 4 で secret を更新しても実行中のインスタンスには反映されない。redeploy で強制的に新値を取り込ませる。

```bash
cd functions && rm -rf lib/ && npx tsc && cd ..
firebase deploy --only \
  functions:gmailOAuthStart,\
functions:gmailOAuthCallback,\
functions:listMailAccounts,\
functions:createSmtpAccount,\
functions:updateSmtpAccount,\
functions:deleteMailAccount,\
functions:setDefaultMailAccount,\
functions:testMailAccount,\
functions:revokeGmailAuth,\
functions:sendAdHocEmail \
  --project=studio-3681859885-cd9c1
```

これで認証画面で正常に Google に遷移でき、認可後に `mail_gmail_tokens/{accountId}` に暗号化 token が保存される。

---

## 動作確認

画面 13 メール設定 → **「Gmail を接続」** ボタンをクリック。以下のフロー:

1. Google 認証画面へリダイレクト（Client ID が表示される）
2. Gmail スコープ同意 → 許可
3. `gmailOAuthCallback` Function にリダイレクト
4. `access_token` / `refresh_token` を KMS で暗号化して `mail_gmail_tokens/{uid}` に保存
5. 成功画面 → 画面 13 にリダイレクト
6. 画面 13 の Gmail セクションが **「✅ 認証済み: your@example.com」** に切り替わる

---

## トラブルシューティング

| 症状 | 原因 | 解消方法 |
|---|---|---|
| `invalid_client` (401) | Secret Manager の Client ID が placeholder のまま | Step 4 で Client ID を登録 + Step 6 で redeploy |
| URL に `client_id=placeholder-to-be-replaced` が含まれる | 同上 | 同上 |
| `redirect_uri_mismatch` (400) | Authorized redirect URIs に `.cloudfunctions.net` 版が未登録 | Step 3 で両方登録 |
| 「暗号化エラー / Cloud KMS の設定を確認してください」 | Cloud KMS keyring/key が未作成、または Compute SA に権限が無い | Step 5 を実施 |
| 「Gmail を接続」ボタン押下で `failed-precondition` | `GMAIL_OAUTH_CLIENT_ID` secret が未登録 | Step 4 を実施 |
| 認証は通るが画面 13 がまだ「未認証」のまま | Firestore `mail_gmail_tokens/{uid}` は書き込まれているが UI 反映に遅延 | ページリロード |

---

## 本番 (`caud-goenhub`) 展開時のチェックリスト

- [ ] Google Cloud Console で**本番用** OAuth Client ID / Secret を別途作成（dev の流用は非推奨）
- [ ] Authorized redirect URIs に本番 Cloud Functions URL 2 種を追加
- [ ] admin-web（本番）でシークレット 2 種を登録
- [ ] Cloud KMS API 有効化 + keyring `gmail-tokens` + key `gmail-token-encryption` 作成
- [ ] 本番 Compute SA（`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`）に KMS IAM 付与
- [ ] 本番 Functions の redeploy
- [ ] OAuth consent screen の「公開ステータス」を必要に応じて Production に（現状 Internal なら caudesign.jp ドメイン内のみ利用可）

---

## 参考

- 設計: `docs/spec_mail_system.md B-2.4`, `B-5.1`
- 実装: `functions/src/mail/gmailOAuth.ts`, `functions/src/mail/lib/kms.ts`
- 以前のドキュメント: `docs/local_test_guide.md` セクション 4（KMS のみ記載、Secret 登録部分は更新済）
