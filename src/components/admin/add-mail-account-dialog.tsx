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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useMailAccounts } from '@/hooks/use-mail-accounts';
import { Loader2, Mail, Server, ArrowLeft } from 'lucide-react';

type Step = 'choose' | 'gmail' | 'smtp';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddMailAccountDialog({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const { startGmailOAuth, createSmtp } = useMailAccounts();

  const [step, setStep] = useState<Step>('choose');
  const [busy, setBusy] = useState(false);

  // Gmail
  const [gmailDisplayName, setGmailDisplayName] = useState('');

  // SMTP
  const [smtpDisplayName, setSmtpDisplayName] = useState('');
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpDefault, setSmtpDefault] = useState(false);

  useEffect(() => {
    if (!open) {
      // reset on close
      setTimeout(() => {
        setStep('choose');
        setGmailDisplayName('');
        setSmtpDisplayName('');
        setSmtpEmail('');
        setSmtpFromName('');
        setSmtpHost('');
        setSmtpPort('587');
        setSmtpSecure(false);
        setSmtpUser('');
        setSmtpPass('');
        setSmtpDefault(false);
        setBusy(false);
      }, 150);
    }
  }, [open]);

  const handleGmailStart = async () => {
    setBusy(true);
    try {
      const { authUrl } = await startGmailOAuth({
        displayName: gmailDisplayName || undefined,
      });
      window.open(authUrl, '_blank', 'width=540,height=720,noopener=no');
      toast({
        title: '認証画面を開きました',
        description: 'ポップアップで Google アカウントを選択してください。完了後、リストを更新します。',
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'エラー',
        description: err?.message || '認証開始に失敗しました。',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSmtpSubmit = async () => {
    if (!smtpDisplayName || !smtpEmail || !smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      toast({ variant: 'destructive', title: '入力不足', description: '必須項目をすべて入力してください。' });
      return;
    }
    const port = Number(smtpPort);
    if (Number.isNaN(port) || port <= 0) {
      toast({ variant: 'destructive', title: '入力エラー', description: 'port は正の数値で入力してください。' });
      return;
    }
    setBusy(true);
    try {
      await createSmtp({
        displayName: smtpDisplayName,
        email: smtpEmail,
        host: smtpHost,
        port,
        secure: smtpSecure,
        username: smtpUser,
        password: smtpPass,
        fromName: smtpFromName || undefined,
        setAsDefault: smtpDefault,
      });
      toast({ title: '追加しました', description: `${smtpEmail} を SMTP アカウントとして登録しました。` });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '追加に失敗しました',
        description: err?.message || 'SMTP の検証に失敗しました。',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== 'choose' && (
              <button
                type="button"
                onClick={() => setStep('choose')}
                className="p-1 -ml-1 hover:bg-gray-100 rounded-md"
                disabled={busy}
                aria-label="戻る"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            送信元アカウントを追加
          </DialogTitle>
          <DialogDescription>
            {step === 'choose' && 'プロバイダを選択してください。'}
            {step === 'gmail' && 'Gmail アカウントへ Google OAuth で接続します。'}
            {step === 'smtp' && 'SMTP サーバーの接続情報を入力してください。'}
          </DialogDescription>
        </DialogHeader>

        {step === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
            <button
              type="button"
              onClick={() => setStep('gmail')}
              className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-primary/5 transition"
            >
              <Mail className="h-8 w-8 text-primary" />
              <div className="font-semibold text-sm">Gmail（推奨）</div>
              <div className="text-xs text-muted-foreground text-center">
                Google アカウントで OAuth 認証
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStep('smtp')}
              className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-primary/5 transition"
            >
              <Server className="h-8 w-8 text-primary" />
              <div className="font-semibold text-sm">SMTP</div>
              <div className="text-xs text-muted-foreground text-center">
                Outlook / Yahoo / 自社 SMTP など
              </div>
            </button>
          </div>
        )}

        {step === 'gmail' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="gmail-display-name">表示名（任意）</Label>
              <Input
                id="gmail-display-name"
                placeholder="例: 運営事務局メール"
                value={gmailDisplayName}
                onChange={(e) => setGmailDisplayName(e.target.value)}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                未入力の場合、認証完了時の Gmail アドレスがそのまま表示名になります。
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
              ボタンを押すとポップアップで Google 認証画面が開きます。Gmail スコープ（送信のみ）を許可してください。
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                キャンセル
              </Button>
              <Button onClick={handleGmailStart} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Google で認証する
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'smtp' && (
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-display-name">表示名 *</Label>
                <Input
                  id="smtp-display-name"
                  value={smtpDisplayName}
                  onChange={(e) => setSmtpDisplayName(e.target.value)}
                  disabled={busy}
                  placeholder="例: 運営事務局"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-email">送信元メール *</Label>
                <Input
                  id="smtp-email"
                  type="email"
                  value={smtpEmail}
                  onChange={(e) => setSmtpEmail(e.target.value)}
                  disabled={busy}
                  placeholder="info@example.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-name">FROM 表示名（任意）</Label>
              <Input
                id="smtp-from-name"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
                disabled={busy}
                placeholder="例: TimeWaverHub サポート"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="smtp-host">SMTP ホスト *</Label>
                <Input
                  id="smtp-host"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  disabled={busy}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">ポート *</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  disabled={busy}
                  placeholder="587"
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <div>
                <div className="text-sm font-medium">SSL/TLS（secure）</div>
                <div className="text-xs text-muted-foreground">通常: 465 → ON、587/25 → OFF（STARTTLS）</div>
              </div>
              <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} disabled={busy} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user">ユーザー名 *</Label>
                <Input
                  id="smtp-user"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-pass">パスワード *</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <div>
                <div className="text-sm font-medium">既定の送信元として設定</div>
                <div className="text-xs text-muted-foreground">他の送信元から自動で切り替わります。</div>
              </div>
              <Switch checked={smtpDefault} onCheckedChange={setSmtpDefault} disabled={busy} />
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                キャンセル
              </Button>
              <Button onClick={handleSmtpSubmit} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                検証して保存
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
