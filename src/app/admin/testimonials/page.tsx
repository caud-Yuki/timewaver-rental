'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Loader2, MessageCircle, ShieldAlert } from 'lucide-react';
import { Testimonial, testimonialConverter, UserProfile } from '@/types';

const emptyForm: Partial<Testimonial> = {
  name: '', title: '', industry: '', comment: '',
  imageUrl: '', videoUrl: '', rating: 5, order: 0, isPublic: true,
};

export default function AdminTestimonialsPage() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const profileRef = useMemo(() => user ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const q = useMemo(
    () => query(collection(db, 'testimonials'), orderBy('order', 'asc')).withConverter(testimonialConverter),
    [db]
  );
  const { data: items, loading } = useCollection<Testimonial>(q as any);

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<Testimonial>>(emptyForm);
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
  const openEdit = (t: Testimonial) => { setCurrent(t); setOpen(true); };

  const handleSave = async () => {
    if (!current.name || !current.comment) {
      toast({ variant: 'destructive', title: '名前とコメントは必須です' });
      return;
    }
    setSaving(true);
    try {
      const data: any = {
        name: current.name, title: current.title || '', industry: current.industry || '',
        comment: current.comment, imageUrl: current.imageUrl || '', videoUrl: current.videoUrl || '',
        rating: current.rating || 5, order: current.order || 0, isPublic: current.isPublic ?? true,
        updatedAt: serverTimestamp(),
      };
      if (current.id) {
        await updateDoc(doc(db, 'testimonials', current.id), data);
        toast({ title: '更新しました' });
      } else {
        await addDoc(collection(db, 'testimonials'), { ...data, createdAt: serverTimestamp() });
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
    if (!confirm('この利用者の声を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'testimonials', id));
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
            <MessageCircle className="h-8 w-8 text-primary" />
            利用者の声
          </h1>
          <p className="text-muted-foreground text-sm">導入説明ページ（/about-twrental）に表示される口コミを管理します。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/landing"><Button variant="outline" className="rounded-xl">ランディングへ戻る</Button></Link>
          <Button onClick={openNew} className="rounded-xl"><PlusCircle className="h-4 w-4 mr-2" />新規追加</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.length === 0 ? (
            <div className="col-span-full text-center py-20 text-muted-foreground">
              まだ登録がありません。「新規追加」から最初の声を登録してください。
            </div>
          ) : (
            items.map((t) => (
              <Card key={t.id} className="border-none shadow-md rounded-2xl">
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={t.isPublic ? 'default' : 'outline'} className="text-[10px]">
                        {t.isPublic ? '公開中' : '非公開'}
                      </Badge>
                      {t.industry && <Badge variant="outline" className="text-[10px]">{t.industry}</Badge>}
                      <span className="text-xs text-muted-foreground">順序: {t.order || 0}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold">{t.name}</div>
                    {t.title && <div className="text-xs text-muted-foreground">{t.title}</div>}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-4">{t.comment}</p>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>お名前 *</Label>
                <Input value={current.name || ''} onChange={(e) => setCurrent({ ...current, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>肩書き</Label>
                <Input placeholder="セラピスト / 医師 等" value={current.title || ''} onChange={(e) => setCurrent({ ...current, title: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>業種</Label>
                <Input placeholder="医療 / ヒーラー / 法人 等" value={current.industry || ''} onChange={(e) => setCurrent({ ...current, industry: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>表示順</Label>
                <Input type="number" value={current.order || 0} onChange={(e) => setCurrent({ ...current, order: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>コメント *</Label>
              <Textarea rows={6} value={current.comment || ''} onChange={(e) => setCurrent({ ...current, comment: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>顔写真URL</Label>
              <Input placeholder="https://..." value={current.imageUrl || ''} onChange={(e) => setCurrent({ ...current, imageUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>動画埋め込みURL (YouTube embed形式)</Label>
              <Input placeholder="https://www.youtube.com/embed/..." value={current.videoUrl || ''} onChange={(e) => setCurrent({ ...current, videoUrl: e.target.value })} />
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
