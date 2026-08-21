/**
 * 決済リンクの状態語彙と有効期限の移行スクリプト。
 *
 *   node scripts/migrate-payment-link-status.cjs            # dry-run（既定・書き込みなし）
 *   node scripts/migrate-payment-link-status.cjs --apply    # 実際に書き込む
 *   node scripts/migrate-payment-link-status.cjs --apply --strict-expiry
 *
 * 何を直すか:
 *   1. status の語彙統一 — 'open' / 'active' → 'pending'、'used' → 'paid'。
 *      発行側は 'open'、決済ページは 'used'、ルールは 'pending' → 'used' しか
 *      許可していなかったため、決済完了時の更新が弾かれて支払い済みリンクが
 *      未使用のまま残っていた。
 *   2. expiresAt の実効化 — 旧発行処理は serverTimestamp() をそのまま入れており
 *      「作成時刻＝有効期限」（発行と同時に期限切れ）になっていた。この値と
 *      未設定を、createdAt から起算した実際の期限に置き換える。
 *   3. userId の補完 — 紐づく applications から埋める。firestore.rules の
 *      読み取り制限（本人と管理者のみ）が userId に依存するため。
 *
 * 期限の与え方:
 *   まだ支払われていない（pending）リンクは、移行の巻き添えでいきなり期限切れに
 *   ならないよう「実行時刻＋有効日数」を与える。createdAt 起算に揃えたい場合は
 *   --strict-expiry を付ける（過去のリンクはその場で expired になる）。
 *   支払い済み・キャンセル済みのリンクは常に createdAt 起算で埋める。
 *
 * 事前に functions のビルドが必要（判定ロジックを共有しているため）:
 *   npm --prefix functions run build
 */
const path = require('path');

let statusLib;
try {
  statusLib = require(path.join(__dirname, '..', 'functions', 'lib', 'payment-link-status.js'));
} catch (e) {
  console.error('functions/lib/payment-link-status.js が見つかりません。先にビルドしてください:');
  console.error('  npm --prefix functions run build');
  process.exit(1);
}
const {
  DEFAULT_PAYMENT_LINK_VALIDITY_DAYS,
  computePaymentLinkExpiry,
  normalizePaymentLinkStatus,
  resolvePaymentLinkExpiry,
  toDateOrNull,
} = statusLib;

const admin = require('firebase-admin');
const key = require(path.join(__dirname, '..', 'functions', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const STRICT_EXPIRY = process.argv.includes('--strict-expiry');

(async () => {
  const settingsSnap = await db.collection('settings').doc('global').get();
  const validityDays = settingsSnap.data()?.paymentLinkValidityDays || DEFAULT_PAYMENT_LINK_VALIDITY_DAYS;
  const now = new Date();

  const linksSnap = await db.collection('paymentLinks').get();
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'}: paymentLinks ${linksSnap.size} 件 / 有効期限 ${validityDays} 日\n`);

  const counts = { status: 0, expiresAt: 0, userId: 0, untouched: 0 };

  for (const linkDoc of linksSnap.docs) {
    const link = linkDoc.data();
    const updates = {};
    const notes = [];

    // 1. status
    const normalized = normalizePaymentLinkStatus(link.status);
    if (link.status !== normalized) {
      updates.status = normalized;
      notes.push(`status: ${JSON.stringify(link.status)} → ${normalized}`);
      counts.status++;
    }

    // 2. expiresAt（未設定、または createdAt 以下の無意味な値）
    if (!resolvePaymentLinkExpiry(link)) {
      const createdAt = toDateOrNull(link.createdAt) || now;
      const base = (normalized === 'pending' && !STRICT_EXPIRY) ? now : createdAt;
      const expiry = computePaymentLinkExpiry(base, validityDays);
      updates.expiresAt = admin.firestore.Timestamp.fromDate(expiry);
      notes.push(`expiresAt: ${link.expiresAt ? '作成時刻のまま' : '未設定'} → ${expiry.toISOString().slice(0, 10)}`);
      counts.expiresAt++;

      // createdAt が無いと「expiresAt <= createdAt は期限なし」の判定が効かないので補う。
      if (!toDateOrNull(link.createdAt)) {
        updates.createdAt = admin.firestore.Timestamp.fromDate(createdAt);
        notes.push('createdAt: 未設定 → 実行時刻');
      }

      // --strict-expiry で過去日になった未払いリンクはその場で期限切れにする。
      if (normalized === 'pending' && expiry <= now) {
        updates.status = 'expired';
        notes.push('status: pending → expired（期限超過）');
      }
    }

    // 3. userId（ルールの読み取り制限が依存する）
    if (!link.userId && link.applicationId) {
      const appSnap = await db.collection('applications').doc(link.applicationId).get();
      const appUserId = appSnap.exists ? appSnap.data()?.userId : null;
      if (appUserId) {
        updates.userId = appUserId;
        notes.push(`userId: 未設定 → ${appUserId}`);
        counts.userId++;
      } else {
        notes.push('userId: 補完できず（申込が見つからない）— 手動確認が必要');
      }
    }

    if (!notes.length) {
      counts.untouched++;
      continue;
    }

    console.log(`- ${linkDoc.id}`);
    for (const note of notes) console.log(`    ${note}`);

    if (APPLY && Object.keys(updates).length) {
      updates.updatedAt = admin.firestore.Timestamp.fromDate(now);
      await linkDoc.ref.update(updates);
    }
  }

  console.log(`\n status 修正: ${counts.status} / expiresAt 修正: ${counts.expiresAt} / userId 補完: ${counts.userId} / 変更なし: ${counts.untouched}`);
  if (!APPLY) console.log('（dry-run。書き込むには --apply を付けて再実行）');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
