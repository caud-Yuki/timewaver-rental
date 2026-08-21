/**
 * Firestore セキュリティルールの回帰テスト（申込フロー）
 *
 *   npm run test:rules
 *
 * Firestore エミュレータ上で firestore.rules をそのまま評価する。
 * 本番プロジェクトには一切接続しない。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';

const USER = 'user_taro';
const OTHER = 'user_hanako';
const ADMIN = 'admin_boss';
const DEVICE = 'device_001';
const NEWBIE = 'user_newbie';   // users ドキュメント未作成のユーザー
const CLAIM_ADMIN = 'admin_claim'; // Custom Claim だけを持つ管理者（users ドキュメント無し）
const LEGACY_ADMIN = 'admin_legacy'; // users.role='admin' だが Claim 未付与（旧フォールバック経路）

const testEnv = await initializeTestEnvironment({
  projectId: 'twrental-rules-test',
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

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

/** 各テスト前に、対象ユーザーがロック中の機器という初期状態へ戻す */
async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', USER), { role: 'user' });
    await setDoc(doc(db, 'users', OTHER), { role: 'user' });
    await setDoc(doc(db, 'users', ADMIN), { role: 'admin' });
    await setDoc(doc(db, 'users', LEGACY_ADMIN), { role: 'admin' });
    // 申込画面が取得済みのセッションロック
    await setDoc(doc(db, 'devices', DEVICE), {
      status: 'processing',
      currentUserId: USER,
      type: 'TimeWaver',
    });
    // 他ユーザーのキャンセル待ち
    await setDoc(doc(db, 'waitlist', 'wl_other'), {
      userId: OTHER,
      deviceId: DEVICE,
      status: 'waiting',
    });
  });
}

const asUser = () => testEnv.authenticatedContext(USER).firestore();
const asOther = () => testEnv.authenticatedContext(OTHER).firestore();
/** 管理者。本番の setUserRole が付与するのと同じ Claim を持つ */
const asAdmin = () => testEnv.authenticatedContext(ADMIN, { admin: true, role: 'admin' }).firestore();
const asNewbie = () => testEnv.authenticatedContext(NEWBIE).firestore();
/** Custom Claim で管理者になっているコンテキスト（Firestore の role には依存しない） */
const asClaimAdmin = () => testEnv.authenticatedContext(CLAIM_ADMIN, { admin: true }).firestore();
/** users.role だけが 'admin' で Claim を持たないコンテキスト（昇格されてはいけない） */
const asLegacyAdmin = () => testEnv.authenticatedContext(LEGACY_ADMIN).firestore();

console.log('\n申込フロー: 一般ユーザーが申込を完了できること');

await seed();
await it('申込ドキュメントを作成できる (status=pending)', async () => {
  await assertSucceeds(
    addDoc(collection(asUser(), 'applications'), { userId: USER, status: 'pending', deviceId: DEVICE })
  );
});

await seed();
await it('★ ロック中の機器を under_review へ遷移できる（今回の修正点）', async () => {
  await assertSucceeds(
    updateDoc(doc(asUser(), 'devices', DEVICE), { status: 'under_review' })
  );
});

await seed();
await it('管理者も under_review へ遷移できる', async () => {
  await assertSucceeds(updateDoc(doc(asAdmin(), 'devices', DEVICE), { status: 'under_review' }));
});

await seed();
await it('★ 申込送信シーケンス全体が通る（apply/new の handleSubmit と同じ順番・同じ書き込み）', async () => {
  const db = asUser();
  // 1. プロフィールへ配送先を反映（handleSubmit の非同期・非致命処理）
  await assertSucceeds(
    updateDoc(doc(db, 'users', USER), { tel: '09000000000', zipcode: '1000001', address1: '東京都千代田区' })
  );
  // 2. 申込本体（ここだけが致命。失敗すると利用者にエラーが出る）
  await assertSucceeds(
    addDoc(collection(db, 'applications'), {
      userId: USER, status: 'pending', deviceId: DEVICE, payAmount: 50000, payType: 'monthly', rentalType: 12,
    })
  );
  // 3. セッションロックを審査中へ
  await assertSucceeds(updateDoc(doc(db, 'devices', DEVICE), { status: 'under_review' }));
  // 4. 他ユーザーのキャンセル待ちは残ったまま（申込送信では削除しない）。
  //    旧実装はここで一括 delete して permission-denied になり、申込完了まで到達できなかった。
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'waitlist', 'wl_other'));
    assert.equal(snap.exists(), true, 'キャンセル待ちが消えている');
  });
});

console.log('\n権限境界: 緩めすぎていないこと');

