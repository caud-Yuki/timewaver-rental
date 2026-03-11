
'use client';

import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Clock, Trash2, Mail, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Waitlist, UserProfile } from '@/types';
import Link from 'next/link';

export default function WaitlistManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const waitlistQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'waitlist'), orderBy('createdAt', 'asc'));
  }, [db]);
  const { data: list, loading: listLoading } = useCollection<Waitlist>(waitlistQuery as any);

  const handleDelete = async (id: string) => {
    if (!db || !confirm('削除しますか？')) return;
    deleteDoc(doc(db, 'waitlist', id)).then(() => toast({ title: "削除しました" }));
  };

  const handleNotify = async (item: Waitlist) => {
    if (!db) return;
    updateDoc(doc(db, 'waitlist', item.id), { status: 'notified' }).then(() => {
      toast({ title: "通知済みに更新しました", description: `${item.userName}さんに案内を送信した旨を記録しました。` });
    });
  };

  if (authLoading || (profile && profile.role !== 'admin' && !authLoading)) {
    if (profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><Clock className="h-8 w-8 text-primary" /> キャンセル待ち管理</h1>
          <p className="text-muted-foreground">在庫待ちのユーザー一覧と通知状況</p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-8">登録日</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead>希望機器</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-8 text-xs">{item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium">{item.userName}</div>
                    <div className="text-[10px] text-muted-foreground">{item.userEmail}</div>
                  </TableCell>
                  <TableCell className="font-bold">{item.deviceType}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === 'notified' ? 'default' : 'secondary'}>
                      {item.status === 'notified' ? '通知済み' : '待機中'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8 space-x-2">
                    <Button variant="ghost" size="sm" className="text-primary" onClick={() => handleNotify(item)} disabled={item.status === 'notified'}>
                      <Mail className="h-4 w-4 mr-1" /> 通知する
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">キャンセル待ちのユーザーはいません</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
