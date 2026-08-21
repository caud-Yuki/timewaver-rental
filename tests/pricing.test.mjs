/**
 * 課金金額のサーバー側再計算（functions/src/pricing.ts）の回帰テスト
 *
 *   npm run test:pricing
 *
 * Firestore エミュレータ上で Admin SDK を使い、コンパイル済みの
 * functions/lib/pricing.js をそのまま呼ぶ。本番プロジェクトには接続しない。
 *
 * 目的: サーバー側の算出式が、申込画面（src/app/apply/*、src/lib/module-pricing.ts）の
 * 見積りと一致すること＝正規の申込を誤って拒否しないこと、および
 * クライアントが送ってきた金額を一切参照していないことを保証する。
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// pricing.js（functions/lib）が使うのと同じ firebase-admin インスタンスを掴む。
// ルートの node_modules から読むと別インスタンスになり、初期化を共有できない。
const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = requireFromFunctions('firebase-admin/firestore');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'twrental-pricing-test';

initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

const { computeExpectedAmount, resolveTrustedPricing, calculateModuleAddon, termKeyFor, resolveMonths } =
  await import('../functions/lib/pricing.js');

const results = [];
async function it(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    results.push(['FAIL', name]);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${err.message.split('\n')[0]}`);
  }
}

const DEVICE = 'device_tw';
const USER = 'user_taro';

async function seed() {
  // 機器: 12ヶ月 月額¥50,000 / 一括¥550,000、モジュール 3pt + 2pt
  await db.collection('devices').doc(DEVICE).set({
    type: 'TimeWaver Pro',
    price: {
      '3m': { monthly: 60000, full: 170000 },
      '6m': { monthly: 55000, full: 320000 },
      '12m': { monthly: 50000, full: 550000 },
    },
    modules: [
      { id: 'm1', name: 'Module A', point: 3 },
      { id: 'm2', name: 'Module B', point: 2 },
    ],
  });
  // モジュール単価 ¥1,000/pt → 加算は月額 ¥5,000
  await db.collection('settings').doc('global').set({ moduleBasePrice: 1000 });

  await db.collection('coupons').doc('cp_10pct').set({
    code: 'TEN', name: '10%OFF', discountType: 'percentage', discountValue: 10,
    isActive: true, status: 'active',
  });
  await db.collection('coupons').doc('cp_5000').set({
    code: 'FIVE', name: '¥5,000 OFF', discountType: 'fixed', discountValue: 5000,
    isActive: true, status: 'active',
  });
  await db.collection('coupons').doc('cp_expired').set({
    code: 'OLD', name: '期限切れ', discountType: 'fixed', discountValue: 30000,
    isActive: true, status: 'active',
    expiresAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')),
  });
  await db.collection('coupons').doc('cp_huge').set({
    code: 'HUGE', name: '過大割引', discountType: 'fixed', discountValue: 999999,
    isActive: true, status: 'active',
  });
  await db.collection('coupons').doc('cp_inactive').set({
    code: 'STOP', name: '停止中', discountType: 'fixed', discountValue: 10000,
    isActive: false, status: 'disabled',
  });
  await db.collection('coupons').doc('cp_new_only').set({
    code: 'NEWONLY', name: '新規限定', discountType: 'fixed', discountValue: 10000,
    isActive: true, status: 'active', newCustomerOnly: true,
  });
  await db.collection('coupons').doc('cp_maxed').set({
    code: 'MAXED', name: '上限到達', discountType: 'fixed', discountValue: 10000,
    isActive: true, status: 'active', maxTotalUsers: 2, currentUsageCount: 2,
  });
}

/** 申込ドキュメント相当のオブジェクト。payAmount はあえて改ざん値を入れる。 */
function app(extra = {}) {
  return {
    userId: USER,
    deviceId: DEVICE,
    rentalType: 12,
    payType: 'monthly',
    payAmount: 1,            // ← クライアント改ざん値。サーバーはこれを見ない。
    originalAmount: 1,
    couponDiscount: 999999,
    createdAt: Timestamp.now(),
    ...extra,
  };
}

