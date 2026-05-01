'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Mail,
  Plus,
  Star,
  Send,
  RefreshCw,
  Trash2,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { useMailAccounts, type MailAccountRecord } from '@/hooks/use-mail-accounts';
import { AddMailAccountDialog } from './add-mail-account-dialog';
import { TestMailSendDialog } from './test-mail-send-dialog';

function StatusBadge({ status }: { status: MailAccountRecord['status'] }) {
  const map: Record<MailAccountRecord['status'], { label: string; className: string }> = {
    active: { label: '有効', className: 'bg-green-500 hover:bg-green-600 text-white' },
    pending_oauth: { label: '認証中', className: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
    unauthorized: { label: '要再認証', className: 'bg-red-500 hover:bg-red-600 text-white' },
    revoked: { label: '解除済み', className: 'bg-gray-400 hover:bg-gray-500 text-white' },
  };
  const m = map[status];
  return <Badge className={`${m.className} text-xs`}>{m.label}</Badge>;
}

function ProviderBadge({ provider }: { provider: MailAccountRecord['provider'] }) {
  return (
    <Badge variant="outline" className="text-xs">
      {provider === 'gmail_oauth' ? 'Gmail' : 'SMTP'}
    </Badge>
  );
}

export function MailSettings() {
  const { toast } = useToast();
  const {
    accounts,
    loading,
    error,
    refetch,
    remove,
    setDefault,
    revokeGmail,
    startGmailOAuth,
  } = useMailAccounts();

  const [addOpen, setAddOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<MailAccountRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MailAccountRecord | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<MailAccountRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleSetDefault = async (acc: MailAccountRecord) => {
    setBusyId(acc.id);
    try {
      await setDefault(acc.id);
      toast({ title: '既定を更新しました', description: `${acc.email} を既定の送信元に設定しました。` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'エラー', description: err?.message || '設定に失敗しました。' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      await remove(confirmDelete.id);
      toast({ title: '削除しました', description: `${confirmDelete.email} を削除しました。` });
      setConfirmDelete(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'エラー', description: err?.message || '削除に失敗しました。' });
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async () => {
    if (!confirmRevoke) return;
    setBusyId(confirmRevoke.id);
    try {
      await revokeGmail(confirmRevoke.id);
      toast({ title: '解除しました', description: `${confirmRevoke.email} の認証を解除しました。` });
      setConfirmRevoke(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'エラー', description: err?.message || '解除に失敗しました。' });
    } finally {
      setBusyId(null);
    }
  };

  const handleReauth = async (acc: MailAccountRecord) => {
    setBusyId(acc.id);
    try {
      const { authUrl } = await startGmailOAuth({ accountId: acc.id });
      window.open(authUrl, '_blank', 'width=540,height=720,noopener=no');
      toast({ title: '認証画面を開きました', description: 'ポップアップで Google 認証を完了してください。' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'エラー', description: err?.message || '認証開始に失敗しました。' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-none shadow-lg rounded-2xl bg-white">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
            <Mail className="h-5 w-5" />
            送信元メールアドレス
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            自動メール送信に使われる送信元アドレスを管理します。Gmail OAuth または SMTP で複数のアドレスを登録できます。
          </p>
        </div>
        <Button
          className="rounded-xl"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          アカウントを追加
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">読み込みに失敗しました</div>
              <div className="text-xs">{error}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            読み込み中…
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-muted-foreground">
            <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-gray-300" />
            <div className="font-medium text-gray-700 mb-1">送信元アドレスがまだ登録されていません</div>
            <div className="text-xs mb-4">
              「+ アカウントを追加」から最初のアドレスを設定してください。
              <br />
              設定が完了するまで自動メール送信は停止します。
            </div>
          </div>
        ) : (
          accounts.map((acc) => {
            const isBusy = busyId === acc.id;
            return (
              <div
                key={acc.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl bg-gray-50/80 border border-gray-100"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{acc.displayName || acc.email}</span>
                    <ProviderBadge provider={acc.provider} />
                    <StatusBadge status={acc.status} />
                    {acc.isDefault && (
                      <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        既定
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">{acc.email || '（認証中）'}</div>
                  {acc.lastError && (
                    <div className="text-xs text-red-500 mt-1 truncate">直近エラー: {acc.lastError}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {acc.status === 'active' && !acc.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      disabled={isBusy}
                      onClick={() => handleSetDefault(acc)}
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />
                      既定にする
                    </Button>
                  )}
                  {acc.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      disabled={isBusy}
                      onClick={() => setTestTarget(acc)}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      テスト送信
                    </Button>
                  )}
                  {acc.provider === 'gmail_oauth' && acc.status !== 'pending_oauth' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        disabled={isBusy}
                        onClick={() => handleReauth(acc)}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        再認証
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-amber-600 hover:text-amber-700"
                        disabled={isBusy}
                        onClick={() => setConfirmRevoke(acc)}
                      >
                        解除
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg text-red-500 hover:text-red-600"
                    disabled={isBusy}
                    onClick={() => setConfirmDelete(acc)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    削除
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <AddMailAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={refetch}
      />

      <TestMailSendDialog
        account={testTarget}
        onClose={() => setTestTarget(null)}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>送信元を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.email} を削除します。このアカウント経由で送信予定のメールがある場合、停止することがあります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={!!busyId} className="bg-red-500 hover:bg-red-600">
              {busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRevoke} onOpenChange={(v) => !v && setConfirmRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gmail 認証を解除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRevoke?.email} の OAuth トークンを取り消します。再度送信したい場合は「再認証」が必要です。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={!!busyId}>
              {busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : '解除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
