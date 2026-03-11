
'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ClipboardList, ArrowRight, ExternalLink } from 'lucide-react';
import { Application } from '@/types';
import Link from 'next/link';

export default function ApplicationsPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();

  const applicationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'applications'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [db, user]);

  const { data: applications, loading: appsLoading } = useCollection<Application>(applicationsQuery as any);

  if (authLoading || appsLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold font-headline">マイページ</h1>
          <p className="text-muted-foreground">レンタル申請状況の確認</p>
        </div>
        <Link href="/devices">
          <Button className="rounded-xl">新しい機器をレンタルする</Button>
        </Link>
      </div>

      <div className="flex border-b">
        <Link href="/mypage/devices">
          <Button variant="ghost" className="rounded-none px-8 text-muted-foreground">レンタル中の機器</Button>
        </Link>
        <Button variant="ghost" className="rounded-none px-8 text-primary border-b-2 border-primary">申請履歴</Button>
      </div>

      {applications.length === 0 ? (
        <Card className="border-dashed border-2 py-20 text-center space-y-4">
          <ClipboardList className="mx-auto h-16 w-16 text-muted-foreground opacity-20" />
          <h2 className="text-xl font-bold">申請履歴はありません</h2>
          <p className="text-muted-foreground max-w-xs mx-auto text-sm">
            現在、進行中のレンタル申請はありません。機器一覧からお好みのTimeWaverをお選びください。
          </p>
          <Link href="/devices" className="block">
            <Button variant="outline" className="rounded-xl">機器一覧を見る</Button>
          </Link>
        </Card>
      ) : (
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-secondary/10">
                <TableRow>
                  <TableHead className="pl-8">申請日</TableHead>
                  <TableHead>対象機器</TableHead>
                  <TableHead>プラン</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right pr-8">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="pl-8 text-xs">{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                    <TableCell className="font-medium text-sm">{app.deviceType}</TableCell>
                    <TableCell className="text-xs">
                      {app.rentalType}ヶ月 / {app.payType === 'monthly' ? '月次' : '一括'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={app.status === 'completed' ? 'default' : app.status === 'pending' ? 'secondary' : 'outline'} className="text-[10px]">
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      {app.status === 'payment_sent' && app.paymentLinkId && (
                        <Link href={`/payment/${app.paymentLinkId}`}>
                          <Button size="sm" className="h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600">
                            <ArrowRight className="h-3 w-3 mr-1" /> 決済する
                          </Button>
                        </Link>
                      )}
                      {app.status === 'completed' && (
                        <Link href="/mypage/devices">
                          <Button size="sm" variant="ghost" className="h-8 rounded-lg">
                            <ExternalLink className="h-3 w-3 mr-1" /> 詳細
                          </Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