await seed();

console.log('\n算出式のヘルパー');

await it('モジュール加算 = Σ(単価 × ポイント)', () => {
  assert.equal(calculateModuleAddon([{ point: 3 }, { point: 2 }], 1000), 5000);
  assert.equal(calculateModuleAddon([], 1000), 0);
  assert.equal(calculateModuleAddon(undefined, 1000), 0);
  assert.equal(calculateModuleAddon([{ point: 3 }], 0), 0);
});

await it('契約月数は rentalType / rentalPeriod のどちらでも解決できる', () => {
  assert.equal(resolveMonths({ rentalType: 6 }), 6);
  assert.equal(resolveMonths({ rentalPeriod: 3 }), 3);
  assert.equal(resolveMonths({}), 12);
  assert.equal(termKeyFor(3), '3m');
  assert.equal(termKeyFor(6), '6m');
  assert.equal(termKeyFor(12), '12m');
});

console.log('\n新規申込: 申込画面の見積りと一致すること');

await it('月額払い = ベース月額 + モジュール加算（改ざん payAmount は無視）', async () => {
  const p = await computeExpectedAmount(app());
  assert.equal(p.expected, 55000);      // 50,000 + 5,000
  assert.equal(p.baseAmount, 55000);
  assert.equal(p.discount, 0);
  assert.equal(p.termKey, '12m');
});

await it('一括払い = ベース総額 + モジュール加算 × 月数', async () => {
  const p = await computeExpectedAmount(app({ payType: 'full' }));
  assert.equal(p.expected, 610000);     // 550,000 + 5,000 × 12
});

await it('3ヶ月・6ヶ月の料金テーブルも正しく引く', async () => {
  assert.equal((await computeExpectedAmount(app({ rentalType: 3 }))).expected, 65000);
  assert.equal((await computeExpectedAmount(app({ rentalType: 6 }))).expected, 60000);
  assert.equal((await computeExpectedAmount(app({ rentalType: 3, payType: 'full' }))).expected, 185000);
});

console.log('\nクーポン: クーポン文書を読み直して割引を再計算すること');

await it('率引きクーポンは割引前金額に対して計算する', async () => {
  const p = await computeExpectedAmount(app({ couponId: 'cp_10pct' }));
  assert.equal(p.discount, 5500);       // 55,000 の 10%
  assert.equal(p.expected, 49500);
});

await it('額引きクーポンはそのまま引く', async () => {
  const p = await computeExpectedAmount(app({ couponId: 'cp_5000' }));
  assert.equal(p.expected, 50000);
});

await it('★ 存在しないクーポンIDを差し込んでも割引されない', async () => {
  const p = await computeExpectedAmount(app({ couponId: 'cp_does_not_exist' }));
  assert.equal(p.discount, 0);
  assert.equal(p.expected, 55000);
  assert.equal(p.couponRejectedReason, 'coupon_not_found');
});

await it('★ 申込時点で期限切れのクーポンは無効', async () => {
  const p = await computeExpectedAmount(app({ couponId: 'cp_expired' }));
  assert.equal(p.discount, 0);
  assert.equal(p.couponRejectedReason, 'coupon_expired');
});

await it('★ 割引額は請求額を超えない（マイナス請求にならない）', async () => {
  const p = await computeExpectedAmount(app({ couponId: 'cp_huge' }));
  assert.equal(p.discount, 55000);
  assert.equal(p.expected, 0);
});

await it('★ couponDiscount を改ざんしても結果に影響しない', async () => {
  const p = await computeExpectedAmount(app({ couponId: 'cp_5000', couponDiscount: 54999 }));
  assert.equal(p.expected, 50000);
});

await it('★ 停止中のクーポンは無効', async () => {
  const p = await computeExpectedAmount(app({ couponId: 'cp_inactive' }));
  assert.equal(p.discount, 0);
  assert.equal(p.couponRejectedReason, 'coupon_inactive');
});

