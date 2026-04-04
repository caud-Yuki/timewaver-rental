'use client';

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Mail, ArrowUpDown, Loader2, CreditCard, Search, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Subscription {
  id: string;
  customerName: string;
  stripeCustomerId: string;
  email: string;
  payAmount: number;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  payType: 'full' | 'monthly';
  status: string;
  createdAt: string;
  deviceName: string;
}

export default function PaymentViewerPage() {
  const { toast } = useToast();
  const [allData, setAllData] = useState<Subscription[]>([]);
  const [filteredData, setFilteredData] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const functions = getFunctions(firebaseApp);
      const getSubscriptionsList = httpsCallable(functions, 'getSubscriptionsList');
      const response: any = await getSubscriptionsList();

      const subscriptions = Array.isArray(response.data) ? response.data as Subscription[] : [];
      setAllData(subscriptions);
      setFilteredData(subscriptions);

      toast({ title: `${subscriptions.length}件のレコードを取得しました。` });
    } catch (error: any) {
      console.error("Error fetching subscriptions:", error);
      toast({ variant: 'destructive', title: 'エラー', description: `データの取得に失敗しました: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  useEffect(() => {
    let data = [...allData];

    if (statusFilter !== 'all') {
      data = data.filter(item => item.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      data = data.filter(item => item.payType === typeFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(item =>
        item.customerName.toLowerCase().includes(term) ||
        item.stripeCustomerId?.toLowerCase().includes(term) ||
        (item.stripePaymentIntentId && item.stripePaymentIntentId.toLowerCase().includes(term)) ||
        (item.stripeSubscriptionId && item.stripeSubscriptionId.toLowerCase().includes(term)) ||
        item.deviceName.toLowerCase().includes(term)
      );
    }
    data.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    setFilteredData(data);
  }, [searchTerm, statusFilter, typeFilter, sortOrder, allData]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-0.5 rounded-full">正常</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="text-xs px-3 py-0.5 rounded-full">完了</Badge>;
      case 'canceled':
        return <Badge variant="destructive" className="text-xs px-3 py-0.5 rounded-full">解約</Badge>;
      case 'used':
        return <Badge variant="secondary" className="text-xs px-3 py-0.5 rounded-full">使用済み</Badge>;
      default:
        return <Badge variant="outline" className="text-xs px-3 py-0.5 rounded-full">{status}</Badge>;
    }
  };

  const getPayTypeLabel = (type: string) => {
    switch (type) {
      case 'monthly': return '月次決済';
      case 'full': return '一括決済';
      default: return type;
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            支払ビューアー
          </h1>
          <p className="text-sm text-muted-foreground mt-1">全ての支払レコードを検索・フィルタ・閲覧</p>
        </div>
        <div className="flex gap-2">
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
            onChange={e => setSearchTerm(e.target.value)}
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
            <SelectItem value="used">使用済み</SelectItem>
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
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80">
                  <TableHead className="pl-6 text-xs font-semibold text-muted-foreground">顧客名</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">機器 / ID</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground text-right">支払金額</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">ステータス</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">登録日</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground text-right pr-6">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length > 0 ? (
                  filteredData.map(item => (
                    <TableRow key={item.id} className="hover:bg-gray-50/50">
                      <TableCell className="pl-6">
                        <div className="font-medium text-sm">{item.customerName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{item.stripeCustomerId}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{item.deviceName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {item.payType === 'full' ? item.stripePaymentIntentId : item.stripeSubscriptionId}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-semibold">¥{item.payAmount.toLocaleString()}</div>
                        <div className="text-[11px] text-muted-foreground">{getPayTypeLabel(item.payType)}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-sm">{new Date(item.createdAt).toLocaleDateString('ja-JP')}</TableCell>
                      <TableCell className="text-right pr-6">
                        <a href={`mailto:${item.email}`} title={`${item.customerName}にメール`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </a>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-24 text-muted-foreground">
                      レコードが見つかりません。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
