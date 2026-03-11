'use client';

import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CreditCard, ShieldAlert, ExternalLink } from 'lucide-react';
import { Application, UserProfile } from '@/types';
import Link from 'next/link';

export default function AdminPaymentManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const applicationsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'applications'), orderBy('createdAt', 'desc'));
  }, [db]);
  const { data: applications, loading: appsLoading } = useCollection<Application>(applicationsQuery as any);

  if (authLoading || (profile && profile.role !== 'admin' && !authLoading)) {
    if (profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline">支払管理</h1>
          <p className="text-muted-foreground">全ユーザーの決済状況とサブスクリプションの管理</p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardHeader className="bg-primary/5">
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> 決済トランザクション</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead>機器</TableHead>
                <TableHead>金額</TableHead>
                <TableHead>タイプ</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="text-xs">{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium">{app.userName}</div>
                    <div className="text-[10px] text-muted-foreground">{app.userEmail}</div>
                  </TableCell>
                  <TableCell className="text-xs">{app.deviceType}</TableCell>
                  <TableCell className="font-bold">¥{app.payAmount?.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {app.payType === 'monthly' ? '月次' : '一括'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={app.status === 'completed' ? 'default' : 'secondary'}>
                      {app.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/applications`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
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
