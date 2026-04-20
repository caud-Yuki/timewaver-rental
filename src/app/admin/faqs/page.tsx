'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Loader2, HelpCircle, ShieldAlert } from 'lucide-react';
import { Faq, faqConverter, UserProfile } from '@/types';

const emptyForm: Partial<Faq> = { question: '', answer: '', order: 0, isPublic: true };

export default function AdminFaqsPage() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const profileRef = useMemo(() => user ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const q = useMemo(
    () => query(collection(db, 'faqs'), orderBy('order', 'asc')).withConverter(faqConverter),
    [db]
  );
  const { data: items, loading } = useCollection<Faq>(q as any);

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<Faq>>(emptyForm);
  const [saving, setSaving] = useState(false);

  if (profile && profile.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <ShieldAlert className="h-20 w-20 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold">アクセス制限</h1>
      </div>
    );
  }

  const openNew = () => { setCurrent(emptyForm); setOpen(true); };
  const openEdit = (f: Faq) => { setCurrent(f); setOpen(true); };

  const handleSave = async () => {
    if (!current.question || !current.answer) {
      toast({ variant: 'destructive', title: '質問と回答は必須です' });
      return;
    }
    setSaving(true);
    try {
      const data: any = {
        question: current.question, answer: current.answer,
        order: current.order || 0, isPublic: current.isPublic ?? true,
        updatedAt: serverTimestamp(),
      };
      if (current.id) {
        await updateDoc(doc(db, 'faqs', current.id), data);
        toast({ title: '更新しました' });
      } else {
        await addDoc(collection(db, 'faqs'), { ...data, createdAt: serverTimestamp() });
        toast({ title: '登録しました' });
      }
      setOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このFAQを削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'faqs', id));
      toast({ title: '削除しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <HelpCircle className="h-8 w-8 text-primary" />
            FAQ管理
          </h1>
          <p className="text-muted-foreground text-sm">導入説明ページ（/about-twrental）に表示されるFAQを管理します。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin"><Button variant="outline" className="rounded-xl">ダッシュボードへ</Button></Link>
          <Button onClick={openNew} className="rounded-xl"><PlusCircle className="h-4 w-4 mr-2" />新規追加</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">まだ登録がありません。</div>
          ) : (
            items.map((f) => (
              <Card key={f.id} className="border-none shadow-md rounded-2xl">
                <CardContent className="p-6 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={f.isPublic ? 'default' : 'outline'} className="text-[10px]">
                          {f.isPublic ? '公開中' : '非公開'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">順序: {f.order || 0}</span>
                      </div>
                      <div className="font-bold">{f.question}</div>
                      <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">{f.answer}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(f)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{current.id ? '編集' : '新規追加'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>質問 *</Label>
              <Input value={current.question || ''} onChange={(e) => setCurrent({ ...current, question: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>回答 *</Label>
              <Textarea rows={8} value={current.answer || ''} onChange={(e) => setCurrent({ ...current, answer: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>表示順</Label>
              <Input type="number" value={current.order || 0} onChange={(e) => setCurrent({ ...current, order: Number(e.target.value) })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <Label>公開する</Label>
              <Switch checked={current.isPublic ?? true} onCheckedChange={(c) => setCurrent({ ...current, isPublic: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
