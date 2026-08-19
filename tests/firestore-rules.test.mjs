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
const asAdmin = () => testEnv.authenticatedContext(ADMIN).firestore();
const asNewbie = () => testEnv.authenticatedContext(NEWBIE).firestore();
/** Custom Claim で管理者になっているコンテキスト（Firestore の role には依存しない） */
const asClaimAdmin = () => testEnv.authenticatedContext(CLAIM_ADMIN, { admin: true }).firestore();

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

console.log('\nCustom Claim による管理者判定（Firestore の role に依存しない経路）');

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
await it('Firestore の role:admin フォールバックは移行期間中も有効', async () => {
  await assertSucceeds(getDoc(doc(asAdmin(), 'emailTemplates', 'tpl_1')));
});

await testEnv.cleanup();

const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