await it('★ 利用上限に達したクーポンは無効（申込作成時の初回算出）', async () => {
  const p = await computeExpectedAmount(app({ couponId: 'cp_maxed' }));
  assert.equal(p.discount, 0);
  assert.equal(p.couponRejectedReason, 'coupon_usage_limit_reached');
});

await it('上限チェックは再計算時には行わない（自分の消費分で正規の申込を弾かない）', async () => {
  // pricing が既にある = 申込作成時にサーバーが算出済み（＝1枠消費済み）の申込。
  const p = await computeExpectedAmount(app({ couponId: 'cp_maxed', pricing: { version: 1, expected: 45000 } }));
  assert.equal(p.discount, 10000);
  assert.equal(p.expected, 45000);
});

console.log('\n更新(renew)申込: 更新画面の見積り（新規と同じモジュール込み）と一致すること');

await it('契約実績がある更新も新規と同額（モジュール加算あり）', async () => {
  await db.collection('subscriptions').doc('sub_prev').set({
    userId: USER, deviceId: DEVICE, status: 'active',
  });
  const p = await computeExpectedAmount(app({ isRenewal: true, previousSubscriptionId: 'sub_prev' }));
  assert.equal(p.isRenewal, true);
  assert.equal(p.includesModules, true);
  assert.equal(p.expected, 55000);
});

await it('★ 契約実績が無いのに isRenewal を立てても更新扱いにならない', async () => {
  const p = await computeExpectedAmount(app({ userId: 'user_stranger', isRenewal: true }));
  assert.equal(p.isRenewal, false);
  assert.equal(p.expected, 55000);
});

await it('更新申込でもクーポンは新規と同じ条件で有効（RENEWAL_ALLOWS_COUPON）', async () => {
  const p = await computeExpectedAmount(app({ isRenewal: true, previousSubscriptionId: 'sub_prev', couponId: 'cp_10pct' }));
  assert.equal(p.isRenewal, true);
  assert.equal(p.discount, 5500);
  assert.equal(p.expected, 49500);
  assert.equal(p.couponRejectedReason, null);
});

await it('★ 新規限定クーポンは更新申込では常に無効', async () => {
  const p = await computeExpectedAmount(app({ isRenewal: true, previousSubscriptionId: 'sub_prev', couponId: 'cp_new_only' }));
  assert.equal(p.discount, 0);
  assert.equal(p.couponRejectedReason, 'coupon_new_customer_only');
  assert.equal(p.expected, 55000);
});

console.log('\n決済時に使う金額の解決（スナップショット優先）');

await it('申込時のスナップショットがあればそれを使う（後日の価格改定に追随しない）', async () => {
  const snapshot = await computeExpectedAmount(app());
  const { breakdown, source } = await resolveTrustedPricing(app({ pricing: snapshot }), 'test');
  assert.equal(source, 'snapshot');
  assert.equal(breakdown.expected, 55000);
});

await it('★ 偽装スナップショットは申込内容と突き合わせて弾き、再計算に落ちる', async () => {
  const forged = { version: 1, expected: 1, deviceId: 'other_device', payType: 'monthly', months: 12 };
  const { breakdown, source } = await resolveTrustedPricing(app({ pricing: forged }), 'test');
  assert.equal(source, 'recomputed');
  assert.equal(breakdown.expected, 55000);
});

await it('スナップショットが無い旧申込は再計算する', async () => {
  const { breakdown, source } = await resolveTrustedPricing(app(), 'test');
  assert.equal(source, 'recomputed');
  assert.equal(breakdown.expected, 55000);
});

await it('★ 機器が存在しない申込は金額を確定できずエラーになる（決済は拒否される）', async () => {
  await assert.rejects(() => computeExpectedAmount(app({ deviceId: 'device_missing' })));
  await assert.rejects(() => computeExpectedAmount(app({ deviceId: null })));
});

const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
