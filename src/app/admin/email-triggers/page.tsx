'use client';

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Zap, ShieldAlert, Mail, Settings2 } from 'lucide-react';
import { EmailTemplate, UserProfile } from '@/types';
import Link from 'next/link';

const TRIGGER_POINTS = [
  { id: 'application_submitted', name: '申込受付時', desc: 'ユーザーが新規申込を送信した直後' },
  { id: 'application_approved', name: '審査承認時', desc: '管理者が申請を承認した時' },
  { id: 'application_rejected', name: '審査却下時', desc: '管理者が申請を拒否した時' },
  { id: 'payment_link_created', name: '決済リンク発行時', desc: '個別の決済リンクが生成された時' },
  { id: 'payment_completed', name: '決済完了時', desc: '支払いが正常に完了した時' },
  { id: 'waitlist_device_available', name: 'キャンセル待ち在庫発生時', desc: '対象機器に空きが出た時' },
  { id: 'welcome_registration', name: '会員登録完了時', desc: '新規ユーザー登録時' },
];

export default function EmailTriggersPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const templatesQuery = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'emailTemplates');
  }, [db]);
  const { data: templates } = useCollection<EmailTemplate>(templatesQuery as any);

  const triggersQuery = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'emailTriggers');
  }, [db]);
  const { data: activeTriggers } = useCollection<any>(triggersQuery as any);

  const handleUpdateTrigger = async (pointId: string, field: string, value: any) => {
    if (!db) return;
    
    // Find existing trigger doc or update
    const existing = activeTriggers.find((t: any) => t.triggerPoint === pointId);
    
    if (existing) {
      updateDoc(doc(db, 'emailTriggers', existing.id), {
        [field]: value,
        updatedAt: serverTimestamp(),
      }).then(() => toast({ title: "トリガーを更新しました" }));
    } else {
      // In a real app, we'd use addDoc here if not existing, but for MVP we assume triggers are managed
      toast({ variant: "destructive", title: "トリガーの初期化が必要です" });
    }
  };

  if (authLoading || (profile && profile.role !== 'admin' && !authLoading)) {
    if (profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><Zap className="h-8 w-8 text-primary" /> メール自動トリガー設定</h1>
          <p className="text-muted-foreground">システムイベントとメールテンプレートの紐付け管理</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin">
            <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
          </Link>
          <Link href="/admin/email-templates">
            <Button variant="outline" className="rounded-xl"><Mail className="mr-2 h-4 w-4" /> テンプレート管理へ</Button>
          </Link>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary/10">
              <TableRow>
                <TableHead className="pl-8">イベント名称</TableHead>
                <TableHead>説明</TableHead>
                <TableHead>使用テンプレート</TableHead>
                <TableHead className="text-center">有効</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRIGGER_POINTS.map((point) => {
                const trigger = activeTriggers.find((t: any) => t.triggerPoint === point.id);
                return (
                  <TableRow key={point.id}>
                    <TableCell className="pl-8 font-bold text-sm">{point.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{point.desc}</TableCell>
                    <TableCell>
                      <Select 
                        value={trigger?.templateId || ''} 
                        onValueChange={(v) => handleUpdateTrigger(point.id, 'templateId', v)}
                      >
                        <SelectTrigger className="w-[200px] rounded-lg h-8 text-xs">
                          <SelectValue placeholder="未設定" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch 
                        checked={trigger?.enabled || false} 
                        onCheckedChange={(checked) => handleUpdateTrigger(point.id, 'enabled', checked)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex gap-4 items-start">
        <Settings2 className="h-6 w-6 text-amber-600 shrink-0" />
        <div className="text-sm text-amber-900">
          <p className="font-bold mb-1">ご注意</p>
          <p className="opacity-80">
            自動トリガーを有効にするには、必ず「使用テンプレート」を選択してください。<br />
            テンプレート内の変数は、トリガーイベントごとに自動的に置換されます。
          </p>
        </div>
      </div>
    </div>
  );
}
