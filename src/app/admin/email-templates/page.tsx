
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Edit, Mail, ShieldAlert, Code, Sparkles } from 'lucide-react';
import { EmailTemplate, UserProfile } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { SYSTEM_TEMPLATES, SystemTemplate } from '@/lib/email-defaults';
import Link from 'next/link';

export default function EmailTemplateManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<EmailTemplate>>({
    name: '',
    subject: '',
    body: '',
    type: 'general'
  });

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const templatesQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'emailTemplates'), orderBy('createdAt', 'desc'));
  }, [db]);
  const { data: dbTemplates, loading: templatesLoading } = useCollection<EmailTemplate>(templatesQuery as any);

  // Merge Firestore templates with defaults
  const allTemplates = useMemo(() => {
    const combined = [...dbTemplates];
    
    SYSTEM_TEMPLATES.forEach(sys => {
      const exists = dbTemplates.some(t => t.id === sys.id);
      if (!exists) {
        combined.push({
          ...sys,
          createdAt: { seconds: 0, nanoseconds: 0 } as any, // Mock timestamp for sorting
          updatedAt: { seconds: 0, nanoseconds: 0 } as any,
          isDefault: true
        } as any);
      }
    });

    return combined.sort((a, b) => {
      // System templates at bottom
      if (a.id.startsWith('sys_') && !b.id.startsWith('sys_')) return 1;
      if (!a.id.startsWith('sys_') && b.id.startsWith('sys_')) return -1;
      return 0;
    });
  }, [dbTemplates]);

  const handleSaveTemplate = async () => {
    if (!db) return;
    
    const templateId = currentTemplate.id || `custom_${Date.now()}`;
    const templateData = {
      ...currentTemplate,
      id: templateId,
      updatedAt: serverTimestamp(),
      createdAt: currentTemplate.createdAt || serverTimestamp(),
    };

    // Remove UI-only helper flag
    delete (templateData as any).isDefault;

    setDoc(doc(db, 'emailTemplates', templateId), templateData as any)
      .then(() => {
        toast({ title: "テンプレートを保存しました", description: templateId.startsWith('sys_') ? "システムデフォルトを上書き保存しました。" : "" });
        setIsEditing(false);
      });
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('sys_')) {
      toast({ variant: "destructive", title: "削除不可", description: "システムデフォルトテンプレートは削除できません。編集して上書きすることは可能です。" });
      return;
    }
    if (!db || !confirm('削除しますか？')) return;
    deleteDoc(doc(db, 'emailTemplates', id))
      .then(() => toast({ title: "削除しました" }));
  };

  if (authLoading || (profile && profile.role !== 'admin' && !authLoading)) {
    if (profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><Mail className="h-8 w-8 text-primary" /> メールテンプレート管理</h1>
          <p className="text-muted-foreground text-sm">システムからの自動送信メールの内容を編集します</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin">
            <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
          </Link>
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
            <DialogTrigger asChild>
              <Button className="rounded-xl" onClick={() => setCurrentTemplate({ name: '', subject: '', body: '', type: 'general' })}>
                <Plus className="h-4 w-4 mr-2" /> 新規テンプレート作成
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px]">
              <DialogHeader>
                <DialogTitle>{currentTemplate.id ? 'テンプレート編集' : '新規テンプレート作成'}</DialogTitle>
                <DialogDescription>
                  {currentTemplate.id?.startsWith('sys_') && "※システムデフォルトを編集しています。保存するとカスタム設定が優先されます。"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>テンプレート名</Label>
                    <Input value={currentTemplate.name} onChange={e => setCurrentTemplate({...currentTemplate, name: e.target.value})} placeholder="例: 申込受付完了" />
                  </div>
                  <div className="space-y-2">
                    <Label>タイプ</Label>
                    <Select value={currentTemplate.type} onValueChange={(v: any) => setCurrentTemplate({...currentTemplate, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="application">申請関連</SelectItem>
                        <SelectItem value="transaction">支払関連</SelectItem>
                        <SelectItem value="news">ニュース関連</SelectItem>
                        <SelectItem value="waiting">キャンセル待ち関連</SelectItem>
                        <SelectItem value="general">一般</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>件名</Label>
                  <Input value={currentTemplate.subject} onChange={e => setCurrentTemplate({...currentTemplate, subject: e.target.value})} placeholder="{{userName}}様、お申し込みありがとうございます" />
                </div>
                <div className="space-y-2">
                  <Label>本文</Label>
                  <Textarea rows={12} value={currentTemplate.body} onChange={e => setCurrentTemplate({...currentTemplate, body: e.target.value})} placeholder="変数は {{userName}}, {{deviceName}} などが使用可能です" />
                </div>
                <div className="bg-secondary/20 p-3 rounded-lg flex items-start gap-2">
                  <Code className="h-4 w-4 text-muted-foreground mt-1" />
                  <p className="text-[10px] text-muted-foreground">
                    利用可能な変数: <code>{"{{userName}}"}</code>, <code>{"{{userEmail}}"}</code>, <code>{"{{deviceName}}"}</code>, <code>{"{{serialNumber}}"}</code>, <code>{"{{rentalPeriod}}"}</code>, <code>{"{{payAmount}}"}</code>, <code>{"{{paymentLink}}"}</code>
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditing(false)}>キャンセル</Button>
                <Button onClick={handleSaveTemplate}>保存する</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary/5">
              <TableRow>
                <TableHead className="pl-8">テンプレート名</TableHead>
                <TableHead>タイプ</TableHead>
                <TableHead>件名</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTemplates.map(t => (
                <TableRow key={t.id} className={t.id.startsWith('sys_') ? "bg-muted/5" : ""}>
                  <TableCell className="pl-8 font-medium">
                    <div className="flex items-center gap-2">
                      {t.id.startsWith('sys_') && <Sparkles className="h-3 w-3 text-primary" />}
                      {t.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">{t.type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{t.subject}</TableCell>
                  <TableCell>
                    {(t as any).isDefault ? (
                      <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100 text-[10px]">システム標準</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[10px]">カスタム済み</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-8 space-x-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setCurrentTemplate(t); setIsEditing(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`h-8 w-8 rounded-lg ${t.id.startsWith('sys_') ? 'opacity-20 cursor-not-allowed' : 'text-destructive'}`} 
                      onClick={() => handleDelete(t.id)}
                      disabled={t.id.startsWith('sys_')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
