
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
import { Loader2, Plus, Trash2, Edit, Newspaper, ShieldAlert } from 'lucide-react';
import { News, UserProfile } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

export default function NewsManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [currentNews, setCurrentNews] = useState<Partial<News>>({
    title: '',
    body: '',
    status: 'draft'
  });

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const newsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'news'), orderBy('createdAt', 'desc'));
  }, [db]);
  const { data: newsItems, loading: newsLoading } = useCollection<News>(newsQuery as any);

  const handleSaveNews = async () => {
    if (!db) return;
    const newsData = {
      ...currentNews,
      updatedAt: serverTimestamp(),
      publishedAt: currentNews.status === 'published' ? serverTimestamp() : null,
    };

    if (currentNews.id) {
      updateDoc(doc(db, 'news', currentNews.id), newsData as any)
        .then(() => {
          toast({ title: "ニュースを更新しました" });
          setIsEditing(false);
        });
    } else {
      addDoc(collection(db, 'news'), {
        ...newsData,
        createdAt: serverTimestamp(),
      })
        .then(() => {
          toast({ title: "ニュースを作成しました" });
          setIsEditing(false);
        });
    }
  };

  const handleDelete = async (id: string) => {
    if (!db || !confirm('削除しますか？')) return;
    deleteDoc(doc(db, 'news', id))
      .then(() => toast({ title: "削除しました" }));
  };

  if (authLoading || (profile && profile.role !== 'admin' && !authLoading)) {
    if (profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><Newspaper className="h-8 w-8 text-primary" /> ニュース管理</h1>
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger asChild>
            <Button className="rounded-xl" onClick={() => setCurrentNews({ title: '', body: '', status: 'draft' })}>
              <Plus className="h-4 w-4 mr-2" /> 新規作成
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{currentNews.id ? 'ニュース編集' : '新規ニュース作成'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>タイトル</Label>
                <Input value={currentNews.title} onChange={e => setCurrentNews({...currentNews, title: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select value={currentNews.status} onValueChange={(v: any) => setCurrentNews({...currentNews, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">下書き</SelectItem>
                    <SelectItem value="published">公開</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>本文</Label>
                <Textarea rows={10} value={currentNews.body} onChange={e => setCurrentNews({...currentNews, body: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditing(false)}>キャンセル</Button>
              <Button onClick={handleSaveNews}>保存する</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>タイトル</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>公開日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newsItems.map(n => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell>
                    <Badge variant={n.status === 'published' ? 'default' : 'secondary'}>
                      {n.status === 'published' ? '公開中' : '下書き'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {n.publishedAt?.seconds ? new Date(n.publishedAt.seconds * 1000).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => { setCurrentNews(n); setIsEditing(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(n.id)}>
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
