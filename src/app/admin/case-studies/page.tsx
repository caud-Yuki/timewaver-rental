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
import { PlusCircle, Edit, Trash2, Loader2, Briefcase, ShieldAlert } from 'lucide-react';
import { CaseStudy, caseStudyConverter, UserProfile } from '@/types';

const emptyForm: Partial<CaseStudy> = {
  title: '', industry: '', client: '', summary: '', body: '', imageUrl: '', order: 0, isPublic: true,
};

export default function AdminCaseStudiesPage() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const profileRef = useMemo(() => user ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const q = useMemo(
    () => query(collection(db, 'caseStudies'), orderBy('order', 'asc')).withConverter(caseStudyConverter),
    [db]
  );
  const { data: items, loading } = useCollection<CaseStudy>(q as any);

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<CaseStudy>>(emptyForm);
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
  const openEdit = (c: CaseStudy) => { setCurrent(c); setOpen(true); };

  const handleSave = async () => {
    if (!current.title || !current.summary) {
      toast({ variant: 'destructive', title: 'タイトルと概要は必須です' });
      return;
    }
    setSaving(true);
    try {
      const data: any = {
        title: current.title, industry: current.industry || '', client: current.client || '',
        summary: current.summary, body: current.body || '', imageUrl: current.imageUrl || '',
        order: current.order || 0, isPublic: current.isPublic ?? true,
        updatedAt: serverTimestamp(),
      };
      if (current.id) {
        await updateDoc(doc(db, 'caseStudies', current.id), data);
        toast({ title: '更新しました' });
      } else {
        await addDoc(collection(db, 'caseStudies'), { ...data, createdAt: serverTimestamp() });
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
    if (!confirm('この導入事例を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'caseStudies', id));
      toast({ title: '削除しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Briefcase className="h-8 w-8 text-primary" />
            導入事例
          </h1>
          <p className="text-muted-foreground text-sm">導入説明ページ（/about-twrental）に表示される事例を管理します。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/landing"><Button variant="outline" className="rounded-xl">ランディングへ戻る</Button></Link>
          <Button onClick={openNew} className="rounded-xl"><PlusCircle className="h-4 w-4 mr-2" />新規追加</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.length === 0 ? (
            <div className="col-span-full text-center py-20 text-muted-foreground">まだ登録がありません。</div>
          ) : (
            items.map((c) => (
              <Card key={c.id} className="border-none shadow-md rounded-2xl">
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={c.isPublic ? 'default' : 'outline'} className="text-[10px]">
                        {c.isPublic ? '公開中' : '非公開'}
                      </Badge>
                      {c.industry && <Badge variant="outline" className="text-[10px]">{c.industry}</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                  <h3 className="font-bold">{c.title}</h3>
                  {c.client && <div className="text-xs text-muted-foreground">{c.client}</div>}
                  <p className="text-sm text-muted-foreground line-clamp-3">{c.summary}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{current.id ? '編集' : '新規追加'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>タイトル *</Label>
              <Input value={current.title || ''} onChange={(e) => setCurrent({ ...current, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>業種</Label>
                <Input value={current.industry || ''} onChange={(e) => setCurrent({ ...current, industry: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>クライアント名（任意）</Label>
                <Input value={current.client || ''} onChange={(e) => setCurrent({ ...current, client: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>概要（カード表示） *</Label>
              <Textarea rows={3} value={current.summary || ''} onChange={(e) => setCurrent({ ...current, summary: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>本文（詳細。任意）</Label>
              <Textarea rows={6} value={current.body || ''} onChange={(e) => setCurrent({ ...current, body: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>画像URL</Label>
              <Input placeholder="https://..." value={current.imageUrl || ''} onChange={(e) => setCurrent({ ...current, imageUrl: e.target.value })} />
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
