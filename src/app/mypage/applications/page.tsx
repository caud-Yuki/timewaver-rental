'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Loader2, ClipboardList, ArrowRight, ExternalLink, XCircle } from 'lucide-react';
import { Application } from '@/types';
import Link from 'next/link';

export default function ApplicationsPage() {
  const { user, loading: authLoading } = useUser();
  const router = useRouter();
  const db = useFirestore();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  const applicationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'applications'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [db, user]);

  const { data: applications, loading: appsLoading } = useCollection<Application>(applicationsQuery as any);

  const handleCancelApplication = (appId: string) => {
    if (!db) return;
    
    const appRef = doc(db, 'applications', appId);
    updateDoc(appRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp()
    }).then(() => {
      toast({
        title: "申請を取り消しました",
        description: "レンタル申請の取り下げが完了しました。"
      });
    }).catch((err) => {
      console.error("Cancel Error:", err);
      toast({
        variant: "destructive",
        title: "エラーが発生しました",
        description: "取り消し処理に失敗しました。時間をおいて再度お試しください。"
      });
    });
  };

  if (authLoading || !user) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;

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

      {appsLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
      ) : applications.length === 0 ? (
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
              <TableHeader>
                <TableRow className="bg-secondary/10">
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
                      <Badge 
                        variant={
                          app.status === 'completed' ? 'default' : 
                          app.status === 'pending' ? 'secondary' : 
                          app.status === 'cancelled' || app.status === 'rejected' ? 'destructive' : 
                          'outline'
                        } 
                        className={`text-[10px] ${app.status === 'cancelled' || app.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' : ''}`}
                      >
                        {app.status === 'pending' && '審査中'}
                        {app.status === 'approved' && '承認済'}
                        {app.status === 'rejected' && '却下'}
                        {app.status === 'payment_sent' && '決済待ち'}
                        {app.status === 'completed' && '完了'}
                        {app.status === 'cancelled' && '取り消し済み'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <div className="flex justify-end gap-2">
                        {app.status === 'payment_sent' && app.paymentLinkId && (
                          <Link href={`/payment/${app.paymentLinkId}`}>
                            <Button size="sm" className="h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600">
                              <ArrowRight className="h-3 w-3 mr-1" /> 決済する
                            </Button>
                          </Link>
                        )}
                        
                        {(app.status === 'pending' || app.status === 'approved' || app.status === 'payment_sent') && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10">
                                <XCircle className="h-3 w-3 mr-1" /> 取り消す
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-[2rem]">
                              <AlertDialogHeader>
                                <AlertDialogTitle>申請を取り消しますか？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {app.deviceType} のレンタル申請をキャンセルします。この操作は取り消せません。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl">戻る</AlertDialogCancel>
                                <AlertDialogAction 
                                  className="rounded-xl bg-destructive hover:bg-destructive/90"
                                  onClick={() => handleCancelApplication(app.id)}
                                >
                                  申請を取り消す
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {app.status === 'completed' && (
                          <Link href="/mypage/devices">
                            <Button size="sm" variant="ghost" className="h-8 rounded-lg">
                              <ExternalLink className="h-3 w-3 mr-1" /> 詳細
                            </Button>
                          </Link>
                        )}
                      </div>
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
