'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Clock, 
  Trash2, 
  Mail, 
  ShieldAlert, 
  ChevronRight, 
  ArrowLeft,
  Package,
  CheckCircle2,
  Users
} from 'lucide-react';
import { Waitlist, UserProfile, Device } from '@/types';
import Link from 'next/link';

export default function WaitlistManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  // State to handle which device's waitlist we are looking at
  const [selectedDeviceId, setSelectedDevice] = useState<string | null>(null);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  // Fetch all devices to show the "Market" overview
  const devicesQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'devices'), orderBy('typeCode', 'asc'));
  }, [db]);
  const { data: devices, loading: devicesLoading } = useCollection<Device>(devicesQuery as any);

  // Fetch all waitlist entries to calculate counts and show details
  const waitlistQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'waitlist'), orderBy('createdAt', 'asc'));
  }, [db]);
  const { data: fullWaitlist, loading: listLoading } = useCollection<Waitlist>(waitlistQuery as any);

  // Map waitlist counts to device IDs
  const waitlistCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    fullWaitlist.forEach(item => {
      if (item.status === 'waiting') {
        counts[item.deviceId] = (counts[item.deviceId] || 0) + 1;
      }
    });
    return counts;
  }, [fullWaitlist]);

  const selectedDevice = useMemo(() => {
    return devices.find(d => d.id === selectedDeviceId);
  }, [devices, selectedDeviceId]);

  const filteredWaitlist = useMemo(() => {
    if (!selectedDeviceId) return [];
    return fullWaitlist.filter(item => item.deviceId === selectedDeviceId);
  }, [fullWaitlist, selectedDeviceId]);

  const handleDelete = async (id: string) => {
    if (!db || !confirm('削除しますか？')) return;
    deleteDoc(doc(db, 'waitlist', id)).then(() => toast({ title: "削除しました" }));
  };

  const handleNotify = async (item: Waitlist) => {
    if (!db) return;
    updateDoc(doc(db, 'waitlist', item.id), { status: 'notified' }).then(() => {
      toast({ 
        title: "通知済みに更新しました", 
        description: `${item.userName}さんに案内を送信した旨を記録しました。` 
      });
    });
  };

  if (authLoading || (profile && profile.role !== 'admin' && !authLoading)) {
    if (profile?.role !== 'admin') return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" /> 管理者権限が必要です</div>;
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
            <Clock className="h-8 w-8 text-primary" /> キャンセル待ち管理
          </h1>
          <p className="text-muted-foreground">
            {selectedDeviceId ? `${selectedDevice?.type} の待機リスト` : 'デバイスごとの待機状況一覧'}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedDeviceId ? (
            <Button variant="outline" className="rounded-xl shadow-sm" onClick={() => setSelectedDevice(null)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> デバイス一覧に戻る
            </Button>
          ) : (
            <Link href="/admin">
              <Button variant="outline" className="rounded-xl shadow-sm">ダッシュボードに戻る</Button>
            </Link>
          )}
        </div>
      </div>

      {devicesLoading || listLoading ? (
        <div className="flex justify-center py-32"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>
      ) : !selectedDeviceId ? (
        /* View 1: Device Overview */
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => {
            const count = waitlistCounts[device.id] || 0;
            return (
              <Card 
                key={device.id} 
                className="border-none shadow-lg rounded-[2rem] overflow-hidden group hover:shadow-2xl transition-all cursor-pointer bg-white"
                onClick={() => setSelectedDevice(device.id)}
              >
                <CardHeader className="bg-primary/5 pb-4">
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="uppercase text-[10px] bg-white">{device.typeCode}</Badge>
                    {device.status === 'available' ? (
                      <Badge className="bg-emerald-500 text-white border-none">利用可能 (在庫)</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">レンタル中</Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl font-headline group-hover:text-primary transition-colors mt-2">{device.type}</CardTitle>
                  <CardDescription className="font-mono text-[10px]">{device.serialNumber}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${count > 0 ? 'bg-primary text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}>
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">キャンセル待ち</p>
                        <p className="text-xl font-bold">{count} <span className="text-sm font-normal">名</span></p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
                <CardFooter className="bg-secondary/5 border-t p-4 text-[10px] text-muted-foreground italic flex justify-center">
                  クリックして詳細な待機リストを表示
                </CardFooter>
              </Card>
            );
          })}
          {devices.length === 0 && (
            <div className="col-span-full py-32 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed">
              <Package className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <p className="text-muted-foreground">登録されているデバイスがありません</p>
            </div>
          )}
        </div>
      ) : (
        /* View 2: Detailed Waitlist for selected device */
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border flex items-center gap-6">
            <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold font-headline">{selectedDevice?.type}</h2>
              <div className="flex items-center gap-3 mt-1">
                <Badge variant="outline" className="font-mono text-[10px]">{selectedDevice?.serialNumber}</Badge>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="h-4 w-4" /> 現在 {filteredWaitlist.filter(i => i.status === 'waiting').length} 名が待機中
                </span>
              </div>
            </div>
            {selectedDevice?.status === 'available' && (
              <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-2 border border-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-bold">この機器は現在「利用可能」です。待機者に案内を送信してください。</span>
              </div>
            )}
          </div>

          <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/10 border-none">
                    <TableHead className="pl-8 py-5 w-[80px]">登録順</TableHead>
                    <TableHead>登録日</TableHead>
                    <TableHead>ユーザー名 / メール</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right pr-8">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWaitlist.map((item, index) => (
                    <TableRow key={item.id} className="group hover:bg-muted/5 transition-colors border-slate-50">
                      <TableCell className="pl-8">
                        <span className="font-mono text-sm font-bold text-primary">#{index + 1}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-medium">
                        {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-sm">{item.userName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{item.userEmail}</div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={item.status === 'notified' ? 'default' : 'secondary'}
                          className={`text-[10px] px-3 py-1 rounded-lg ${item.status === 'notified' ? 'bg-emerald-500' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {item.status === 'notified' ? '通知・案内済み' : '待機中'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8 space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-primary rounded-xl h-9 hover:bg-primary/5 font-bold" 
                          onClick={() => handleNotify(item)} 
                          disabled={item.status === 'notified'}
                        >
                          <Mail className="h-4 w-4 mr-1" /> 案内送信済みにする
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive rounded-xl h-9 w-9 hover:bg-destructive/10" 
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredWaitlist.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-32 text-muted-foreground italic bg-slate-50/50">
                        このデバイスに待機しているユーザーはいません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