await seed();
await it('ロックを持たない他人は under_review へ遷移できない', async () => {
  await assertFails(updateDoc(doc(asOther(), 'devices', DEVICE), { status: 'under_review' }));
});

await seed();
await it('available の機器を直接 under_review にはできない', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'devices', DEVICE), { status: 'available', currentUserId: null });
  });
  await assertFails(updateDoc(doc(asUser(), 'devices', DEVICE), { status: 'under_review' }));
});

await seed();
await it('審査中(under_review)の機器を一般ユーザーが available へ戻せない', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'devices', DEVICE), { status: 'under_review', currentUserId: USER });
  });
  await assertFails(updateDoc(doc(asUser(), 'devices', DEVICE), { status: 'available' }));
});

await seed();
await it('一般ユーザーは他人のキャンセル待ちを削除できない（意図どおり拒否）', async () => {
  await assertFails(deleteDoc(doc(asUser(), 'waitlist', 'wl_other')));
});

await seed();
await it('管理者はキャンセル待ちを削除できる', async () => {
  await assertSucceeds(deleteDoc(doc(asAdmin(), 'waitlist', 'wl_other')));
});

console.log('\n既存の遷移が壊れていないこと');

await seed();
await it('available → processing（ロック取得）', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'devices', DEVICE), { status: 'available', currentUserId: null });
  });
  await assertSucceeds(
    updateDoc(doc(asUser(), 'devices', DEVICE), { status: 'processing', currentUserId: USER })
  );
});

await seed();
await it('processing → available（タイムアウト解放）', async () => {
  await assertSucceeds(updateDoc(doc(asUser(), 'devices', DEVICE), { status: 'available', currentUserId: null }));
});

await seed();
await it('processing → active（決済完了）', async () => {
  await assertSucceeds(updateDoc(doc(asUser(), 'devices', DEVICE), { status: 'active' }));
});

await seed();
await it('契約更新(renew)の申込も作成できる', async () => {
  await assertSucceeds(
    addDoc(collection(asUser(), 'applications'), {
      userId: USER, status: 'pending', deviceId: DEVICE, isRenewal: true,
    })
  );
});


console.log('\n権限昇格: 誰でも管理者になれてしまう穴が塞がっていること');

await seed();
await it('★ 一般ユーザーが自分の role を admin に書き換えられない（今回の修正点）', async () => {
  await assertFails(updateDoc(doc(asUser(), 'users', USER), { role: 'admin' }));
});

await seed();
await it('★ setDoc(merge) でも role を admin に昇格できない', async () => {
  await assertFails(
    setDoc(doc(asUser(), 'users', USER), { role: 'admin' }, { merge: true })
  );
});

await seed();
await it('★ 新規登録時に role:"admin" でプロフィールを作成できない', async () => {
  await assertFails(
    setDoc(doc(asNewbie(), 'users', NEWBIE), { familyName: '悪意', role: 'admin' })
  );
});

await seed();
await it('新規登録時に role:"user" ならプロフィールを作成できる（登録フロー維持）', async () => {
  await assertSucceeds(
    setDoc(doc(asNewbie(), 'users', NEWBIE), { familyName: '太郎', email: 't@example.com', role: 'user' })
  );
});

await seed();
await it('本人は role 以外のプロフィール項目を更新できる（マイページ編集フロー維持）', async () => {
  await assertSucceeds(
    updateDoc(doc(asUser(), 'users', USER), { familyName: '山田', phone: '09000000000' })
  );
});

await seed();
await it('本人は stripeCustomerId を更新できる（決済フロー維持）', async () => {
  await assertSucceeds(
    updateDoc(doc(asUser(), 'users', USER), { stripeCustomerId: 'cus_test_123' })
  );
});

await seed();
await it('他人のプロフィールは更新できない', async () => {
  await assertFails(updateDoc(doc(asUser(), 'users', OTHER), { familyName: '乗っ取り' }));
});

await seed();
await it('他人を admin に昇格させることもできない', async () => {
  await assertFails(updateDoc(doc(asUser(), 'users', OTHER), { role: 'admin' }));
});

await seed();
await it('自分のプロフィールを削除できない（退会は Functions 経由）', async () => {
  await assertFails(deleteDoc(doc(asUser(), 'users', USER)));
});

await seed();
await it('管理者は role を維持したまま自分のプロフィールを更新できる', async () => {
  await assertSucceeds(updateDoc(doc(asAdmin(), 'users', ADMIN), { familyName: '管理者' }));
});

await seed();
await it('管理者であっても自分で role を書き換えることはできない', async () => {
  await assertFails(updateDoc(doc(asAdmin(), 'users', ADMIN), { role: 'user' }));
});

console.log('\nCustom Claim による管理者判定（Firestore の role は認可に使わない）');

