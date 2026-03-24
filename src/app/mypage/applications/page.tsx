'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter, 
  DialogDescription, 
  DialogClose 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, ShoppingCart, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { Application } from '@/types';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

const CancelApplicationModal = ({ application, onConfirm }: { application: Application; onConfirm: () => void }) => {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="text-destructive" />
          申請のキャンセル
        </DialogTitle>
        <DialogDescription>
          以下の申請を本当にキャンセルしますか？この操作は取り消せません。
        </DialogDescription>
      </DialogHeader>
      <div className="py-4 space-y-2">
        <div className="text-sm"><strong>申請ID:</strong> {application.id}</div>
        <div className="text-sm"><strong>機器:</strong> {application.deviceType}</div>
        <div className="text-sm"><strong>申請日:</strong> {application.createdAt?.seconds ? new Date(application.createdAt.seconds * 1000).toLocaleDateString() : '-'}</div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" className="rounded-lg">閉じる</Button>
        </DialogClose>
        <Button variant="destructive" className="rounded-lg" onClick={onConfirm}>キャンセルを実行</Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default function MyApplicationsPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isCancelling, setIsCancelling] = useState<string | null>(null);

  const applicationsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(db, 'applications'), 
      where('userId', '==', user.uid), 
      orderBy('createdAt', 'desc')
    );
  }, [user, db]);

  const { data: applications, loading: appsLoading, error } = useCollection<Application>(applicationsQuery as any);

  const handleCancelApplication = async (appId: string) => {
    if (!db) return;
    setIsCancelling(appId);
    try {
      await updateDoc(doc(db, 'applications', appId), {
        status: 'canceled',
        updatedAt: serverTimestamp(),
      });
      toast({ title: "申請をキャンセルしました", description: "申請が正常に取り消されました。" });
    } catch (error) {
      console.error("Error cancelling application: ", error);
      toast({ variant: "destructive", title: "エラー", description: "申請のキャンセル中にエラーが発生しました。" });
    } finally {
      setIsCancelling(null);
    }
  };

  if (authLoading || appsLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (error) {
    return <div className="text-destructive text-center py-10">エラー: データの読み込みに失敗しました。</div>;
  }

  return (
    <div className="space-y-8">
      <CardHeader className="px-0">
        <CardTitle className="font-headline text-3xl flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          申請履歴
        </CardTitle>
        <CardDescription>過去のレンタル申請と現在のステータスを確認できます。</CardDescription>
      </CardHeader>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5">申請日</TableHead>
                <TableHead>対象機器</TableHead>
                <TableHead>プラン</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications && applications.length > 0 ? (
                applications.map((app) => {
                  const canCancel = ['pending', 'approved'].includes(app.status);

                  const getStatusBadge = (status: Application['status']) => {
                    switch (status) {
                      case 'pending': return <Badge variant="secondary" className="bg-amber-100 text-amber-800">審査中</Badge>;
                      case 'approved': return <Badge variant="secondary" className="bg-blue-100 text-blue-800">承認済み</Badge>;
                      case 'rejected': return <Badge variant="destructive" className="bg-red-100">却下</Badge>;
                      case 'payment_sent': return <Badge variant="secondary" className="bg-purple-100 text-purple-800">決済待ち</Badge>;
                      case 'completed': return <Badge variant="default" className="bg-green-600">契約完了</Badge>;
                      case 'canceled': return <Badge variant="outline">キャンセル済</Badge>;
                      default: return <Badge variant="outline">{status}</Badge>;
                    }
                  };

                  return (
                    <TableRow key={app.id}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="font-medium">{app.deviceType} ({app.rentalType})</TableCell>
                      <TableCell>{app.rentalPeriod}ヶ月 / {app.payType === 'monthly' ? '月次' : '一括'}</TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell className="text-right pr-8">
                        {app.status === 'approved' && (
                           <Button size="sm" className="rounded-lg h-9 bg-primary hover:bg-primary/90" asChild>
                            <Link href={`/mypage/applications`}>契約に進む</Link>
                          </Button>
                        )}
                        {app.status === 'payment_sent' && app.paymentLinkId && (
                           <Button size="sm" className="rounded-lg h-9 bg-emerald-500 hover:bg-emerald-600" asChild>
                            <Link href={`/payment/${app.paymentLinkId}`}>支払いへ</Link>
                          </Button>
                        )}
                        {canCancel && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="rounded-lg h-9 text-destructive hover:text-destructive hover:bg-destructive/10">
                                {isCancelling === app.id ? <Loader2 className="animate-spin h-4 w-4" /> : 'キャンセル'}
                              </Button>
                            </DialogTrigger>
                            <CancelApplicationModal application={app} onConfirm={() => handleCancelApplication(app.id)} />
                          </Dialog>
                        )}
                        {app.status === 'completed' && (
                          <Button disabled variant="outline" size="sm" className="rounded-lg h-9">契約完了</Button>
                        )}
                         {(app.status === 'rejected' || app.status === 'canceled') && (
                          <Button disabled variant="ghost" size="sm" className="rounded-lg h-9">対応不要</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-24 text-muted-foreground italic">
                    申請履歴はありません。
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
