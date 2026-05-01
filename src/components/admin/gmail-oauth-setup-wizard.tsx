'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { firebaseConfig } from '@/firebase/config';
import { saveSecrets, getSecretsStatus } from '@/lib/secret-actions';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

type Step = 'intro' | 'console' | 'paste' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const PROJECT_ID = firebaseConfig.projectId || 'studio-3681859885-cd9c1';
const REDIRECT_URI = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/gmailOAuthCallback`;
const CONSOLE_URL = `https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}`;

const CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/;
const CLIENT_SECRET_PATTERN = /^GOCSPX-[\w-]+$/;

export function GmailOAuthSetupWizard({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('intro');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedField, setCopiedField] = useState<'uri' | null>(null);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('intro');
        setClientId('');
        setClientSecret('');
        setBusy(false);
        setCopiedField(null);
      }, 200);
    }
  }, [open]);

  const copyToClipboard = async (text: string, field: 'uri') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'コピー失敗', description: 'クリップボードへのコピーに失敗しました。手動でコピーしてください。' });
    }
  };

  const idLooksValid = !clientId || CLIENT_ID_PATTERN.test(clientId.trim());
  const secretLooksValid = !clientSecret || CLIENT_SECRET_PATTERN.test(clientSecret.trim());
  const canSave =
    !!clientId.trim() &&
    !!clientSecret.trim() &&
    CLIENT_ID_PATTERN.test(clientId.trim()) &&
    CLIENT_SECRET_PATTERN.test(clientSecret.trim());

  const handleSave = async () => {
    setBusy(true);
    try {
      const result = await saveSecrets({
        gmailOAuthClientId: clientId.trim(),
        gmailOAuthClientSecret: clientSecret.trim(),
      });
      if (!result.success) {
        toast({
          variant: 'destructive',
          title: '保存に失敗しました',
          description: result.error || 'Secret Manager への保存でエラーが発生しました。',
        });
        return;
      }

      const status = await getSecretsStatus();
      if (!status.gmailOAuthClientId || !status.gmailOAuthClientSecret) {
        toast({
          variant: 'destructive',
          title: '検証に失敗しました',
          description: 'Secret は保存されましたが、読み取りができませんでした。Secret Manager の権限を確認してください。',
        });
        return;
      }

      setStep('done');
      onSuccess?.();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '予期しないエラー',
        description: err?.message || '保存処理中にエラーが発生しました。',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gmail OAuth クライアント セットアップ
          </DialogTitle>
          <DialogDescription>
            Gmail を送信元アカウントとして使うために、Google Cloud Console で OAuth 2.0 クライアントを 1 回だけ作成します。所要時間：約 3 分。
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 py-2">
          {(['intro', 'console', 'paste', 'done'] as Step[]).map((s, i) => {
            const order: Step[] = ['intro', 'console', 'paste', 'done'];
            const currentIdx = order.indexOf(step);
            const sIdx = order.indexOf(s);
            const isDone = sIdx < currentIdx;
            const isActive = sIdx === currentIdx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                    isDone
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-primary text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                {i < 3 && <div className={`h-0.5 w-8 ${isDone ? 'bg-green-500' : 'bg-gray-200'}`} />}
              </div>
            );
          })}
        </div>

        {step === 'intro' && (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
              <div className="font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                セットアップの流れ
              </div>
              <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
                <li>Google Cloud Console で OAuth 2.0 クライアントを作成（自動的に開きます）</li>
                <li>表示される Client ID と Client Secret をコピー</li>
                <li>このウィザードに貼り付けて保存</li>
              </ol>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-900">
              <div className="font-semibold mb-1">この設定は 1 回だけ必要です</div>
              <p>登録後は何件 Gmail アカウントを追加しても、Cloud Console に戻る必要はありません。すべてこの画面から OAuth で接続できます。</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
              <div className="font-semibold mb-1">前提条件</div>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Google Cloud プロジェクト <code className="px-1 bg-white rounded">{PROJECT_ID}</code> に Editor 以上の権限</li>
                <li>OAuth 同意画面が「内部」または「外部 → 公開」のいずれかで設定済み</li>
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button onClick={() => setStep('console')}>
                次へ
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'console' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Step 1: Google Cloud Console を開く
              </h3>
              <Button
                variant="outline"
                className="w-full justify-between rounded-xl"
                onClick={() => window.open(CONSOLE_URL, '_blank', 'noopener,noreferrer')}
              >
                <span className="flex items-center gap-2 text-sm">
                  <ExternalLink className="h-4 w-4" />
                  Credentials 画面を別タブで開く
                </span>
                <span className="text-xs text-muted-foreground">{PROJECT_ID}</span>
              </Button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-800 space-y-2">
              <div className="font-semibold text-sm">Step 2: OAuth クライアントを作成</div>
              <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                <li>画面上部の「+ CREATE CREDENTIALS」をクリック</li>
                <li>「OAuth client ID」を選択</li>
                <li>Application type で <strong>「Web application」</strong> を選択</li>
                <li>名前を入力（例：<code className="px-1 bg-white rounded">TWRENTAL Mail Sender</code>）</li>
                <li>下記の Redirect URI を「Authorized redirect URIs」に貼り付け：</li>
              </ol>
              <div className="mt-2 flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 font-mono text-[11px] break-all">
                <span className="flex-1">{REDIRECT_URI}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 flex-shrink-0"
                  onClick={() => copyToClipboard(REDIRECT_URI, 'uri')}
                >
                  {copiedField === 'uri' ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      コピーしました
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Copy className="h-3 w-3" />
                      コピー
                    </span>
                  )}
                </Button>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 leading-relaxed pt-2" start={6}>
                <li>「CREATE」を押すと、Client ID と Client Secret が表示されます</li>
                <li>両方を控えてから次へ進んでください（Client Secret は 1 度しか表示されません）</li>
              </ol>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('intro')}>
                戻る
              </Button>
              <Button onClick={() => setStep('paste')}>
                Client ID/Secret を入力する
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'paste' && (
          <div className="space-y-4 py-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Step 3: 認証情報を貼り付け
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="oauth-client-id">Client ID</Label>
              <Input
                id="oauth-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxxxxxxx-xxxxxx.apps.googleusercontent.com"
                disabled={busy}
                className={!idLooksValid ? 'border-red-300' : ''}
              />
              {!idLooksValid && (
                <p className="text-xs text-red-500">
                  形式が正しくありません（末尾は <code>.apps.googleusercontent.com</code> である必要があります）。
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oauth-client-secret">Client Secret</Label>
              <Input
                id="oauth-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                disabled={busy}
                className={!secretLooksValid ? 'border-red-300' : ''}
              />
              {!secretLooksValid && (
                <p className="text-xs text-red-500">
                  形式が正しくありません（<code>GOCSPX-</code> で始まる必要があります）。
                </p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              <div className="font-semibold text-gray-700 mb-1">保存先について</div>
              <p>入力した値は Google Cloud Secret Manager に暗号化保存され、ブラウザや Firestore には保存されません。</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('console')} disabled={busy}>
                戻る
              </Button>
              <Button onClick={handleSave} disabled={busy || !canSave}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                保存して完了
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 py-4">
            <div className="rounded-xl border border-green-100 bg-green-50 p-6 text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-green-500 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <div className="text-sm font-bold text-green-900">セットアップ完了</div>
              <p className="text-xs text-green-800 leading-relaxed">
                Gmail OAuth クライアントを Secret Manager に保存しました。
                <br />
                以降の Gmail アカウント追加はこの画面から OAuth ですべて完結します。
              </p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
              <div className="font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4" />
                次のステップ
              </div>
              <p>「+ アカウントを追加」 → 「Gmail（推奨）」 から最初の Gmail アドレスを接続してください。</p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                閉じる
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
