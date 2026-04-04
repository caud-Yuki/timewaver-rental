'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, History, CheckCircle2, XCircle, Clock, CalendarClock, Repeat, CreditCard, Calendar, Undo2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface PaymentHistoryEntry {
  historyId?: string;
  paymentId?: string;
  paymentStatus: string;
  amount: number;
  type?: 'charge' | 'recurring' | 'initial';
  label?: string;
  errors?: any[];
}

interface RecurringDetails {
  recurringId: string;
  customerId: string;
  paymentName?: string;
  startAt?: string;
  cycle?: string;
  payAmount: number;
  currentlyPayAmount?: number;
  recurringDayOfMonth?: number;
  remainingExecutionNumber?: number;
  nextRecurringAt?: string;
  isActive: boolean;
}

interface SubscriptionInfo {
  id: string;
  customerId?: string;
  payType?: string;
  payAmount: number;
  rentalMonths?: number;
  recurringId?: string;
  paymentId?: string;
  status: string;
  startAt?: string;
  endAt?: string;
}

// A unified schedule row combining API history + future projections
interface ScheduleRow {
  index: number;
  type: 'initial' | 'recurring' | 'charge' | 'scheduled';
  expectedDate: Date;
  amount: number;
  status: 'SOLD' | 'AUTHORIZED' | 'OUTSTANDING' | 'SCHEDULED' | 'CANCELED' | string;
  historyId?: string;
  paymentId?: string;
  label?: string;
  errors?: any[];
}

