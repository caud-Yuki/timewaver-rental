
'use client';

import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CreditCard, ShieldAlert, ExternalLink, Calendar, User as UserIcon } from 'lucide-react';
import { Subscription, UserProfile } from '@/types';
import Link from 'next/link';

export default function AdminPaymentManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  // Focus on active subscriptions for management
  const subscriptionsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'subscriptions'), orderBy('createdAt', 'desc'));
  }, [db]);
  const { data: subscriptions, loading: subsLoading } = useCollection<Subscription>(subscriptionsQuery as any);

  if (authLoading || (profile && profile.role !== 'admin' && !authLoading)) {
    if (profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  const getRemainingMonths = (endAt: any) => {
    if (!endAt) return '-';
    const now = new Date();
    const end = new Date(endAt.seconds * 1000);
    const diff = end.getTime() - now.getTime();
    const months = Math.ceil(diff / (1000 * 60 * 60 * 24 * 30));
    return months > 0 ? `${months}ヶ月` : '期間終了';
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><CreditCard className="h-8 w-8 text-primary" /> 支払管理</h1>
          <p className="text-muted-foreground">全ユーザーのサブスクリプションと支払状況</p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardHeader className="bg-primary/5">
          <CardTitle className="flex items-center gap-2 text-lg">アクティブなサブスクリプション</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary/5">
              <TableRow>
                <TableHead className="pl-8">会員ID / ユーザー</TableHead>
                <TableHead>支払金額</TableHead>
                <TableHead>契約期間</TableHead>
                <TableHead>残り期間</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="pl-8">
                    <div className="flex flex-col">
                      <span className="font-mono text-[10px] text-muted-foreground">{sub.customerId}</span>
                      <span className="text-sm font-bold flex items-center gap-1"><UserIcon className="h-3 w-3" /> {sub.userId.substring(0, 8)}...</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold">¥{sub.payAmount.toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground">{sub.payType === 'monthly' ? '月次決済' : '一括決済'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-[10px]">
                      <Calendar className="h-3 w-3" />
                      {sub.startAt?.seconds ? new Date(sub.startAt.seconds * 1000).toLocaleDateString() : '-'} 
                      ~ 
                      {sub.endAt?.seconds ? new Date(sub.endAt.seconds * 1000).toLocaleDateString() : '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {getRemainingMonths(sub.endAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sub.status === 'active' ? 'default' : 'destructive'} className="text-[10px]">
                      {sub.status === 'active' ? '正常' : sub.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <Button variant="ghost" size="sm" className="h-8 rounded-lg" asChild>
                      <Link href={`/admin/applications`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {subscriptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                    アクティブな契約はありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
