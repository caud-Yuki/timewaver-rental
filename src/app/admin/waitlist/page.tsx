
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Clock, Trash2, Mail, ShieldAlert, ListFilter } from 'lucide-react';
import { Waitlist, UserProfile } from '@/types';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function WaitlistManagementPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [selectedDevice, setSelectedDevice] = useState<string>('all');

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  // Sorting: oldest first (asc) to respect the waitlist queue priority
  const waitlistQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'waitlist'), orderBy('createdAt', 'asc'));
  }, [db]);
  const { data: fullList, loading: listLoading } = useCollection<Waitlist>(waitlistQuery as any);

  // Extract unique device types for the categorization filter
  const deviceTypes = useMemo(() => {
    const types = new Set<string>();
    fullList.forEach(item => {
      if (item.deviceType) types.add(item.deviceType);
    });
    return Array.from(types).sort();
  }, [fullList]);

  // Apply filtering based on selected tab
  const filteredList = useMemo(() => {
    if (selectedDevice === 'all') return fullList;
    return fullList.filter(item => item.deviceType === selectedDevice);
  }, [fullList, selectedDevice]);

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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
            <Clock className="h-8 w-8 text-primary" /> キャンセル待ち管理
          </h1>
          <p className="text-muted-foreground">在庫待ちのユーザー一覧と通知状況 (古い順に表示)</p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl shadow-sm">ダッシュボードに戻る</Button>
        </Link>
      </div>

      {/* Categorization / Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground px-2">
          <ListFilter className="h-4 w-4" /> カテゴリ別表示:
        </div>
        <Tabs value={selectedDevice} onValueChange={setSelectedDevice} className="w-full md:w-auto">
          <TabsList className="bg-slate-100 p-1 rounded-xl h-auto flex flex-wrap">
            <TabsTrigger value="all" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              すべて ({fullList.length})
            </TabsTrigger>
            {deviceTypes.map(type => (
              <TabsTrigger key={type} value={type} className="rounded-lg px-6 py-2 whitespace-nowrap data-[state=active]:bg-white data-[state=active]:shadow-sm">
                {type}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10 border-none">
                <TableHead className="pl-8 py-5">#</TableHead>
                <TableHead>登録日</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead>希望機器</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.map((item, index) => (
                <TableRow key={item.id} className="group hover:bg-muted/5 transition-colors border-slate-50">
                  <TableCell className="pl-8">
                    <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-medium">
                    {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('ja-JP') : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-sm">{item.userName}</div>
                    <div className="text-[10px] text-muted-foreground">{item.userEmail}</div>
                  </TableCell>
                  <TableCell className="font-bold">
                    <Badge variant="outline" className="rounded-lg border-primary/20 bg-primary/5 text-primary text-[10px]">
                      {item.deviceType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={item.status === 'notified' ? 'default' : 'secondary'}
                      className={`text-[10px] ${item.status === 'notified' ? 'bg-emerald-500' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {item.status === 'notified' ? '通知完了' : '待機中'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8 space-x-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-primary rounded-xl h-9 hover:bg-primary/5" 
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
              {filteredList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-32 text-muted-foreground italic bg-slate-50/50">
                    現在、このカテゴリにキャンセル待ちユーザーはいません
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
