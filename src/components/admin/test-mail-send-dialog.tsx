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
import { useUser } from '@/firebase';
import { useMailAccounts, type MailAccountRecord } from '@/hooks/use-mail-accounts';
import { Loader2, Send } from 'lucide-react';

interface Props {
  account: MailAccountRecord | null;
  onClose: () => void;
}

export function TestMailSendDialog({ account, onClose }: Props) {
  const { toast } = useToast();
  const { user } = useUser();
  const { test } = useMailAccounts();
  const [toEmail, setToEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (account) {
      setToEmail(user?.email || '');
    }
  }, [account, user]);

  const handleSend = async () => {
    if (!account || !toEmail) return;
    setBusy(true);
    try {
      const res = await test(account.id, toEmail);
      toast({
        title: 'テスト送信を実行しました',
        description: `${toEmail} 宛に送信しました（${res.provider}）。受信ボックスをご確認ください。`,
      });
      onClose();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '送信に失敗しました',
        description: err?.message || 'テスト送信に失敗しました。',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!account} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            テスト送信
          </DialogTitle>
          <DialogDescription>
            {account ? `${account.email} から指定アドレスに 1 通送信します。` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="test-to-email">送信先メールアドレス</Label>
            <Input
              id="test-to-email"
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              disabled={busy}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button onClick={handleSend} disabled={busy || !toEmail}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            テスト送信
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
