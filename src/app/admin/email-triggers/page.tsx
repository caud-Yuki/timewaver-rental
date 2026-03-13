
'use client';

import { useMemo } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Zap, ShieldAlert, Mail, Settings2, Sparkles } from 'lucide-react';
import { EmailTemplate, UserProfile } from '@/types';
import { SYSTEM_TEMPLATES } from '@/lib/email-defaults';
import Link from 'next/link';

const TRIGGER_POINTS = [
  { id: 'application_submitted', name: '申込送信時', desc: 'ユーザーが申込を送信した時', sysId: 'sys_application_submitted' },
  { id: 'application_approved', name: '審査承認時', desc: '管理者が申請を承認した時', sysId: 'sys_application_approved' },
  { id: 'application_rejected', name: '審査却下時', desc: '管理者が申請を却却した時', sysId: 'sys_application_rejected' },
  { id: 'payment_completed', name: '決済完了時', desc: '支払いが正常に完了した時', sysId: 'sys_payment_completed' },
  { id: 'payment_failed', name: '決済失敗時', desc: '月次決済に失敗した時', sysId: 'sys_payment_failed' },
  { id: 'contract_expired', name: '契約終了時', desc: '契約期間が終了した時', sysId: 'sys_contract_expired' },
  { id: 'news_published', name: 'ニュース公開時', desc: '新しいお知らせを公開した時', sysId: 'sys_news_published' },
  { id: 'waitlist_device_available', name: '在庫確保時', desc: 'キャンセル待ち対象に空きが出た時', sysId: 'sys_waitlist_available' },
  { id: 'welcome_registration', name: '会員登録時', desc: '新規ユーザーが登録した時', sysId: 'sys_welcome_registration' },
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
  const { data: dbTemplates } = useCollection<EmailTemplate>(templatesQuery as any);

  const triggersQuery = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, 'emailTriggers');
  }, [db]);
  const { data: activeTriggers } = useCollection<any>(triggersQuery as any);

  const availableTemplates = useMemo(() => {
    const list = [...dbTemplates];
    SYSTEM_TEMPLATES.forEach(sys => {
      if (!dbTemplates.some(t => t.id === sys.id)) {
        list.push({ ...sys, name: `[標準] ${sys.name}` } as any);
      }
    });
    return list;
  }, [dbTemplates]);

  const handleUpdateTrigger = async (pointId: string, field: string, value: any) => {
    if (!db) return;
    
    const triggerId = pointId;
    const existing = activeTriggers.find((t: any) => t.triggerPoint === pointId);
    
    const triggerData = {
      triggerPoint: pointId,
      [field]: value,
      updatedAt: serverTimestamp(),
    };

    if (existing) {
      updateDoc(doc(db, 'emailTriggers', existing.id), triggerData)
        .then(() => toast({ title: "トリガーを更新しました" }));
    } else {
      setDoc(doc(db, 'emailTriggers', triggerId), {
        ...triggerData,
        createdAt: serverTimestamp(),
        enabled: field === 'enabled' ? value : false,
        templateId: field === 'templateId' ? value : '',
      })
        .then(() => toast({ title: "トリガーを設定しました" }));
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
                <TableHead className="text-center pr-8">有効</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRIGGER_POINTS.map((point) => {
                const trigger = activeTriggers.find((t: any) => t.triggerPoint === point.id);
                const currentTemplateId = trigger?.templateId;
                const isUsingSystemDefault = currentTemplateId?.startsWith('sys_') && !dbTemplates.some(t => t.id === currentTemplateId);

                return (
                  <TableRow key={point.id}>
                    <TableCell className="pl-8">
                      <div className="font-bold text-sm">{point.name}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{point.desc}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Select 
                          value={currentTemplateId || ''} 
                          onValueChange={(v) => handleUpdateTrigger(point.id, 'templateId', v)}
                        >
                          <SelectTrigger className="w-[240px] rounded-lg h-9 text-xs">
                            <SelectValue placeholder="未設定（送信されません）" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableTemplates.map(t => (
                              <SelectItem key={t.id} value={t.id}>
                                <div className="flex items-center gap-2">
                                  {t.id.startsWith('sys_') && <Sparkles className="h-3 w-3 text-primary" />}
                                  {t.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isUsingSystemDefault && (
                          <span className="text-[10px] text-blue-500 flex items-center gap-1">
                            <Sparkles className="h-2.5 w-2.5" /> システム標準
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center pr-8">
                      <Switch 
                        checked={trigger?.enabled || false} 
                        onCheckedChange={(checked) => handleUpdateTrigger(point.id, 'enabled', checked)}
                        disabled={!currentTemplateId}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
