
'use client';

import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Download } from 'lucide-react';
import { Application } from '@/types';
import { Button } from '@/components/ui/button';

export default function UserPaymentsPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();

  const paymentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'applications'),
      where('userId', '==', user.uid),
      where('status', '==', 'completed'),
      orderBy('updatedAt', 'desc')
    );
  }, [db, user]);

  const { data: payments, loading: paymentsLoading } = useCollection<Application>(paymentsQuery as any);

  if (authLoading || paymentsLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">支払履歴</h1>
        <p className="text-muted-foreground">過去の決済・契約更新の履歴</p>
      </div>

      <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-8">
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> 決済トランザクション</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary/5">
              <TableRow>
                <TableHead className="pl-8">日付</TableHead>
                <TableHead>対象機器</TableHead>
                <TableHead>支払金額</TableHead>
                <TableHead>支払方法</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">領収書</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-8 text-xs">{p.updatedAt?.seconds ? new Date(p.updatedAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                  <TableCell className="font-medium text-sm">{p.deviceType}</TableCell>
                  <TableCell className="font-bold">¥{p.payAmount?.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {p.payType === 'monthly' ? '月々払い' : '一括払い'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-500">決済完了</Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <Button variant="ghost" size="sm" className="h-8 rounded-lg">
                      <Download className="h-4 w-4 mr-1" /> PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                    決済履歴はありません
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