export default function PaymentHistoryPage() {
  const params = useParams();
  const subscriptionId = params.subscriptionId as string;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [recurringDetails, setRecurringDetails] = useState<RecurringDetails | null>(null);
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const functions = getFunctions(firebaseApp);
        const getPaymentHistory = httpsCallable(functions, 'getPaymentHistory');
        const response: any = await getPaymentHistory({ subscriptionId });
        const data = response.data;

        setSubscription(data.subscription);
        setCustomerName(data.customerName || '');
        setRecurringDetails(data.recurringDetails || null);
        setHistory(Array.isArray(data.history) ? data.history : []);
      } catch (error: any) {
        console.error("Error fetching payment history:", error);
        toast({ variant: 'destructive', title: 'エラー', description: `決済履歴の取得に失敗しました: ${error.message}` });
      } finally {
        setLoading(false);
      }
    };

    if (subscriptionId) fetchHistory();
  }, [subscriptionId]);

  const [refundingIndex, setRefundingIndex] = useState<number | null>(null);

  const handleRefund = async (row: ScheduleRow) => {
    setRefundingIndex(row.index);
    try {
      const functions = getFunctions(firebaseApp);
      const refundPaymentFn = httpsCallable(functions, 'refundPayment');

      if (row.type === 'charge' && row.paymentId) {
        await refundPaymentFn({ subscriptionId, paymentId: row.paymentId, type: 'charge' });
      } else if (row.type === 'recurring' && row.historyId) {
        await refundPaymentFn({ subscriptionId, historyId: row.historyId, type: 'recurring' });
      } else if (row.type === 'initial' && subscription?.paymentId) {
        // Initial payment for recurring — refund via charge endpoint if paymentId exists
        await refundPaymentFn({ subscriptionId, paymentId: subscription.paymentId, type: 'charge' });
      } else {
        toast({ variant: 'destructive', title: 'エラー', description: '返金に必要なIDが見つかりません。' });
        setRefundingIndex(null);
        return;
      }

      toast({ title: '返金完了', description: '返金処理が正常に完了しました。' });
      // Re-fetch to refresh status
      const getPaymentHistoryFn = httpsCallable(functions, 'getPaymentHistory');
      const response: any = await getPaymentHistoryFn({ subscriptionId });
      const data = response.data;
      setSubscription(data.subscription);
      setRecurringDetails(data.recurringDetails || null);
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (error: any) {
      console.error("Refund error:", error);
      toast({ variant: 'destructive', title: '返金エラー', description: error.message });
    } finally {
      setRefundingIndex(null);
    }
  };

  // Build full payment schedule
  const schedule = useMemo((): ScheduleRow[] => {
    if (!subscription) return [];

    const rows: ScheduleRow[] = [];
    const isMonthly = subscription.payType === 'monthly';

    if (!isMonthly) {
      // One-time payment: just show history as-is
      history.forEach((entry, i) => {
        rows.push({
          index: i + 1,
          type: (entry.type as any) || 'charge',
          expectedDate: subscription.startAt ? new Date(subscription.startAt) : new Date(),
          amount: entry.amount,
          status: entry.paymentStatus,
          historyId: entry.historyId,
          paymentId: entry.paymentId,
          label: entry.label,
          errors: entry.errors,
        });
      });
      return rows;
    }

    // Monthly subscription: build full schedule
    const rentalMonths = subscription.rentalMonths || 3;
    const startDate = subscription.startAt ? new Date(subscription.startAt) : new Date();
    const dayOfMonth = recurringDetails?.recurringDayOfMonth || startDate.getDate();
    const monthlyAmount = recurringDetails?.payAmount || subscription.payAmount;
    const initialAmount = recurringDetails?.currentlyPayAmount || monthlyAmount;

    // Separate API history into initial and recurring entries
    const recurringHistory = history.filter(h => h.type === 'recurring');

    // Row 1: Initial payment (contract start)
    rows.push({
      index: 1,
      type: 'initial',
      expectedDate: startDate,
      amount: initialAmount,
      status: 'SOLD', // Initial payment is always completed if subscription exists
      label: '初回決済（契約開始時）',
      errors: [],
    });

    // Rows 2..N: Monthly recurring payments
    for (let month = 1; month < rentalMonths; month++) {
      const expectedDate = new Date(startDate);
      expectedDate.setMonth(expectedDate.getMonth() + month);
      expectedDate.setDate(dayOfMonth);

      // Check if this month's payment exists in API history
      const matchedHistory = recurringHistory[month - 1]; // history is chronological
      const now = new Date();
      const isFuture = expectedDate > now;

      if (matchedHistory) {
        // Actual payment from API
        rows.push({
          index: month + 1,
          type: 'recurring',
          expectedDate,
          amount: matchedHistory.amount || monthlyAmount,
          status: matchedHistory.paymentStatus,
          historyId: matchedHistory.historyId,
          errors: matchedHistory.errors,
        });
      } else {
        // No API record — scheduled (future) or missed (past)
        rows.push({
          index: month + 1,
          type: 'scheduled',
          expectedDate,
          amount: monthlyAmount,
          status: isFuture ? 'SCHEDULED' : 'OUTSTANDING',
          errors: [],
        });
      }
    }

    return rows;
  }, [subscription, recurringDetails, history]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SOLD':
        return (
          <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-0.5 rounded-full flex items-center gap-1 w-fit">
            <CheckCircle2 className="h-3 w-3" /> 決済完了
          </Badge>
        );
      case 'AUTHORIZED':
        return (
          <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-0.5 rounded-full flex items-center gap-1 w-fit">
            <Clock className="h-3 w-3" /> 承認済み
          </Badge>
        );
      case 'OUTSTANDING':
        return (
          <Badge variant="destructive" className="text-xs px-3 py-0.5 rounded-full flex items-center gap-1 w-fit">
            <XCircle className="h-3 w-3" /> 未決済
          </Badge>
        );
      case 'SCHEDULED':
        return (
          <Badge variant="outline" className="text-xs px-3 py-0.5 rounded-full flex items-center gap-1 w-fit text-muted-foreground">
            <Calendar className="h-3 w-3" /> 予定
          </Badge>
        );
      case 'CANCELED':
        return (
          <Badge variant="destructive" className="text-xs px-3 py-0.5 rounded-full flex items-center gap-1 w-fit">
            <XCircle className="h-3 w-3" /> キャンセル
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-xs px-3 py-0.5 rounded-full">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'initial':
        return <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">初回決済</Badge>;
      case 'recurring':
        return <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">継続決済</Badge>;
      case 'charge':
        return <Badge variant="outline" className="text-[10px]">一括決済</Badge>;
      case 'scheduled':
        return <Badge variant="outline" className="text-[10px] border-dashed text-muted-foreground">予定</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
    }
  };

  const getPlanLabel = (months?: number) => {
    if (!months) return '-';
    return `${months}ヶ月プラン`;
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

  const formatScheduleDate = (date: Date) => {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  };

  const completedCount = schedule.filter(r => r.status === 'SOLD').length;
  const scheduledCount = schedule.filter(r => r.status === 'SCHEDULED').length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => window.location.href = '/admin/payments'}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          支払管理に戻る
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          決済履歴
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Stripe APIから取得した決済実行履歴</p>
      </div>

      {/* Subscription Summary */}
      {subscription && (
        <Card className="border-none shadow-lg rounded-2xl bg-white">
          <CardContent className="p-6">
            <h2 className="text-sm font-bold text-muted-foreground mb-4">サブスクリプション情報</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[11px] text-muted-foreground">顧客名</div>
                <div className="text-sm font-medium">{customerName || '-'}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">プラン</div>
                <div className="text-sm font-medium">{getPlanLabel(subscription.rentalMonths)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">月額/総額</div>
                <div className="text-sm font-semibold">¥{subscription.payAmount?.toLocaleString() || '-'}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">契約期間</div>
                <div className="text-sm">{formatDate(subscription.startAt)} 〜 {formatDate(subscription.endAt)}</div>
              </div>
            </div>
            {/* IDs */}
            <div className="mt-3 pt-3 border-t grid grid-cols-1 md:grid-cols-3 gap-3">
              {subscription.paymentId && (
                <div>
                  <div className="text-[11px] text-muted-foreground">決済ID (paymentId)</div>
                  <div className="text-xs font-mono text-primary break-all">{subscription.paymentId}</div>
                </div>
              )}
              {subscription.recurringId && (
                <div>
                  <div className="text-[11px] text-muted-foreground">継続決済ID (recurringId)</div>
                  <div className="text-xs font-mono text-primary break-all">{subscription.recurringId}</div>
                </div>
              )}
              {subscription.customerId && (
                <div>
                  <div className="text-[11px] text-muted-foreground">会員ID (customerId)</div>
                  <div className="text-xs font-mono text-primary break-all">{subscription.customerId}</div>
                </div>
              )}
            </div>

            {/* Recurring details from Stripe */}
            {recurringDetails && (
              <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3 w-3" />次回決済日</div>
                  <div className="text-sm font-medium">{formatDate(recurringDetails.nextRecurringAt)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Repeat className="h-3 w-3" />残回数</div>
                  <div className="text-sm font-medium">
                    {recurringDetails.remainingExecutionNumber != null ? `${recurringDetails.remainingExecutionNumber}回` : '無制限'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">決済日（毎月）</div>
                  <div className="text-sm font-medium">{recurringDetails.recurringDayOfMonth ? `${recurringDetails.recurringDayOfMonth}日` : '-'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Stripeステータス</div>
                  <div className="text-sm">
                    {recurringDetails.isActive
                      ? <Badge className="bg-green-500 text-white text-xs rounded-full">アクティブ</Badge>
                      : <Badge variant="secondary" className="text-xs rounded-full">停止中</Badge>
                    }
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Schedule Table */}
      <Card className="border-none shadow-lg rounded-2xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              決済スケジュール・履歴
            </h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" />{completedCount}件完了</span>
              {scheduledCount > 0 && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{scheduledCount}件予定</span>}
              <span>全{schedule.length}件</span>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80">
                <TableHead className="pl-6 text-xs font-semibold text-muted-foreground w-12">#</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">種別</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">決済予定日</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">履歴ID / 決済ID</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">金額</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">ステータス</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right pr-6">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.length > 0 ? (
                schedule.map((row) => {
                  const canRefund = (row.status === 'SOLD' || row.status === 'AUTHORIZED') && row.type !== 'scheduled';
                  return (
                    <TableRow
                      key={row.index}
                      className={`hover:bg-gray-50/50 ${row.type === 'scheduled' ? 'opacity-60' : ''}`}
                    >
                      <TableCell className="pl-6 text-sm text-muted-foreground">{row.index}</TableCell>
                      <TableCell>{getTypeBadge(row.type)}</TableCell>
                      <TableCell>
                        <div className="text-sm flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatScheduleDate(row.expectedDate)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-mono text-muted-foreground">
                          {row.historyId || row.paymentId || row.label || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-sm">¥{row.amount?.toLocaleString() || '-'}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right pr-6">
                        {canRefund ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 rounded-lg"
                                disabled={refundingIndex === row.index}
                              >
                                {refundingIndex === row.index
                                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  : <Undo2 className="h-3 w-3 mr-1" />
                                }
                                返金
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>返金処理を実行しますか？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  ¥{row.amount?.toLocaleString()} の返金をStripe APIを通じて実行します。
                                  {row.historyId && <><br/>履歴ID: {row.historyId}</>}
                                  {row.paymentId && <><br/>決済ID: {row.paymentId}</>}
                                  <br/><br/>
                                  この操作は取り消せません。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-500 hover:bg-red-600"
                                  onClick={() => handleRefund(row)}
                                >
                                  返金を実行
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                    決済履歴が見つかりません。
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
