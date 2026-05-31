'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, MinusCircle, KeyRound, ShieldCheck, Webhook, FileSearch, Wallet, Loader2 } from 'lucide-react';
import type { StripeConnectionTestResult, StripeCheck } from '@/lib/secret-actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: StripeConnectionTestResult | null;
  loading: boolean;
}

/** Status pill — green/red/gray based on check.ok (true/false/null=skipped). */
function StatusBadge({ check }: { check: StripeCheck }) {
  if (check.ok === true) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" />OK
      </span>
    );
  }
  if (check.ok === false) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
        <XCircle className="h-3 w-3" />NG
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
      <MinusCircle className="h-3 w-3" />スキップ
    </span>
  );
}

function CheckRow({ title, check, children }: { title: string; check: StripeCheck; children?: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <StatusBadge check={check} />
      </div>
      {check.detail && (
        <p className={`text-xs mt-1.5 leading-relaxed ${check.ok === false ? 'text-red-600' : 'text-gray-600'}`}>
          {check.detail}
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * Format an amount returned from Stripe /v1/balance.
 * Stripe returns the smallest currency unit (e.g. cents). For JPY, the amount
 * IS the yen value (zero-decimal currency), but for USD/EUR we need to divide by 100.
 */
function formatStripeAmount(amount: number, currency: string): string {
  const zeroDecimal = ['jpy', 'krw', 'vnd', 'clp', 'isk'];
  const isZero = zeroDecimal.includes(currency.toLowerCase());
  const value = isZero ? amount : amount / 100;
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: currency.toUpperCase() }).format(value);
}

export function StripeConnectionTestDialog({ open, onOpenChange, result, loading }: Props) {
  const modeLabel = result?.mode === 'production' ? '本番 (LIVE)' : 'テスト (TEST)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Stripe 接続テスト結果
            {result && (
              <Badge variant={result.mode === 'production' ? 'destructive' : 'secondary'} className="ml-2 text-[10px]">
                {modeLabel}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            読み取り専用の Stripe API 呼び出しで認証情報を検証しています。課金・顧客作成などの破壊的操作は一切発生しません。
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Stripe API に問い合わせ中...</span>
          </div>
        )}

        {!loading && result && (
          <div className="space-y-4">
            {/* Top-level error (e.g. secret not configured) */}
            {result.error && (
              <div className="border-2 border-red-200 bg-red-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  テスト実行不可
                </p>
                <p className="text-xs text-red-600 mt-1">{result.error}</p>
              </div>
            )}

            {/* Overall summary */}
            {!result.error && (
              <div className={`rounded-lg p-3 border-2 ${result.success ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className={`text-sm font-semibold flex items-center gap-2 ${result.success ? 'text-green-700' : 'text-amber-700'}`}>
                  {result.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {result.success ? '全チェック合格 — Stripe 連携は正常に動作します。' : '一部のチェックが失敗しました。下記を確認してください。'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  実行日時: {new Date(result.testedAt).toLocaleString('ja-JP')}
                </p>
              </div>
            )}

            {/* 01. PUBLISHABLE KEY + SECRET KEY checks */}
            {!result.error && (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mt-2">
                    <KeyRound className="h-4 w-4 text-blue-500" />
                    01. PUBLISHABLE / SECRET KEY 検証
                  </h3>

                  <CheckRow title="Secret Key フォーマット" check={result.checks.secretKeyFormat} />
                  <CheckRow title="Publishable Key フォーマット" check={result.checks.publishableKeyFormat} />
                  <CheckRow title="キーペアの Live/Test 整合性" check={result.checks.keyPairConsistency} />

                  <CheckRow title="Stripe アカウント情報取得 (GET /v1/account)" check={result.checks.accountRetrieve}>
                    {result.checks.accountRetrieve.ok && (
                      <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                        {result.checks.accountRetrieve.accountId && (
                          <div className="bg-white border border-gray-100 rounded px-2 py-1">
                            <div className="text-gray-500">Account ID</div>
                            <div className="font-mono text-gray-800">{result.checks.accountRetrieve.accountId}</div>
                          </div>
                        )}
                        {result.checks.accountRetrieve.displayName && (
                          <div className="bg-white border border-gray-100 rounded px-2 py-1">
                            <div className="text-gray-500">アカウント名</div>
                            <div className="text-gray-800">{result.checks.accountRetrieve.displayName}</div>
                          </div>
                        )}
                        {result.checks.accountRetrieve.country && (
                          <div className="bg-white border border-gray-100 rounded px-2 py-1">
                            <div className="text-gray-500">国</div>
                            <div className="text-gray-800">{result.checks.accountRetrieve.country}</div>
                          </div>
                        )}
                        {result.checks.accountRetrieve.defaultCurrency && (
                          <div className="bg-white border border-gray-100 rounded px-2 py-1">
                            <div className="text-gray-500">既定通貨</div>
                            <div className="text-gray-800 uppercase">{result.checks.accountRetrieve.defaultCurrency}</div>
                          </div>
                        )}
                        <div className="bg-white border border-gray-100 rounded px-2 py-1">
                          <div className="text-gray-500">課金有効化</div>
                          <div className={result.checks.accountRetrieve.chargesEnabled ? 'text-green-700' : 'text-red-600'}>
                            {result.checks.accountRetrieve.chargesEnabled ? '✓ 有効' : '✗ 無効'}
                          </div>
                        </div>
                        <div className="bg-white border border-gray-100 rounded px-2 py-1">
                          <div className="text-gray-500">送金有効化</div>
                          <div className={result.checks.accountRetrieve.payoutsEnabled ? 'text-green-700' : 'text-red-600'}>
                            {result.checks.accountRetrieve.payoutsEnabled ? '✓ 有効' : '✗ 無効'}
                          </div>
                        </div>
                        <div className="bg-white border border-gray-100 rounded px-2 py-1 col-span-2">
                          <div className="text-gray-500">livemode フラグ</div>
                          <div className="text-gray-800">
                            {result.checks.accountRetrieve.livemode ? '本番 (live)' : 'テスト (test)'}
                          </div>
                        </div>
                      </div>
                    )}
                  </CheckRow>

                  <CheckRow title="残高取得 (GET /v1/balance)" check={result.checks.balanceRetrieve}>
                    {result.checks.balanceRetrieve.ok && result.checks.balanceRetrieve.available && result.checks.balanceRetrieve.available.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <Wallet className="h-3 w-3 text-gray-500" />
                        <span className="text-[11px] text-gray-600">利用可能残高:</span>
                        {result.checks.balanceRetrieve.available.map((b, i) => (
                          <span key={i} className="text-[11px] font-mono font-semibold text-gray-800">
                            {formatStripeAmount(b.amount, b.currency)}
                          </span>
                        ))}
                      </div>
                    )}
                  </CheckRow>
                </div>

                {/* 02. WEBHOOK SECRET checks */}
                <div className="space-y-2 pt-2">
                  <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mt-2">
                    <Webhook className="h-4 w-4 text-purple-500" />
                    02. WEBHOOK SECRET 検証
                  </h3>

                  <CheckRow title="Webhook Secret フォーマット" check={result.checks.webhookSecretFormat} />
                  <CheckRow title="HMAC-SHA256 署名自己テスト" check={result.checks.webhookSignatureSelfTest} />

                  <CheckRow title="Stripe 側 Webhook エンドポイント登録状況" check={result.checks.webhookEndpointRegistration}>
                    {result.checks.webhookEndpointRegistration.endpoints && result.checks.webhookEndpointRegistration.endpoints.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                          <FileSearch className="h-3 w-3" />
                          登録済みエンドポイント一覧:
                        </div>
                        {result.checks.webhookEndpointRegistration.endpoints.map((e, i) => (
                          <div key={i} className="bg-white border border-gray-100 rounded px-2 py-1.5">
                            <div className="font-mono text-[10px] text-gray-700 break-all">{e.url}</div>
                            <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                              <span className={e.status === 'enabled' ? 'text-green-700' : 'text-gray-500'}>
                                ● {e.status}
                              </span>
                              <span className="text-gray-500">購読イベント: {e.eventCount}件</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CheckRow>

                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-2 px-1">
                    ※ HMAC 自己テストは「Webhook Secret のフォーマットと当アプリの検証ロジックが正常」であることを保証しますが、
                    実際に Stripe から送られる Webhook が届くかは、Stripe Dashboard からテストイベントを送信することで確認できます。
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline" className="rounded-xl">
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
