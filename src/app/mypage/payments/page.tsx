
'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Receipt } from 'lucide-react';

export default function PaymentHistoryPage() {
  const { user } = useUser();
  const db = useFirestore();

  const applicationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'applications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [db, user]);

  const { data: applications, loading } = useCollection<any>(applicationsQuery as any);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-2xl">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-3xl font-bold font-headline">支払履歴</h1>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary/20">
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>項目</TableHead>
                <TableHead>金額</TableHead>
                <TableHead>支払方法</TableHead>
                <TableHead>ステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.filter((a: any) => a.status === 'completed' || a.status === 'payment_sent').map((app: any) => (
                <TableRow key={app.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="font-medium">
                    {app.deviceType} レンタル料
                  </TableCell>
                  <TableCell className="font-bold">
                    ¥{app.payAmount?.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {app.payType === 'monthly' ? '月々払い' : '一括払い'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={app.status === 'completed' ? 'default' : 'secondary'}>
                      {app.status === 'completed' ? '完了' : '処理中'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {applications.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20 text-muted-foreground">
                    現在、お支払い履歴はありません。
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
