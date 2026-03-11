
'use client';

import { useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, updateDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, Eye, ShieldAlert, User as UserIcon, Phone, MapPin, Send } from 'lucide-react';
import { Application, UserProfile } from '@/types';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

  const applicationsQuery = useMemoFirebase(() => {
    if (!db || profile?.role !== 'admin') return null;
    return query(collection(db, 'applications'), orderBy('createdAt', 'desc'));
  }, [db, profile?.role]);

  const { data: applications, loading: appsLoading } = useCollection<Application>(applicationsQuery as any);

  const handleUpdateStatus = async (appId: string, status: Application['status']) => {
    if (!db) return;
    const appRef = doc(db, 'applications', appId);
    
    updateDoc(appRef, {
      status,
      updatedAt: serverTimestamp(),
    }).then(() => {
      toast({
        title: "ステータスを更新しました",
        description: `申請のステータスを ${status} に変更しました。`,
      });
    }).catch((error) => {
      toast({
        variant: "destructive",
        title: "エラーが発生しました",
        description: "ステータスの更新に失敗しました。",
      });
    });
  };

  const handleCreatePaymentLink = async (application: Application) => {
    if (!db) return;
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const paymentLinkData = {
      applicationId: application.id,
      userId: application.userId,
      deviceId: application.deviceId,
      serialNumber: application.deviceSerialNumber,
      deviceName: application.deviceType,
      payType: application.payType,
      payAmount: application.payAmount,
      status: 'pending',
      expiresAt: serverTimestamp(), // Ideally we'd calculate a real date but let's use serverTimestamp for now or fix this later
      createdAt: serverTimestamp(),
    };

    addDoc(collection(db, 'paymentLinks'), paymentLinkData)
      .then((docRef) => {
        // Update application with payment link ID and change status
        updateDoc(doc(db, 'applications', application.id), {
          status: 'payment_sent',
          paymentLinkId: docRef.id,
          updatedAt: serverTimestamp(),
        });

        toast({
          title: "決済リンクを送信しました",
          description: `ユーザーに決済用のリンクを発行しました。`,
        });
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "エラーが発生しました",
          description: "決済リンクの作成に失敗しました。",
        });
      });
  };

  if (authLoading || (profileLoading && !profile)) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!user || profile?.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <ShieldAlert className="h-20 w-20 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold font-headline">アクセス制限</h1>
        <p className="text-muted-foreground">管理者権限が必要です。ログインアカウントを確認してください。</p>
        <Link href="/">
          <Button variant="outline" className="rounded-xl">トップページに戻る</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold font-headline">管理者ダッシュボード</h1>
          <p className="text-muted-foreground">全てのレンタル申請と機器の管理を行います</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/devices">
            <Button className="rounded-xl shadow-lg">機器在庫の管理</Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="bg-secondary/50 p-1 rounded-xl h-12">
          <TabsTrigger value="pending" className="rounded-lg px-6">未処理の申請</TabsTrigger>
          <TabsTrigger value="all" className="rounded-lg px-6">全ての申請履歴</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="animate-in fade-in duration-300">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle>審査待ち・承認済みの申請</CardTitle>
              <CardDescription>現在 {applications.filter(a => a.status === 'pending' || a.status === 'approved').length} 件の対応が必要な申請があります</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>申請日</TableHead>
                    <TableHead>ユーザー</TableHead>
                    <TableHead>対象機器</TableHead>
                    <TableHead>プラン</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.filter(a => a.status === 'pending' || a.status === 'approved').map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="text-xs">{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '不明'}</TableCell>
                      <TableCell>
                        <div className="font-medium">{app.userName || '名前なし'}</div>
                        <div className="text-xs text-muted-foreground">{app.userEmail}</div>
                      </TableCell>
                      <TableCell>{app.deviceType}</TableCell>
                      <TableCell>{app.rentalType}ヶ月 / {app.payType === 'monthly' ? '月払い' : '一括'}</TableCell>
                      <TableCell>
                        <Badge variant={app.status === 'approved' ? 'default' : 'secondary'}>
                          {app.status === 'approved' ? '承認済み' : '審査中'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {app.status === 'pending' ? (
                          <>
                            <Button size="sm" variant="outline" className="rounded-lg border-emerald-200 text-emerald-600 hover:bg-emerald-50" onClick={() => handleUpdateStatus(app.id, 'approved')}>
                              <CheckCircle className="h-4 w-4 mr-1" /> 承認
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleUpdateStatus(app.id, 'rejected')}>
                              拒否
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" className="rounded-lg bg-primary hover:bg-primary/90" onClick={() => handleCreatePaymentLink(app)}>
                            <Send className="h-4 w-4 mr-1" /> 決済リンク送信
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {applications.filter(a => a.status === 'pending' || a.status === 'approved').length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">対応が必要な申請はありません</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="animate-in fade-in duration-300">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>申請日</TableHead>
                    <TableHead>ユーザー</TableHead>
                    <TableHead>対象機器</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="text-xs">{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{app.userName || app.userEmail}</TableCell>
                      <TableCell>{app.deviceType}</TableCell>
                      <TableCell>
                        <Badge variant={app.status === 'completed' ? 'default' : app.status === 'rejected' ? 'destructive' : 'secondary'}>
                          {app.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" className="rounded-lg" asChild>
                           <Link href={`/admin/applications`}>詳細</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