await seed();
await it('Custom Claim admin:true なら users ドキュメントが無くても管理者扱いになる', async () => {
  await assertSucceeds(deleteDoc(doc(asClaimAdmin(), 'waitlist', 'wl_other')));
});

await seed();
await it('Custom Claim admin:true は管理者専用コレクションを読める', async () => {
  await assertSucceeds(getDoc(doc(asClaimAdmin(), 'emailTemplates', 'tpl_1')));
});

await seed();
await it('Claim を持たない一般ユーザーは管理者専用コレクションを読めない', async () => {
  await assertFails(getDoc(doc(asUser(), 'emailTemplates', 'tpl_1')));
});

await seed();
await it('★ Claim 無しで users.role=admin だけでは管理者専用コレクションを読めない（フォールバック撤去）', async () => {
  await assertFails(getDoc(doc(asLegacyAdmin(), 'emailTemplates', 'tpl_1')));
});

await seed();
await it('★ Claim 無しで users.role=admin だけでは管理者操作もできない（フォールバック撤去）', async () => {
  await assertFails(deleteDoc(doc(asLegacyAdmin(), 'waitlist', 'wl_other')));
});

await seed();
await it('Claim を持つ管理者は管理者専用コレクションを読める（管理画面フロー維持）', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'emailTemplates', 'tpl_1')));
});

console.log('\n修理・サポート依頼: 本人が起票でき、対応状況は管理者だけが動かせること');

await seed();
await it('自分名義の依頼を status=open で作成できる', async () => {
  await assertSucceeds(
    addDoc(collection(asUser(), 'supportRequests'), {
      userId: USER, deviceId: DEVICE, type: 'repair', description: '電源が入らない', status: 'open',
    })
  );
});

await seed();
await it('★ 作成時に status を open 以外にはできない（未対応キューから隠せない）', async () => {
  await assertFails(
    addDoc(collection(asUser(), 'supportRequests'), {
      userId: USER, deviceId: DEVICE, type: 'repair', description: '電源が入らない', status: 'resolved',
    })
  );
});

await seed();
await it('他人名義の依頼は作成できない', async () => {
  await assertFails(
    addDoc(collection(asUser(), 'supportRequests'), {
      userId: OTHER, deviceId: DEVICE, type: 'repair', description: 'なりすまし', status: 'open',
    })
  );
});

await seed();
await it('自分の依頼は読める', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'supportRequests', 'sr_1'), { userId: USER, status: 'open' });
  });
  await assertSucceeds(getDoc(doc(asUser(), 'supportRequests', 'sr_1')));
});

await seed();
await it('他人の依頼は読めない', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'supportRequests', 'sr_1'), { userId: OTHER, status: 'open' });
  });
  await assertFails(getDoc(doc(asUser(), 'supportRequests', 'sr_1')));
});

await seed();
await it('★ 起票者でも対応状況は更新できない（管理者のみ）', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'supportRequests', 'sr_1'), { userId: USER, status: 'open' });
  });
  await assertFails(updateDoc(doc(asUser(), 'supportRequests', 'sr_1'), { status: 'resolved' }));
});

await seed();
await it('管理者は対応状況と対応メモを更新できる', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'supportRequests', 'sr_1'), { userId: USER, status: 'open' });
  });
  await assertSucceeds(
    updateDoc(doc(asAdmin(), 'supportRequests', 'sr_1'), { status: 'in_progress', adminNote: '一次切り分け中' })
  );
});

await seed();
await it('管理者は依頼を読める', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'supportRequests', 'sr_1'), { userId: USER, status: 'open' });
  });
  await assertSucceeds(getDoc(doc(asAdmin(), 'supportRequests', 'sr_1')));
});

console.log('\n課金金額の改ざん防止: 金額系フィールドはサーバー（Admin SDK）だけが書けること');

/** 審査中の申込を1件用意する */
async function seedApplication(extra = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'applications', 'app_1'), {
      userId: USER,
      deviceId: DEVICE,
      status: 'payment_sent',
      payType: 'monthly',
      rentalType: 12,
      payAmount: 50000,
      originalAmount: 50000,
      couponDiscount: 0,
      pricing: { version: 1, expected: 50000, deviceId: DEVICE, payType: 'monthly', months: 12 },
      ...extra,
    });
  });
}

await seed();
await it('★ 本人でも申込の payAmount を書き換えられない（今回の修正点）', async () => {
  await seedApplication();
  await assertFails(updateDoc(doc(asUser(), 'applications', 'app_1'), { payAmount: 50 }));
});

await seed();
await it('★ 本人でも pricing スナップショットを書き換えられない', async () => {
  await seedApplication();
  await assertFails(
    updateDoc(doc(asUser(), 'applications', 'app_1'), {
      pricing: { version: 1, expected: 50, deviceId: DEVICE, payType: 'monthly', months: 12 },
    })
  );
});

