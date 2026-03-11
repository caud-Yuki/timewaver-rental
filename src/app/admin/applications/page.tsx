
'use client';

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, updateDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, ShieldAlert, FileText, Send, Mail } from 'lucide-react';
import { Application, UserProfile } from '@/types';
import Link from 'next/link';

export default function AdminApplicationsPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

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

  const handleUpdateStatus = async (appId: string, status: Application['status']) => {
    if (!db) return;
    updateDoc(doc(db, 'applications', appId), {
      status,
      updatedAt: serverTimestamp(),
    }).then(() => {
      toast({ title: "ステータスを更新しました" });
    });
  };

  const handleCreatePaymentLink = async (application: Application) => {
    if (!db) return;
    
    const paymentLinkData = {
      applicationId: application.id,
      userId: application.userId,
      deviceId: application.deviceId,
      serialNumber: application.deviceSerialNumber,
      deviceName: application.deviceType,
      payType: application.payType,
      payAmount: application.payAmount,
      status: 'pending',
      createdAt: serverTimestamp(),
    };

    addDoc(collection(db, 'paymentLinks'), paymentLinkData)
      .then((docRef) => {
        updateDoc(doc(db, 'applications', application.id), {
          status: 'payment_sent',
          paymentLinkId: docRef.id,
          updatedAt: serverTimestamp(),
        });
        toast({ title: "決済リンクを送信しました" });
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
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2"><FileText className="h-8 w-8 text-primary" /> 申請管理</h1>
          <p className="text-muted-foreground">全てのレンタル申込履歴と審査管理</p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8">申請日</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead>機器</TableHead>
                <TableHead>プラン</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="pl-8 text-xs">{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{app.userName}</div>
                    <div className="text-[10px] text-muted-foreground">{app.userEmail}</div>
                  </TableCell>
                  <TableCell className="text-sm">{app.deviceType}</TableCell>
                  <TableCell className="text-xs">{app.rentalType}ヶ月 / {app.payType === 'monthly' ? '月次' : '一括'}</TableCell>
                  <TableCell>
                    <Badge variant={app.status === 'completed' ? 'default' : app.status === 'pending' ? 'secondary' : 'outline'} className="text-[10px]">
                      {app.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8 space-x-2">
                    {app.status === 'pending' && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 text-emerald-600 hover:bg-emerald-50 rounded-lg" onClick={() => handleUpdateStatus(app.id, 'approved')}>
                          承認
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-destructive rounded-lg" onClick={() => handleUpdateStatus(app.id, 'rejected')}>
                          拒否
                        </Button>
                      </>
                    )}
                    {app.status === 'approved' && (
                      <Button size="sm" className="h-8 rounded-lg" onClick={() => handleCreatePaymentLink(app)}>
                        <Send className="h-3 w-3 mr-1" /> 決済リンク
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {applications.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">申請履歴はありません</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
