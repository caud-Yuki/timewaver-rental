/**
 * メール差し込み変数の回帰テスト（申込受付メール）
 *
 *   npm run test:email-placeholders
 *
 * 管理画面 /admin/email-templates は「代入キー一覧」として差し込める変数を案内し、
 * 管理者はそれをクリックして本文に挿入する。案内した変数をトリガー側が渡していないと、
 * 差し込みループは未知のキーを素通しするため "{{payAmount}}" という文字列のまま
 * 利用者にメールが届く（2026-08-21 に本番で発生。onApplicationCreate が申込項目を
 * 6 個だけ手で拾っていたのが原因）。
 *
 * ここでは UI が約束している変数と、トリガーが実際に渡すデータを突き合わせる。
 * エミュレータもメールアカウントも要らない（buildTemplateData は純粋関数）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'twrental-placeholder-test';
initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const { buildTemplateData } = await import('../functions/lib/triggers.js');

const results = [];
async function it(name, fn) {
  try { await fn(); results.push(true); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { results.push(false); console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${e.message.split('\n')[0]}`); }
}

// --- 管理UIが案内している代入キーを読み取る -------------------------------
const page = fs.readFileSync(new URL('../src/app/admin/email-templates/page.tsx', import.meta.url), 'utf8');
const groups = {};
for (const m of page.matchAll(/group: '([^']+)', keys: \[([\s\S]*?)\]/g)) {
  groups[m[1]] = [...m[2].matchAll(/key: '(\w+)'/g)].map((k) => k[1]);
}

/** 申込ドキュメントが供給源のグループ。申込受付メールで必ず解決すべき変数。 */
const APPLICATION_BACKED = ['ユーザー情報', '機器情報', '申請情報', '配送先', 'クーポン'];

// --- onApplicationCreate が渡すデータを同じ形で組み立てる -----------------
// （functions/src/index.ts の payload と同じ構造。申込を丸ごと渡す）
const application = {
  userId: 'user_taro', userName: '寺岡 佑記', userEmail: 'taro@example.com',
  deviceId: 'device_001', deviceSerialNumber: '205935A410', deviceType: 'TimeWaver Mobile',
  rentalType: 12, payType: 'monthly', payAmount: 125500, status: 'pending',
  shippingTel: '09000000000', shippingZipcode: '215-0021', shippingPrefecture: '神奈川県',
  shippingAddress1: '川崎市麻生区上麻生2-2-14', shippingAddress2: '101', shippingCompanyName: 'イシキSmoothy',
  couponCode: 'WELCOME10', couponDiscount: 5000, originalAmount: 130500,
};
const payload = {
  ...application,
  applicationId: 'app_001',
  deviceType: application.deviceType || '',
  deviceName: application.deviceType || '',
  deviceSerialNumber: application.deviceSerialNumber || '',
  userName: application.userName || '',
  userEmail: application.userEmail || '',
};
const SETTINGS = { serviceName: 'TimeWaverHub', companyName: 'カウデザイン', managerEmail: 'admin@example.com' };
const recipient = { name: application.userName, email: application.userEmail };
const values = buildTemplateData(SETTINGS, recipient, payload);

console.log('\n申込受付メール: 管理UIが案内する差し込み変数がすべて解決すること');

for (const group of APPLICATION_BACKED) {
  await it(`「${group}」の変数がすべて値を持つ`, () => {
    const keys = groups[group];
    assert.ok(keys?.length, `管理UIに「${group}」グループが無い（UI 側の構造が変わった可能性）`);
    const missing = keys.filter((k) => values[k] === undefined || values[k] === null || values[k] === '');
    assert.deepEqual(missing, [], `未供給の変数: ${missing.join(', ')}`);
  });
}

await it('★ 本文に未解決の {{...}} が残らない（本番で発生した不具合の回帰）', () => {
  // 管理者が実際に組んだ本文と同じ形（本番 Firestore の sys_application_submitted）
  const body = [
    '{{userName}} 様', '■対象機器:', '{{deviceType}}', '■機器シリアルナンバー:',
    '{{deviceSerialNumber}}', '■お申込プラン', '{{rentalType}}ヶ月プラン', '¥{{payAmount}}/ {{payType}}',
  ].join('\n');
  let rendered = body;
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    rendered = rendered.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
  }
  const left = [...rendered.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  assert.deepEqual(left, [], `未解決のまま残った変数: ${left.join(', ')}`);
});

console.log('\n表示の正規化');

await it('payAmount は桁区切りで表示される（¥125500 ではなく ¥125,500）', () => {
  assert.equal(values.payAmount, '125,500');
});

await it('payType は日本語表記になる（monthly ではなく 月々払い）', () => {
  assert.equal(values.payType, '月々払い');
  assert.equal(buildTemplateData(SETTINGS, recipient, { payType: 'full' }).payType, '一括払い');
});

await it('金額が未設定なら ¥0 とは表示しない（差し込み未解決のまま残す）', () => {
  // Number(null) === 0 に引きずられて「¥0」と請求額を偽らないこと
  assert.equal(buildTemplateData(SETTINGS, recipient, { payAmount: null }).payAmount, null);
  assert.equal(buildTemplateData(SETTINGS, recipient, {}).payAmount, undefined);
});

await it('整形済みの金額文字列は二重に加工しない（銀行振込の transferAmount 等）', () => {
  assert.equal(buildTemplateData(SETTINGS, recipient, { payAmount: '125,500' }).payAmount, '125,500');
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
