'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, Download, ChevronDown, ChevronUp, CheckCircle2, Clock, Calendar, XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface UserSubscription {
  id: string;
  userId: string;
  deviceType?: string;
  deviceName?: string;
  payAmount?: number;
  payType?: string;
  rentalMonths?: number;
  status: string;
  startAt?: any;
  endAt?: any;
  createdAt?: any;
  updatedAt?: any;
  stripeSubscriptionId?: string;
  stripePaymentIntentId?: string;
  stripeCustomerId?: string;
  stripeStatus?: { status?: string; currentPeriodEnd?: string; cancelAt?: string; lastSyncedAt?: string };
  refundHistory?: Array<{ refundId?: string; amount?: number; refundedAt: string }>;
}

interface ScheduleRow {
  index: number;
  type: 'initial' | 'recurring' | 'charge' | 'scheduled';
  expectedDate: Date;
  amount: number;
  status: string;
}

interface HistoryCache {
  schedule: ScheduleRow[];
  loading: boolean;
  loaded: boolean;
}

export default function UserPaymentsPage() {
  const { user, loading: authLoading } = useUser();
  const router = useRouter();
  const db = useFirestore();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  const subscriptionsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'subscriptions'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }, [db, user]);

  const { data: subscriptions, loading: subsLoading } = useCollection<UserSubscription>(subscriptionsQuery as any);

  // Track which subscriptions have their history expanded and loaded
  const [historyCache, setHistoryCache] = useState<Record<string, HistoryCache>>({});

  const fetchHistory = async (sub: UserSubscription) => {
    if (historyCache[sub.id]?.loaded) return; // Already loaded

    setHistoryCache(prev => ({ ...prev, [sub.id]: { schedule: [], loading: true, loaded: false } }));

    try {
      const functions = getFunctions(firebaseApp);
      const getPaymentHistory = httpsCallable(functions, 'getPaymentHistory');
      const response: any = await getPaymentHistory({ subscriptionId: sub.id });
      const data = response.data;

      const history = Array.isArray(data.history) ? data.history : [];
      const stripeDetails = data.stripeDetails;
      const subscription = data.subscription;

      // Build schedule from Stripe data + Firestore subscription info
      const rows: ScheduleRow[] = [];
      const isMonthly = subscription?.payType === 'monthly';

      if (!isMonthly) {
        // One-time: show the charge from history
        history.forEach((entry: any, i: number) => {
          rows.push({
            index: i + 1,
            type: entry.type || 'charge',
            expectedDate: entry.created ? new Date(entry.created) : (subscription?.startAt ? new Date(subscription.startAt) : new Date()),
            amount: entry.amount || subscription?.payAmount || 0,
            status: entry.status === 'succeeded' ? 'SOLD' : (entry.status || 'UNKNOWN'),
          });
        });
      } else {
        // Monthly: build full schedule from Stripe invoices + projected future
        const rentalMonths = subscription?.rentalMonths || 3;
        const startDate = subscription?.startAt ? new Date(subscription.startAt) : new Date();
        const monthlyAmount = subscription?.payAmount || 0;
        const dayOfMonth = startDate.getDate() > 28 ? 28 : startDate.getDate();

        // Map Stripe invoices to paid months
        const paidInvoices = history.filter((h: any) => h.type === 'invoice' || h.type === 'charge');

        for (let month = 0; month < rentalMonths; month++) {
          const expectedDate = new Date(startDate);
          expectedDate.setMonth(expectedDate.getMonth() + month);
          if (month > 0) expectedDate.setDate(dayOfMonth);

          const matchedInvoice = paidInvoices[month];
          const isFuture = expectedDate > new Date();

          if (matchedInvoice) {
            const isPaid = matchedInvoice.status === 'paid' || matchedInvoice.status === 'succeeded';
            rows.push({
              index: month + 1,
              type: month === 0 ? 'initial' : 'recurring',
              expectedDate: matchedInvoice.created ? new Date(matchedInvoice.created) : expectedDate,
              amount: matchedInvoice.amount || monthlyAmount,
              status: isPaid ? 'SOLD' : matchedInvoice.status?.toUpperCase() || 'UNKNOWN',
            });
          } else {
            rows.push({
              index: month + 1,
              type: month === 0 ? 'initial' : 'scheduled',
              expectedDate,
              amount: monthlyAmount,
              status: isFuture ? 'SCHEDULED' : 'OUTSTANDING',
            });
          }
        }
      }

      setHistoryCache(prev => ({ ...prev, [sub.id]: { schedule: rows, loading: false, loaded: true } }));
    } catch (error) {
      console.error("Error fetching history:", error);
      setHistoryCache(prev => ({ ...prev, [sub.id]: { schedule: [], loading: false, loaded: true } }));
    }
  };

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (sub: UserSubscription) => {
    const newSet = new Set(expandedIds);
    if (newSet.has(sub.id)) {
      newSet.delete(sub.id);
    } else {
      newSet.add(sub.id);
      fetchHistory(sub);
    }
    setExpandedIds(newSet);
  };

  const getSubStatusBadge = (sub: UserSubscription) => {
    if (sub.refundHistory && sub.refundHistory.length > 0) {
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs">返金済み</Badge>;
    }
    switch (sub.status) {
      case 'active':
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs">決済完了</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="text-xs">契約終了</Badge>;
      case 'canceled':
        return <Badge variant="destructive" className="text-xs">解約済み</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{sub.status}</Badge>;
    }
  };

  const getScheduleStatusBadge = (status: string) => {
    switch (status) {
      case 'SOLD':
        return (
          <Badge className="bg-green-500 text-white text-[10px] px-2 py-0 rounded-full flex items-center gap-0.5 w-fit">
            <CheckCircle2 className="h-2.5 w-2.5" /> 決済完了
          </Badge>
        );
      case 'SCHEDULED':
        return (
          <Badge variant="outline" className="text-[10px] px-2 py-0 rounded-full flex items-center gap-0.5 w-fit text-muted-foreground">
            <Calendar className="h-2.5 w-2.5" /> 予定
          </Badge>
        );
      case 'OUTSTANDING':
        return (
          <Badge variant="destructive" className="text-[10px] px-2 py-0 rounded-full flex items-center gap-0.5 w-fit">
            <XCircle className="h-2.5 w-2.5" /> 未決済
          </Badge>
        );
      case 'CANCELED':
        return (
          <Badge className="bg-orange-500 text-white text-[10px] px-2 py-0 rounded-full flex items-center gap-0.5 w-fit">
            返金済み
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-[10px] px-2 py-0 rounded-full">{status}</Badge>;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleDateString('ja-JP');
    if (timestamp.toDate) return timestamp.toDate().toLocaleDateString('ja-JP');
    if (typeof timestamp === 'string') return new Date(timestamp).toLocaleDateString('ja-JP');
    return '-';
  };

  const formatScheduleDate = (date: Date) => {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  };

  if (authLoading || !user) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => router.push('/mypage')}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        マイページに戻る
      </Button>
      <div>
        <h1 className="text-3xl font-bold font-headline">支払履歴</h1>
        <p className="text-muted-foreground">過去の決済・契約更新の履歴</p>
      </div>

      <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-8">
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> 決済トランザクション</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {subsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground italic">決済履歴はありません</div>
          ) : (
            <div>
              {/* Main table */}
              <Table>
                <TableHeader className="bg-secondary/5">
                  <TableRow>
                    <TableHead className="pl-8">日付</TableHead>
                    <TableHead>対象機器</TableHead>
                    <TableHead>支払金額</TableHead>
                    <TableHead>支払方法</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right pr-8">詳細</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub) => {
                    const isExpanded = expandedIds.has(sub.id);
                    const cache = historyCache[sub.id];
                    return (
                      <>
                        <TableRow key={sub.id} className="hover:bg-gray-50/50">
                          <TableCell className="pl-8 text-xs">{formatDate(sub.createdAt)}</TableCell>
                          <TableCell className="font-medium text-sm">{sub.deviceType || sub.deviceName || '-'}</TableCell>
                          <TableCell className="font-bold">¥{sub.payAmount?.toLocaleString() || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {sub.payType === 'monthly' ? '月々払い' : '一括払い'}
                            </Badge>
                          </TableCell>
                          <TableCell>{getSubStatusBadge(sub)}</TableCell>
                          <TableCell className="text-right pr-8">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-lg text-xs"
                              onClick={() => toggleExpand(sub)}
                            >
                              {isExpanded ? (
                                <><ChevronUp className="h-4 w-4 mr-1" /> 閉じる</>
                              ) : (
                                <><ChevronDown className="h-4 w-4 mr-1" /> 決済明細</>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expandable schedule rows */}
                        {isExpanded && (
                          <TableRow key={`${sub.id}-detail`}>
                            <TableCell colSpan={6} className="p-0 bg-gray-50/50">
                              {cache?.loading ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                              ) : cache?.schedule && cache.schedule.length > 0 ? (
                                <div className="px-8 py-4">
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-3">
                                    決済スケジュール（{cache.schedule.filter(r => r.status === 'SOLD').length}/{cache.schedule.length}件完了）
                                  </h4>
                                  <div className="space-y-2">
                                    {cache.schedule.map((row) => (
                                      <div
                                        key={row.index}
                                        className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${
                                          row.status === 'SOLD' ? 'bg-white border-green-100' :
                                          row.status === 'SCHEDULED' ? 'bg-white/50 border-dashed border-gray-200 opacity-60' :
                                          row.status === 'CANCELED' ? 'bg-orange-50 border-orange-100' :
                                          'bg-white border-gray-200'
                                        }`}
                                      >
                                        <div className="flex items-center gap-4">
                                          <span className="text-xs text-muted-foreground w-6">#{row.index}</span>
                                          <span className="text-sm">{formatScheduleDate(row.expectedDate)}</span>
                                          <Badge variant="outline" className="text-[10px]">
                                            {row.type === 'initial' ? '初回' : row.type === 'charge' ? '一括' : row.type === 'scheduled' ? '予定' : '月次'}
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <span className="font-semibold text-sm">¥{row.amount?.toLocaleString()}</span>
                                          {getScheduleStatusBadge(row.status)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center py-8 text-sm text-muted-foreground">決済明細はありません</div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
