'use client';

import { useUser, useFirestore, useCollection } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Waitlist, waitlistConverter } from '@/types';
import Link from 'next/link';

export default function MyWaitlistPage() {
  const { user } = useUser();
  const db = useFirestore();

  const waitlistQuery = user ? query(
    collection(db, 'waitlist').withConverter(waitlistConverter),
    where('userId', '==', user.uid),
    orderBy('createdAt', 'desc')
  ) : null;

  const { data: waitlist, loading, error } = useCollection<Waitlist>(waitlistQuery);

  const getStatusBadge = (status: Waitlist['status']) => {
    switch (status) {
      case 'waiting': return <Badge className="bg-orange-400 text-white">待機中</Badge>;
      case 'notified': return <Badge className="bg-blue-500 text-white">案内済み</Badge>;
      case 'scheduled': return <Badge className="bg-purple-500 text-white">案内予約</Badge>;
      case 'expired': return <Badge variant="secondary">期限切れ</Badge>;
      case 'converted': return <Badge className="bg-green-600 text-white">手続完了</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-8">
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => window.location.href = '/mypage'}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        マイページに戻る
      </Button>
      <div>
        <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
          <Clock className="h-8 w-8 text-primary" />
          キャンセル待ち状況
        </h1>
        <p className="text-muted-foreground mt-2">ご登録中のキャンセル待ち一覧です。空きが出次第、ご登録のメールアドレスにお知らせします。</p>
      </div>

      <Card className="border-none shadow-xl rounded-2xl overflow-hidden bg-white/80 backdrop-blur-sm">
        <CardContent className="p-0">
          {loading && (
            <div className="flex justify-center items-center py-24">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="text-center py-24 text-destructive">
              <AlertCircle className="mx-auto h-12 w-12 mb-4" />
              <p className="font-bold">エラーが発生しました</p>
              <p className="text-sm">データの読み込み中にエラーが発生しました。時間をおいて再試行してください。</p>
            </div>
          )}

          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70">
                  <TableHead className="p-5 pl-8">登録日時</TableHead>
                  <TableHead>対象機器</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right pr-8">詳細</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitlist && waitlist.length > 0 ? (
                  waitlist.map((item) => (
                    <TableRow key={item.id} className="border-t border-slate-200/80">
                      <TableCell className="pl-8 py-4 font-mono text-sm">
                        {item.createdAt && item.createdAt.toDate().toLocaleString('ja-JP')}
                      </TableCell>
                      <TableCell className="font-bold">{item.deviceType}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-right pr-8">
                        {item.deviceId && item.status === 'notified' ? (
                          <Link href={`/apply/new?deviceId=${item.deviceId}`} passHref>
                            <Badge variant='default' className='cursor-pointer'>申込へ進む</Badge>
                          </Link>
                        ) : (
                          <Badge variant='outline'>-</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-24 text-muted-foreground">
                      <p className="font-semibold">現在、キャンセル待ちに登録している機器はありません。</p>
                      <p className="text-sm mt-2">
                        <Link href="/devices" className="text-primary hover:underline">
                          機器一覧からレンタルしたい機器を探しましょう。
                        </Link>
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
