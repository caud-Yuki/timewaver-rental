/**
 * 管理者 Custom Claim の付与／剥奪（帯域外の復旧経路）。
 *
 *   node scripts/set-admin-claim.mjs <uid> admin     # 付与
 *   node scripts/set-admin-claim.mjs <uid> user      # 剥奪
 *   node scripts/set-admin-claim.mjs --list          # 現在の管理者一覧
 *
 * 通常の昇格・降格は管理者が Cloud Functions の `setUserRole` を呼ぶこと。
 * このスクリプトは「Claim を持つ管理者が 1 人もいなくなり、setUserRole 自体を
 * 呼べなくなった」場合の復旧用。認可は Claim のみを見るため（2026-08-21 に
 * Firestore role フォールバックを撤去）、その状態は自力では抜け出せない。
 *
 * 認証は gcloud のユーザー資格情報（プロジェクト所有者/編集者）を使う:
 *   gcloud auth login
 *   gcloud config set project studio-3681859885-cd9c1
 *
 * setUserRole と同じ副作用を再現する:
 *   - Auth の Custom Claim を {admin, role} に設定
 *   - Firestore の users/{uid}.role を更新（管理画面の表示用）
 *   - リフレッシュトークンを失効させ、再ログイン＝Claim 即時反映を強制
 */
import { execFileSync } from 'node:child_process';

const PROJECT = 'studio-3681859885-cd9c1';
const IDTK = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  'x-goog-user-project': PROJECT,
  'Content-Type': 'application/json',
};

async function api(url, body) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.status}: ${json.error.message}`);
  return json;
}

const [target, role] = process.argv.slice(2);

if (target === '--list') {
  // Auth 側の Claim を正とし、Firestore の role とズレていないかも見る。
  const { userInfo = [] } = await api(`${IDTK}/accounts:query`, { returnUserInfo: true });
  const admins = userInfo.filter((u) => {
    try { return JSON.parse(u.customAttributes || '{}').admin === true; } catch { return false; }
  });
  console.log(`Claim を持つ管理者: ${admins.length} 名`);
  for (const u of admins) console.log(` - ${u.localId}  ${u.email || '(no email)'}`);
  process.exit(0);
}

if (!target || (role !== 'admin' && role !== 'user')) {
  console.error('usage: node scripts/set-admin-claim.mjs <uid> <admin|user>');
  console.error('       node scripts/set-admin-claim.mjs --list');
  process.exit(1);
}

const isAdmin = role === 'admin';
const now = Math.floor(Date.now() / 1000);

await api(`${IDTK}/accounts:update`, {
  localId: target,
  customAttributes: JSON.stringify({ admin: isAdmin, role }),
  validSince: String(now), // = revokeRefreshTokens
});

await fetch(`${FS}/users/${target}?updateMask.fieldPaths=role`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ fields: { role: { stringValue: role } } }),
});

console.log(`${target} -> role='${role}', claim={admin:${isAdmin}}`);
console.log('既存セッションは失効した。対象ユーザーは再ログインすること。');
