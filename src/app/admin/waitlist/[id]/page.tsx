'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy, Timestamp, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  ChevronLeft, 
  Send, 
  User, 
  Clock, 
  Trash2, 
  AlertCircle,
  Bell, 
  Calendar,
  Mail
} from 'lucide-react';
import { Waitlist, Device, waitlistConverter, deviceConverter } from '@/types';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';


export default function DeviceWaitlistPage() {
  const db = useFirestore();
  const router = useRouter();
  const params = useParams();
  const deviceId = params.id as string;
  const { toast } = useToast();

  const [isConfirmingDelete, setIsConfirmingDelete] = useState<Waitlist | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deviceRef = useMemo(() => doc(db, 'devices', deviceId).withConverter(deviceConverter), [db, deviceId]);
  const { data: device, loading: deviceLoading, error: deviceError } = useDoc<Device>(deviceRef);

  const waitlistQuery = useMemo(() => 
    query(
      collection(db, 'waitlist'), 
      where('deviceId', '==', deviceId), 
      orderBy('createdAt', 'asc')
    ).withConverter(waitlistConverter)
  , [db, deviceId]);
  const { data: waitlist, loading: waitlistLoading, error: waitlistError } = useCollection<Waitlist>(waitlistQuery);

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

  const handleOneClickOffer = async () => {
    // Implement one-click offer logic
    console.log('One-click offer triggered for device:', deviceId);
    toast({ title: "一括オファー送信", description: "機能は現在開発中です。" })
  };

  const handleManualNotification = async (waitlistUser: Waitlist) => {
    console.log('Manually notifying user:', waitlistUser.userEmail);
    toast({ title: "案内送信", description: `ユーザー: ${waitlistUser.userEmail}への案内機能は開発中です。` })
  };

  const handleDeleteClick = (user: Waitlist) => {
    setIsConfirmingDelete(user);
  };

  const confirmDelete = async () => {
    if (!isConfirmingDelete) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'waitlist', isConfirmingDelete.id));
      toast({ 
        title: "削除しました", 
        description: `${isConfirmingDelete.userEmail}さんをキャンセル待ちから削除しました。`,
      });
    } catch (e) {
      console.error("Error deleting document: ", e);
      toast({ title: "エラー", description: "削除中にエラーが発生しました。", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      setIsConfirmingDelete(null);
    }
  };

  const loading = deviceLoading || waitlistLoading;
  const error = deviceError || waitlistError;

  const waitingUsers = waitlist?.filter(u => u.status === 'waiting').length || 0;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Button variant="outline" onClick={() => router.push('/admin/waitlist')} className="mb-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            デバイス一覧に戻る
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold font-headline flex items-center gap-3">
            <Clock className="h-7 w-7 md:h-8 md:w-8 text-primary" />
            キャンセル待ち管理
          </h1>
          {device && <p className="text-muted-foreground mt-2">{device.name} の待機リスト</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleOneClickOffer} variant="default" className="shadow-lg">
            <Send className="h-4 w-4 mr-2" />
            一括オファー送信 (自動間隔)
          </Button>
        </div>
      </div>

      {loading && <div className="flex justify-center py-20"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}
      {error && <div className="text-center py-20 text-destructive bg-red-50 border border-red-200 rounded-lg p-6">エラーが発生しました: {error.message}</div>}

      {!loading && !error && device && (
        <> 
          <Card className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border-slate-200/80">
            <CardContent className="p-6 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-5">
                  <div className="bg-slate-100 p-3 rounded-full">
                      <User className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                      <h2 className="text-xl font-bold text-slate-800">{device.name}</h2>
                      <p className="font-mono text-sm text-slate-500">SN:{device.serialNumber}</p>
                  </div>
                  <div className="ml-6">
                      <p className="text-sm text-slate-500">現在 <strong className="text-2xl text-primary font-bold">{waitingUsers}</strong> 名が待機中</p>
                  </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg p-3 flex items-center gap-3">
                  <Bell className="h-5 w-5"/>
                  <div>
                      <p><strong className="font-bold">返信期限設定:</strong> 24時間おき</p>
                      <p className="text-xs">ユーザーへの案内後、返信がない場合の有効期限</p>
                  </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl rounded-2xl overflow-hidden bg-white/80 backdrop-blur-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70">
                    <TableHead className="p-5 pl-8 w-[80px]">登録順</TableHead>
                    <TableHead>ユーザー名 / メール</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>案内予定</TableHead>
                    <TableHead className="text-right pr-8">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitlist?.map((user, index) => (
                    <TableRow key={user.id} className="border-t border-slate-200/80">
                      <TableCell className="pl-8 py-4 font-bold text-slate-600">#{index + 1}</TableCell>
                      <TableCell>
                        <div className="font-semibold">{user.userName || 'ユーザー名未設定'}</div>
                        <div className="text-xs text-muted-foreground font-mono flex items-center gap-1.5 mt-1">
                          <Mail className="h-3 w-3" />
                          {user.userEmail}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {user.scheduledNotifyAt ? 
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {user.scheduledNotifyAt.toDate().toLocaleString()}
                          </div>
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <Button variant="outline" size="sm" onClick={() => handleManualNotification(user)} className="mr-2">
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          案内送信済
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(user)} className="text-slate-500 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {waitlist?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-24 text-muted-foreground">
                        <p className="font-semibold">待機中のユーザーはいません</p>
                        <p className="text-sm mt-2">このデバイスのキャンセル待ちに登録しているユーザーは現在いません。</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!isConfirmingDelete} onOpenChange={() => setIsConfirmingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-destructive"/>
              削除確認
            </DialogTitle>
            <DialogDescription className="pt-4">
              本当に <strong>{isConfirmingDelete?.userEmail}</strong> さんをキャンセル待ちから削除しますか？<br/>この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmingDelete(null)} disabled={isSubmitting}>キャンセル</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin"/>}
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}