await seed();
await it('★ 金額以外の変更に紛れ込ませても拒否される', async () => {
  await seedApplication();
  await assertFails(
    updateDoc(doc(asUser(), 'applications', 'app_1'), { status: 'canceled', payAmount: 50 })
  );
});

await seed();
await it('★ 割引額・クーポンも書き換えられない', async () => {
  await seedApplication();
  await assertFails(updateDoc(doc(asUser(), 'applications', 'app_1'), { couponDiscount: 49950 }));
  await assertFails(updateDoc(doc(asUser(), 'applications', 'app_1'), { couponId: 'coupon_100off' }));
});

await seed();
await it('★ 契約条件（機器・期間・支払方法）も後から変更できない', async () => {
  await seedApplication();
  await assertFails(updateDoc(doc(asUser(), 'applications', 'app_1'), { rentalType: 3 }));
  await assertFails(updateDoc(doc(asUser(), 'applications', 'app_1'), { payType: 'full' }));
  await assertFails(updateDoc(doc(asUser(), 'applications', 'app_1'), { deviceId: 'device_cheap' }));
});

await seed();
await it('★ 申込作成時に pricing を偽装して持ち込めない', async () => {
  await assertFails(
    addDoc(collection(asUser(), 'applications'), {
      userId: USER, status: 'pending', deviceId: DEVICE, payAmount: 50,
      pricing: { version: 1, expected: 50, deviceId: DEVICE, payType: 'monthly', months: 12 },
    })
  );
});

await seed();
await it('★ 申込作成時に couponUsageCountedAt を持ち込めない（クーポン上限の回避防止）', async () => {
  await assertFails(
    addDoc(collection(asUser(), 'applications'), {
      userId: USER, status: 'pending', deviceId: DEVICE, payAmount: 50,
      couponId: 'coupon_100off', couponUsageCountedAt: new Date(),
    })
  );
});

await seed();
await it('★ 本人は couponUsageCountedAt を後から書き換えられない', async () => {
  await seedApplication();
  await assertFails(
    updateDoc(doc(asUser(), 'applications', 'app_1'), { couponUsageCountedAt: new Date() })
  );
});

await seed();
await it('本人は申込をキャンセルできる（マイページのフロー維持）', async () => {
  await seedApplication();
  await assertSucceeds(updateDoc(doc(asUser(), 'applications', 'app_1'), { status: 'canceled' }));
});

await seed();
await it('本人は本人確認書類・同意書をアップロードできる（マイページのフロー維持）', async () => {
  await seedApplication();
  await assertSucceeds(
    updateDoc(doc(asUser(), 'applications', 'app_1'), {
      identificationImageUrl: 'https://example.com/id.png',
      agreementImageUrls: ['https://example.com/consent.png'],
      status: 'consent_form_review',
    })
  );
});

await seed();
await it('pricing を持たない旧データでも本人のキャンセルは通る（後方互換）', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'applications', 'app_legacy'), {
      userId: USER, deviceId: DEVICE, status: 'payment_sent', payAmount: 50000,
    });
  });
  await assertSucceeds(updateDoc(doc(asUser(), 'applications', 'app_legacy'), { status: 'canceled' }));
});

await seed();
await it('管理者は金額を修正できる（返金・特例対応）', async () => {
  await seedApplication();
  await assertSucceeds(updateDoc(doc(asAdmin(), 'applications', 'app_1'), { payAmount: 40000 }));
});

/** 決済リンクを1件用意する */
async function seedPaymentLink(status = 'pending') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'paymentLinks', 'link_1'), {
      applicationId: 'app_1', userId: USER, deviceId: DEVICE,
      payType: 'monthly', payAmount: 50000, status,
    });
  });
}

await seed();
await it('★ 決済リンクの payAmount を一般ユーザーが書き換えられない（今回の修正点）', async () => {
  await seedPaymentLink();
  await assertFails(updateDoc(doc(asUser(), 'paymentLinks', 'link_1'), { payAmount: 50 }));
});

await seed();
await it('★ status を used にする更新に金額改ざんを混ぜられない', async () => {
  await seedPaymentLink();
  await assertFails(
    updateDoc(doc(asUser(), 'paymentLinks', 'link_1'), { status: 'used', payAmount: 50 })
  );
});

await seed();
await it('決済完了時に status を used へ変更するのは引き続き可能', async () => {
  await seedPaymentLink();
  await assertSucceeds(updateDoc(doc(asUser(), 'paymentLinks', 'link_1'), { status: 'used' }));
});

await testEnv.cleanup();

const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
