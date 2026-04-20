'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useFirestore, useCollection, useUser, useDoc } from '@/firebase';
import {
  collection, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Rocket, Trash2, Mail, ShieldAlert } from 'lucide-react';
import { EarlyBooking, earlyBookingConverter, UserProfile, EarlyBookingStatus } from '@/types';

const STATUS_LABEL: Record<EarlyBookingStatus, { label: string; color: string }> = {
  new: { label: '新規', color: 'bg-blue-500' },
  contacted: { label: '連絡済', color: 'bg-amber-500' },
  converted: { label: '成約', color: 'bg-green-500' },
  closed: { label: 'クローズ', color: 'bg-gray-400' },
};

export default function AdminEarlyBookingsPage() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const profileRef = useMemo(() => user ? doc(db, 'users', user.uid) : null, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const q = useMemo(
    () => query(collection(db, 'earlyBookings'), orderBy('createdAt', 'desc')).withConverter(earlyBookingConverter),
    [db]
  );
  const { data: items, loading } = useCollection<EarlyBooking>(q as any);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (profile && profile.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <ShieldAlert className="h-20 w-20 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold">アクセス制限</h1>
      </div>
    );
  }

  const handleStatus = async (id: string, status: EarlyBookingStatus) => {
    setBusyId(id);
    try {
      await updateDoc(doc(db, 'earlyBookings', id), { status, updatedAt: serverTimestamp() });
      toast({ title: 'ステータスを更新しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この予約を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'earlyBookings', id));
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
            <Rocket className="h-8 w-8 text-primary" />
            先行予約一覧
          </h1>
          <p className="text-muted-foreground text-sm">先行予約モードON時に /early-booking から登録されたリードを管理します。</p>
        </div>
        <Link href="/admin"><Button variant="outline" className="rounded-xl">ダッシュボードへ</Button></Link>
      </div>

      <Card className="border-none shadow-lg rounded-2xl">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">まだ登録がありません。</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>申込日時</TableHead>
                  <TableHead>お名前</TableHead>
                  <TableHead>連絡先</TableHead>
                  <TableHead>希望機器</TableHead>
                  <TableHead>メッセージ</TableHead>
                  <TableHead>フォロー送信</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs">
                      {b.createdAt && 'seconds' in b.createdAt ? new Date(b.createdAt.seconds * 1000).toLocaleString('ja-JP') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{b.name}</div>
                      {b.companyName && <div className="text-xs text-muted-foreground">{b.companyName}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{b.email}</div>
                      {b.phone && <div className="text-muted-foreground">{b.phone}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{b.desiredDevice || '-'}</TableCell>
                    <TableCell className="max-w-[220px] text-xs text-muted-foreground line-clamp-2">{b.message || '-'}</TableCell>
                    <TableCell>
                      {b.followUpSentAt && 'seconds' in b.followUpSentAt ? (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Mail className="h-3 w-3" />送信済
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">未送信</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={b.status}
                        onValueChange={(v) => handleStatus(b.id, v as EarlyBookingStatus)}
                        disabled={busyId === b.id}
                      >
                        <SelectTrigger className="h-8 w-[110px]">
                          <SelectValue>
                            <Badge className={`${STATUS_LABEL[b.status].color} text-white text-[10px]`}>
                              {STATUS_LABEL[b.status].label}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as EarlyBookingStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABEL[s].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
