/**
 * 契約更新の受付条件（src/lib/renewal.ts）の回帰テスト
 *
 *   npm run test:renewal
 *
 * この判定はマイデバイスの更新ボタンと更新申込ページ（URL 直叩きの防止）の
 * 両方で使うため、ズレると「ボタンは出ないが URL からは申し込める」状態になる。
 * 型注釈は Node の型ストリップで落として TS のまま実行する（ビルド不要）。
 */
import assert from 'node:assert/strict';

const { isRenewalEligible, toDateOrNull, RENEWAL_IN_PROGRESS_STATUSES, RENEWAL_WINDOW_MONTHS_BEFORE_END } =
  await import('../src/lib/renewal.ts');

const results = [];
function it(name, fn) {
  try {
    fn();
    results.push(['PASS', name]);
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    results.push(['FAIL', name]);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      ${err.message.split('\n')[0]}`);
  }
}

const PRODUCTION = { mode: 'production' };
const TEST_MODE = { mode: 'test' };

/** 今日から days 日後の Date */
const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
/** Firestore Timestamp 相当 */
const asTimestamp = (date) => ({ seconds: Math.floor(date.getTime() / 1000) });

console.log('\n日付の正規化');

it('Timestamp / Date / ISO文字列 のいずれでも Date になる', () => {
  const d = new Date('2026-12-01T00:00:00Z');
  assert.equal(toDateOrNull(asTimestamp(d))?.getTime(), d.getTime());
  assert.equal(toDateOrNull({ toDate: () => d })?.getTime(), d.getTime());
  assert.equal(toDateOrNull(d.toISOString())?.getTime(), d.getTime());
  assert.equal(toDateOrNull(null), null);
  assert.equal(toDateOrNull('not a date'), null);
});

console.log('\n更新の受付期間');

it(`終了日の${RENEWAL_WINDOW_MONTHS_BEFORE_END}ヶ月前になったら受け付ける`, () => {
  assert.equal(isRenewalEligible(asTimestamp(inDays(20)), PRODUCTION), true);
  assert.equal(isRenewalEligible(asTimestamp(inDays(1)), PRODUCTION), true);
});

it('★ 期間より前は受け付けない（URL 直叩きの防止）', () => {
  assert.equal(isRenewalEligible(asTimestamp(inDays(60)), PRODUCTION), false);
  assert.equal(isRenewalEligible(asTimestamp(inDays(365)), PRODUCTION), false);
});

it('終了日を過ぎた契約も受け付ける（満了後の再開）', () => {
  assert.equal(isRenewalEligible(asTimestamp(inDays(-5)), PRODUCTION), true);
});

it('★ 終了日が無い契約は受け付けない', () => {
  assert.equal(isRenewalEligible(null, PRODUCTION), false);
  assert.equal(isRenewalEligible(undefined, PRODUCTION), false);
});

it('★ 設定が読めていないうちは受け付けない', () => {
  assert.equal(isRenewalEligible(asTimestamp(inDays(1)), null), false);
  assert.equal(isRenewalEligible(asTimestamp(inDays(1)), undefined), false);
});

it('テストモードは期間を無視して常に受け付ける', () => {
  assert.equal(isRenewalEligible(asTimestamp(inDays(365)), TEST_MODE), true);
  assert.equal(isRenewalEligible(null, TEST_MODE), true);
});

console.log('\n重複ガードの対象ステータス');

it('★ completed 以降は含めない（次回の更新を永久にブロックしないため）', () => {
  for (const s of ['completed', 'shipped', 'in_use', 'expired', 'closed', 'rejected', 'canceled']) {
    assert.equal(RENEWAL_IN_PROGRESS_STATUSES.includes(s), false, `${s} が含まれている`);
  }
});

it('審査・決済待ちのステータスは含める', () => {
  for (const s of ['pending', 'approved', 'payment_sent', 'awaiting_bank_transfer']) {
    assert.equal(RENEWAL_IN_PROGRESS_STATUSES.includes(s), true, `${s} が含まれていない`);
  }
});

const failed = results.filter(([s]) => s === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
