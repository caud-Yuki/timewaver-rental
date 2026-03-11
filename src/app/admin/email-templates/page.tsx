'use client';

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Edit, Mail, ShieldAlert, Code } from 'lucide-react';
import { EmailTemplate, UserProfile } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
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
  const { data: templates, loading: templatesLoading } = useCollection<EmailTemplate>(templatesQuery as any);

  const handleSaveTemplate = async () => {
    if (!db) return;
    const templateData = {
      ...currentTemplate,
      updatedAt: serverTimestamp(),
    };

    if (currentTemplate.id) {
      updateDoc(doc(db, 'emailTemplates', currentTemplate.id), templateData as any)
        .then(() => {
          toast({ title: "テンプレートを更新しました" });
          setIsEditing(false);
        });
    } else {
      addDoc(collection(db, 'emailTemplates'), {
        ...templateData,
        createdAt: serverTimestamp(),
      })
        .then(() => {
          toast({ title: "テンプレートを作成しました" });
          setIsEditing(false);
        });
    }
  };

  const handleDelete = async (id: string) => {
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
        <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><Mail className="h-8 w-8 text-primary" /> メールテンプレート管理</h1>
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
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>タイプ</TableHead>
                <TableHead>件名</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">{t.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground line-clamp-1 max-w-xs">{t.subject}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => { setCurrentTemplate(t); setIsEditing(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(t.id)}>
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
