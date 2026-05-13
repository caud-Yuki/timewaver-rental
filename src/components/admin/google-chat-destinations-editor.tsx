'use client';

import { useState } from 'react';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Send, Loader2, Edit2, Check, X, CheckCircle2, XCircle, Lock } from 'lucide-react';
import type { GoogleChatDestination } from '@/types';
import {
  saveGoogleChatDestinationUrl,
  deleteGoogleChatDestinationUrl,
  testGoogleChatDestination,
} from '@/lib/secret-actions';

function generateDestinationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}${rand}`;
}

interface Props {
  destinations: GoogleChatDestination[];
  onChange: (next: GoogleChatDestination[]) => void;
}

export function GoogleChatDestinationsEditor({ destinations, onChange }: Props) {
  const db = useFirestore();
  const { toast } = useToast();
  const settingsRef = doc(db, 'settings', 'global');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const persistMetadata = async (next: GoogleChatDestination[]) => {
    onChange(next);
    await updateDoc(settingsRef, { googleChatDestinations: next, updatedAt: serverTimestamp() } as any);
  };

  const handleAdd = () => {
    const id = generateDestinationId();
    setEditingId(id);
    setDraftLabel('');
    setDraftUrl('');
    onChange([...destinations, { id, label: '', enabled: true, hasUrl: false }]);
  };

  const handleStartEdit = (dest: GoogleChatDestination) => {
    setEditingId(dest.id);
    setDraftLabel(dest.label);
    setDraftUrl(''); // Never reveal the stored URL — leave blank, admin types to replace
  };

  const handleCancelEdit = (dest: GoogleChatDestination) => {
    setEditingId(null);
    setDraftLabel('');
    setDraftUrl('');
    // If this destination was newly added but never saved, drop it.
    if (!dest.label && !dest.hasUrl) {
      onChange(destinations.filter((d) => d.id !== dest.id));
    }
  };

  const handleSaveEdit = async (dest: GoogleChatDestination) => {
    const label = draftLabel.trim();
    if (!label) {
      toast({ variant: 'destructive', title: 'ラベルを入力してください' });
      return;
    }
    setSavingId(dest.id);
    try {
      // If admin typed a URL, push it to Secret Manager.
      let hasUrl = dest.hasUrl;
      if (draftUrl.trim()) {
        const result = await saveGoogleChatDestinationUrl(dest.id, draftUrl.trim());
        if (!result.success) {
          toast({ variant: 'destructive', title: 'URL保存エラー', description: result.error });
          setSavingId(null);
          return;
        }
        hasUrl = true;
      }
      if (!hasUrl) {
        toast({ variant: 'destructive', title: 'Webhook URL が必要です', description: '初回登録時は URL を入力してください。' });
        setSavingId(null);
        return;
      }
      const next = destinations.map((d) => d.id === dest.id ? { ...d, label, hasUrl } : d);
      await persistMetadata(next);
      setEditingId(null);
      setDraftLabel('');
      setDraftUrl('');
      toast({ title: '保存しました', description: `「${label}」を更新しました。` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleEnabled = async (dest: GoogleChatDestination, enabled: boolean) => {
    const next = destinations.map((d) => d.id === dest.id ? { ...d, enabled } : d);
    await persistMetadata(next);
  };

  const handleDelete = async (dest: GoogleChatDestination) => {
    if (!window.confirm(`通知先「${dest.label || '(未設定)'}」を削除しますか？\nSecret Manager 上の Webhook URL も削除されます。`)) return;
    try {
      if (dest.hasUrl) {
        await deleteGoogleChatDestinationUrl(dest.id);
      }
      const next = destinations.filter((d) => d.id !== dest.id);
      await persistMetadata(next);
      toast({ title: '削除しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    }
  };

  const handleTest = async (dest: GoogleChatDestination, overrideUrl?: string) => {
    setTestingId(dest.id);
    try {
      const result = await testGoogleChatDestination({
        destinationId: overrideUrl ? undefined : dest.id,
        webhookUrl: overrideUrl,
        message: `✅ TimeWaverHub テスト送信: ${dest.label || '(未保存)'}`,
      });
      if (result.success) {
        toast({ title: 'テスト送信成功', description: `「${dest.label || '(未保存)'}」に送信しました。` });
      } else {
        toast({ variant: 'destructive', title: 'テスト送信失敗', description: result.error });
      }
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Google Chat 通知先</h3>
        <div className="flex items-center gap-1.5">
          <Lock className="h-3 w-3 text-green-600" />
          <span className="text-[11px] text-green-600 font-medium">Webhook URL は Secret Manager に保存されます</span>
        </div>
      </div>

      {destinations.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center text-sm text-muted-foreground">
          まだ通知先が登録されていません。<br />
          下の「+ 新規通知先を追加」から最初の Webhook を登録してください。
        </div>
      ) : (
        <div className="space-y-3">
          {destinations.map((dest) => {
            const isEditing = editingId === dest.id;
            const isSaving = savingId === dest.id;
            const isTesting = testingId === dest.id;
            return (
              <div
                key={dest.id}
                className={`rounded-2xl border p-4 space-y-3 ${dest.enabled ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50/80 opacity-70'}`}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">表示ラベル <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="例: TimeWaver 管理者通知 #general"
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-2">
                        Webhook URL
                        {dest.hasUrl && (
                          <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">設定済み（変更時のみ入力）</span>
                        )}
                      </Label>
                      <Input
                        type="password"
                        placeholder={dest.hasUrl ? '●●●●●●●● (変更する場合のみ入力)' : 'https://chat.googleapis.com/v1/spaces/...'}
                        value={draftUrl}
                        onChange={(e) => setDraftUrl(e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Google Chat の対象スペースで「Webhook の管理」から発行した URL を貼り付けてください。
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {draftUrl.trim().startsWith('https://chat.googleapis.com/') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isTesting}
                          onClick={() => handleTest(dest, draftUrl.trim())}
                        >
                          {isTesting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                          入力中URLでテスト送信
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleCancelEdit(dest)}>
                        <X className="h-3.5 w-3.5 mr-1" />キャンセル
                      </Button>
                      <Button size="sm" onClick={() => handleSaveEdit(dest)} disabled={isSaving}>
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                        保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{dest.label || <span className="text-muted-foreground italic">未設定</span>}</span>
                        {dest.hasUrl ? (
                          <Badge className="bg-green-500 hover:bg-green-600 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />URL設定済</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200"><XCircle className="h-3 w-3 mr-1" />URL未設定</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] font-mono">{dest.id}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={dest.enabled}
                        onCheckedChange={(c) => handleToggleEnabled(dest, c)}
                        aria-label={dest.enabled ? '無効化' : '有効化'}
                      />
                      <span className="text-[10px] text-muted-foreground w-10">{dest.enabled ? '有効' : '無効'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!dest.hasUrl || isTesting}
                        onClick={() => handleTest(dest)}
                      >
                        {isTesting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                        テスト送信
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => handleStartEdit(dest)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => handleDelete(dest)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button onClick={handleAdd} variant="outline" className="rounded-xl w-full" disabled={!!editingId}>
        <Plus className="h-4 w-4 mr-2" />新規通知先を追加
      </Button>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        ※ 各イベントが Google Chat に通知される際、ここで <strong>有効</strong> になっている全宛先へブロードキャストされます。
        個別イベントの送信先は <a href="/admin/email-triggers" className="text-primary underline">メールトリガー管理</a> で指定できます。
      </p>
    </div>
  );
}
