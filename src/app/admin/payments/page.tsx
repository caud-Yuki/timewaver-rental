'use client';

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CreditCard, Search, ArrowUpDown, RefreshCw, Mail, CloudDownload, CalendarClock, Repeat, History, CircleStop } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionRecord {
  id: string;
  userId: string;
  customerId?: string;
  deviceId?: string;
  deviceName?: string;
  customerName?: string;
  email?: string;
  payAmount?: number;
  payType?: string;
  paymentId?: string | null;
  recurringId?: string | null;
  rentalMonths?: number;
  status: string;
  startAt?: string;
  endAt?: string;
  createdAt?: string;
  updatedAt?: string;
  firstpayRecurringStatus?: {
    isActive: boolean;
    nextRecurringAt?: string;
    payAmount?: number;
    remainingExecutionNumber?: number;
    lastSyncedAt?: string;
  };
  firstpayPaymentStatus?: {
    paymentStatus: string;
    amount?: number;
    lastSyncedAt?: string;
  };
}

export default function AdminPaymentsPage() {
  const { toast } = useToast();
  const [allData, setAllData] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const functions = getFunctions(firebaseApp);
      const getSubscriptionsList = httpsCallable(functions, 'getSubscriptionsList');
      const response: any = await getSubscriptionsList();
      const subscriptions = Array.isArray(response.data) ? response.data as SubscriptionRecord[] : [];
      setAllData(subscriptions);
      toast({ title: `${subscriptions.length}件のレコードを取得しました。` });
    } catch (error: any) {
      console.error("Error fetching subscriptions:", error);
      toast({ variant: 'destructive', title: 'エラー', description: `データの取得に失敗しました: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const functions = getFunctions(firebaseApp);
      const syncPaymentData = httpsCallable(functions, 'syncPaymentData');
      const response: any = await syncPaymentData();
      const result = response.data;
      toast({
        title: 'FirstPay同期完了',
        description: `同期: ${result.synced}件 / エラー: ${result.errors}件`,
      });
      await fetchSubscriptions();
    } catch (error: any) {
      console.error("Sync error:", error);
      toast({ variant: 'destructive', title: '同期エラー', description: error.message });
    } finally {
      setSyncing(false);
    }
  };

  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const handleStopRecurring = async (subscriptionId: string, customerName?: string) => {
    setStoppingId(subscriptionId);
    try {
      const functions = getFunctions(firebaseApp);
      const stopRecurringPayment = httpsCallable(functions, 'stopRecurringPayment');
      await stopRecurringPayment({ subscriptionId });
      toast({ title: '継続決済停止完了', description: `${customerName || subscriptionId}の継続決済を停止しました。` });
      await fetchSubscriptions();
    } catch (error: any) {
      console.error("Stop recurring error:", error);
      toast({ variant: 'destructive', title: '停止エラー', description: error.message });
    } finally {
      setStoppingId(null);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  // Filter, search, sort
  const displayedData = (() => {
    let data = [...allData];
    if (statusFilter !== 'all') data = data.filter(s => s.status === statusFilter);
    if (typeFilter !== 'all') data = data.filter(s => s.payType === typeFilter);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      data = data.filter(s =>
        s.id.toLowerCase().includes(term) ||
        (s.customerName || '').toLowerCase().includes(term) ||
        (s.customerId || '').toLowerCase().includes(term) ||
        (s.userId || '').toLowerCase().includes(term) ||
        (s.deviceId || '').toLowerCase().includes(term) ||
        (s.deviceName || '').toLowerCase().includes(term) ||
        (s.paymentId || '').toLowerCase().includes(term) ||
        (s.recurringId || '').toLowerCase().includes(term)
      );
    }
    data.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
    return data;
  })();

  const getContractPeriod = (sub: SubscriptionRecord) => {
    if (!sub.startAt || !sub.endAt) return '-';
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    return `${fmt(new Date(sub.startAt))}〜${fmt(new Date(sub.endAt))}`;
  };

  const getPlanLabel = (months?: number) => {
    if (!months) return '-';
    return `${months}ヶ月プラン`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-0.5 rounded-full">正常</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="text-xs px-3 py-0.5 rounded-full">完了</Badge>;
      case 'canceled':
        return <Badge variant="destructive" className="text-xs px-3 py-0.5 rounded-full">解約</Badge>;
      default:
        return <Badge variant="outline" className="text-xs px-3 py-0.5 rounded-full">{status}</Badge>;
    }
  };

  const getPayTypeLabel = (type?: string) => {
    switch (type) {
      case 'monthly': return '月次決済';
      case 'one-time': case 'full': return '一括決済';
      default: return type || '-';
    }
  };

  const getFirstPaySyncBadge = (sub: SubscriptionRecord) => {
    const syncData = sub.firstpayRecurringStatus || sub.firstpayPaymentStatus;
    if (!syncData) return null;
    const lastSynced = syncData.lastSyncedAt ? new Date(syncData.lastSyncedAt).toLocaleDateString('ja-JP') : '';
    return (
      <span className="text-[10px] text-green-600 flex items-center gap-0.5" title={`最終同期: ${lastSynced}`}>
        <CloudDownload className="h-3 w-3" /> 同期済
      </span>
    );
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            支払管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">全ユーザーのサブスクリプションと支払状況</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5 mr-1.5" />}
            FirstPay同期
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={fetchSubscriptions} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            更新
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => window.location.href = '/admin'}>
            ダッシュボードに戻る
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="名前・ID・機器名で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="支払タイプ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全タイプ</SelectItem>
            <SelectItem value="full">一括決済</SelectItem>
            <SelectItem value="monthly">月次決済</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="ステータス" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全ステータス</SelectItem>
            <SelectItem value="active">正常</SelectItem>
            <SelectItem value="completed">完了</SelectItem>
            <SelectItem value="canceled">解約</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortOrder === 'desc' ? '新しい順' : '古い順'}
        </Button>
      </div>

      {/* Table */}
      <Card className="border-none shadow-lg rounded-2xl overflow-hidden bg-white">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b">
                <h2 className="text-base font-bold">アクティブなサブスクリプション</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80">
                    <TableHead className="pl-6 text-xs font-semibold text-muted-foreground">会員ID / ユーザー</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">プラン</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">支払金額</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">契約期間</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">次回決済日</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">残回数</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">ステータス</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right pr-6">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedData.length > 0 ? (
                    displayedData.map((sub) => (
                      <TableRow key={sub.id} className="hover:bg-gray-50/50">
                        <TableCell className="pl-6">
                          <div className="text-[11px] text-muted-foreground font-mono">{sub.customerId || '-'}</div>
                          <div className="text-sm font-medium">{sub.customerName || '-'}</div>
                          {sub.email && <div className="text-[11px] text-muted-foreground">{sub.email}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-medium">{getPlanLabel(sub.rentalMonths)}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">¥{sub.payAmount ? sub.payAmount.toLocaleString() : '-'}</div>
                          <div className="text-[11px] text-muted-foreground">{getPayTypeLabel(sub.payType)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">📅 {getContractPeriod(sub)}</div>
                        </TableCell>
                        <TableCell>
                          {sub.firstpayRecurringStatus?.nextRecurringAt ? (
                            <div className="text-sm flex items-center gap-1">
                              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                              {new Date(sub.firstpayRecurringStatus.nextRecurringAt).toLocaleDateString('ja-JP')}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub.firstpayRecurringStatus?.remainingExecutionNumber != null ? (
                            <div className="text-sm flex items-center gap-1">
                              <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                              {sub.firstpayRecurringStatus.remainingExecutionNumber}回
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getStatusBadge(sub.status)}
                            {getFirstPaySyncBadge(sub)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-1">
                            {sub.email && (
                              <a href={`mailto:${sub.email}`} title={`${sub.customerName}にメール`}>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </a>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="決済履歴"
                              onClick={() => window.location.href = `/admin/payments/${sub.id}/history`}
                            >
                              <History className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            {sub.recurringId && sub.status === 'active' && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                                    title="継続決済を停止"
                                    disabled={stoppingId === sub.id}
                                  >
                                    {stoppingId === sub.id
                                      ? <Loader2 className="h-4 w-4 animate-spin" />
                                      : <CircleStop className="h-4 w-4" />
                                    }
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>継続決済を停止しますか？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {sub.customerName}（{sub.recurringId}）の継続決済を停止します。
                                      この操作はFirstPay APIを通じて実行され、以降の自動決済が停止されます。
                                      この操作は取り消せません。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-500 hover:bg-red-600"
                                      onClick={() => handleStopRecurring(sub.id, sub.customerName)}
                                    >
                                      停止する
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-24 text-muted-foreground">
                        サブスクリプションが見つかりません。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
