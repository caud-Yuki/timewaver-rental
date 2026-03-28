'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, ShieldCheck, CreditCard, Lock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp, addDoc, collection, Timestamp } from 'firebase/firestore';
import { PaymentLink, UserProfile, Application, GlobalSettings } from '@/types';
import { addBusinessDays, formatDateJP } from '@/lib/business-days';
import {
  getFirstPayConfig,
  initWidget,
  publishWidgetToken,
  poll3dsStatus,
  registerCustomer,
  createCharge,
  createRecurring,
  FirstPayConfig,
} from '@/lib/firstpay';

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();
  const paymentLinkId = params.paymentLinkId as string;

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);

  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const configRef = useRef<FirstPayConfig | null>(null);

  const linkRef = useMemoFirebase(() => {
    if (!db || !paymentLinkId) return null;
    return doc(db, 'paymentLinks', paymentLinkId);
  }, [db, paymentLinkId]);
  const { data: paymentLink, loading: linkLoading } = useDoc<PaymentLink>(linkRef as any);

  const appRef = useMemoFirebase(() => {
    if (!db || !paymentLink?.applicationId) return null;
    return doc(db, 'applications', paymentLink.applicationId);
  }, [db, paymentLink?.applicationId]);
  const { data: application } = useDoc<Application>(appRef as any);

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'settings', 'global');
  }, [db]);
  const { data: globalSettings } = useDoc<GlobalSettings>(settingsRef as any);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  // --- Widget Initialization ---
  const widgetInitializing = useRef(false);
  const initializeWidget = useCallback(async () => {
    if (!db || !widgetContainerRef.current || widgetRef.current || widgetInitializing.current) return;
    widgetInitializing.current = true;

    try {
      const config = await getFirstPayConfig(db);
      if (!config) {
        setConfigError('決済システムの設定が完了していません。管理者にお問い合わせください。');
        return;
      }
      configRef.current = config;

      // bearerToken から "Bearer " 接頭辞を除去した値を apiCredential として渡す
      const apiCredential = config.bearerToken.replace(/^Bearer\s+/i, '').trim();

      const widget = await initWidget(
        widgetContainerRef.current,
        apiCredential,
        config.mode,
        profile?.tel,
      );

      // 入力バリデーション状態の購読（ログ用）
      // 仕様: 「不備がある場合のみ連携」→ エラー解消時にはコールバックが呼ばれないため
      // ボタンの無効化には使わず、publishToken側のエラーハンドリングに委ねる
      widget.subscribe((errors: Record<string, string>) => {
        console.log('[PAYMENT_DEBUG] Widget validation callback:', errors);
      });

      widgetRef.current = widget;
      setWidgetReady(true);
      console.log('[PAYMENT_DEBUG] Widget ready for input.');
    } catch (error: any) {
      console.error('[PAYMENT_DEBUG] Widget initialization failed:', error);
      setConfigError(`ウィジェットの初期化に失敗しました: ${error.message}`);
      widgetInitializing.current = false;
    }
  }, [db, profile?.tel, linkLoading, paymentLink]);

  useEffect(() => {
    initializeWidget();
  }, [initializeWidget]);

  // --- Payment Handler ---
  const handlePayment = async () => {
    if (!db || !paymentLink || !profile || !user || !application) return;
    if (!widgetRef.current) {
      toast({ variant: 'destructive', title: 'エラー', description: 'カード入力ウィジェットが初期化されていません。' });
      return;
    }

    setIsProcessing(true);
    console.log('[PAYMENT_DEBUG] --- Payment Process Started ---');

    try {
      const config = configRef.current;
      if (!config) throw new Error('決済設定が見つかりません。');

      // 1. Stage 1: Widget経由でトークン発行
      console.log('[PAYMENT_DEBUG] Stage 1: Card Tokenization via Widget');
      const tokenResult = await publishWidgetToken(widgetRef.current, profile.tel);
      const { cardToken } = tokenResult;

      console.log('[PAYMENT_DEBUG] Token acquired. Brand:', tokenResult.brand, 'Last4:', tokenResult.lastFour);

      // 2. 3DS Authentication（ウィジェット側でissuerUrlが返される場合）
      // NOTE: ウィジェットJSが3DS認証を内部的にハンドルする場合、この処理は不要になる可能性あり。
      // FirstPay社の仕様に応じて要調整。

      // 3. Stage 2: Member Registration (登録済みならスキップ)
      const customerId = profile.customerId || `CUST-${user.uid.substring(0, 8)}-${Date.now()}`;
      console.log('[PAYMENT_DEBUG] Stage 2: Member Registration. customerId:', customerId);

      try {
        await registerCustomer(config, {
          customerId,
          cardToken,
          familyName: profile.familyName,
          givenName: profile.givenName,
          email: profile.email,
          tel: profile.tel,
        });
        console.log('[PAYMENT_DEBUG] Customer registered successfully.');
      } catch (regError: any) {
        // 「登録済みの会員です」→ 既に登録済みなのでスキップして続行
        if (regError.message?.includes('登録済み')) {
          console.log('[PAYMENT_DEBUG] Customer already registered, skipping. Using existing customerId:', customerId);
        } else {
          throw regError; // 他のエラーは再throw
        }
      }

      let transactionId = '';
      let recurringId = '';

      // Determine start date
      // - Renewals: use previous subscription's endAt (no buffer)
      // - New subscriptions: add N business days buffer for shipping
      const isRenewal = !!application.isRenewal && !!application.previousEndAt;
      let startDate: Date;
      if (isRenewal) {
        startDate = new Date(application.previousEndAt);
      } else {
        const bufferDays = globalSettings?.shippingBufferDays ?? 3;
        startDate = addBusinessDays(new Date(), bufferDays);
      }
      const startDateStr = startDate.toISOString().split('T')[0]; // yyyy-MM-dd
      const startDay = startDate.getDate() > 28 ? 28 : startDate.getDate();

      // 4. Stage 3: Execution (Charge or Recurring)
      console.log('[PAYMENT_DEBUG] Stage 3: Payment Execution', { isRenewal, startDateStr, bufferDays: globalSettings?.shippingBufferDays });
      if (paymentLink.payType === 'full') {
        const paymentId = `PAY${Date.now()}`;
        const chargeResult = await createCharge(config, {
          customerId,
          paymentId,
          paymentName: `Rental: ${paymentLink.deviceName}`,
          amount: paymentLink.payAmount,
        });
        transactionId = chargeResult.paymentId;
      } else {
        const recId = `REC${Date.now()}`;
        const recResult = await createRecurring(config, {
          reccuringId: recId,
          paymentName: `Monthly Rental: ${paymentLink.deviceName}`,
          customerId,
          startAt: startDateStr,
          payAmount: paymentLink.payAmount,
          currentlyPayAmount: paymentLink.payAmount,
          maxExecutionNumber: application.rentalType,
          recurringDayOfMonth: startDay,
        });
        recurringId = recResult.reccuringId;
      }

      // 5. Success: Show completion screen FIRST, then sync to Firestore in background
      setIsCompleted(true);
      toast({ title: '決済が完了しました' });
      console.log('[PAYMENT_DEBUG] Success! Syncing to Firestore...');

      // Calculate subscription dates
      const subStartAt = Timestamp.fromDate(startDate);
      const endBaseDate = new Date(startDate);
      endBaseDate.setMonth(endBaseDate.getMonth() + (application.rentalType || 12));
      const subEndAt = Timestamp.fromDate(endBaseDate);

      const subscriptionData = {
        userId: user.uid,
        deviceId: paymentLink.deviceId,
        deviceType: paymentLink.deviceName,
        payType: paymentLink.payType,
        rentalMonths: application.rentalType,
        startAt: subStartAt,
        endAt: subEndAt,
        recurringId: recurringId || null,
        paymentId: transactionId || null,
        customerId: customerId,
        payAmount: paymentLink.payAmount,
        status: 'active',
        applicationId: paymentLink.applicationId,
        previousSubscriptionId: application.previousSubscriptionId || null,
        isRenewal: isRenewal,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Build Firestore writes
      const writes: Promise<any>[] = [
        addDoc(collection(db, 'subscriptions'), subscriptionData),
        updateDoc(doc(db, 'users', user.uid), { customerId, updatedAt: serverTimestamp() }),
        updateDoc(doc(db, 'paymentLinks', paymentLink.id), { status: 'used', updatedAt: serverTimestamp() }),
        updateDoc(doc(db, 'applications', paymentLink.applicationId), { status: 'completed', updatedAt: serverTimestamp() }),
      ];

      // For new rentals, update device status. For renewals, device is already active.
      if (!isRenewal) {
        writes.push(
          updateDoc(doc(db, 'devices', paymentLink.deviceId), {
            status: 'active',
            currentUserId: user.uid,
            contractStartAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        // For renewals, update the device's contract end date
        writes.push(
          updateDoc(doc(db, 'devices', paymentLink.deviceId), {
            contractEndAt: subEndAt,
            updatedAt: serverTimestamp(),
          })
        );
      }

      Promise.allSettled(writes).then((results) => {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.warn(`[PAYMENT_DEBUG] Firestore write #${i} failed:`, r.reason?.message);
          }
        });
        console.log('[PAYMENT_DEBUG] Firestore sync completed.');
      });
    } catch (error: any) {
      console.error('[PAYMENT_DEBUG] !!! Critical Error in Payment Flow !!!', error);
      toast({
        variant: 'destructive',
        title: '決済エラー',
        description: error.message || 'お支払い処理に失敗しました。',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Render: Loading ---
  if (linkLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;

  // --- Render: Config Error ---
  if (configError) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">決済不可</h1>
          <p className="text-muted-foreground">{configError}</p>
          <Button className="w-full" variant="outline" onClick={() => router.push('/mypage')}>マイページに戻る</Button>
        </Card>
      </div>
    );
  }

  // --- Render: Completed (must be checked BEFORE invalid link) ---
  // 決済成功後、paymentLink.statusが'used'に更新されるため、
  // Invalid Linkチェックより先にisCompletedを判定する必要がある
  if (isCompleted) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] overflow-hidden text-center p-12 space-y-6">
          <div className="h-20 w-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <h1 className="text-3xl font-bold font-headline">🎉 完了！</h1>
          <p className="text-muted-foreground">決済が正常に完了しました。<br />発送準備を開始いたします。</p>
          <Button className="w-full h-14 rounded-2xl text-lg font-bold" onClick={() => router.push('/mypage/devices')}>マイデバイスへ移動</Button>
        </Card>
      </div>
    );
  }

  // --- Render: Invalid Link ---
  if (!paymentLink || !['pending', 'open', 'active'].includes(paymentLink.status)) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">リンクが無効です</h1>
          <p className="text-muted-foreground">このリンクは既に使用されているか、期限が切れています。</p>
          <Button className="w-full" onClick={() => router.push('/')}>トップに戻る</Button>
        </Card>
      </div>
    );
  }

  // --- Render: Payment Form ---
  return (
    <div className="container mx-auto px-4 py-12 flex justify-center">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <Activity className="h-10 w-10 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold font-headline">決済手続き</h1>
          <p className="text-muted-foreground">安全なFirstPay決済システムで処理されます</p>
        </div>

        <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
          <CardHeader className="bg-primary/5 pb-8 pt-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-6 w-6 text-primary" /> カード情報の入力</CardTitle>
                <CardDescription>情報は暗号化され保護されます。</CardDescription>
              </div>
              <Badge variant="outline" className="bg-white text-lg py-4 px-4 font-bold">¥{paymentLink.payAmount?.toLocaleString()}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="bg-secondary/20 p-6 rounded-2xl mb-4 border border-secondary">
              <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1 tracking-widest">お支払い内容</p>
              <p className="font-bold text-lg">{paymentLink.deviceName}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary" className="bg-white">{paymentLink.payType === 'monthly' ? '月々払い' : '一括払い'}</Badge>
              </div>
            </div>

            {/* === FirstPay ウィジェット コンテナ === */}
            <div className="space-y-4">
              <div
                id="firstpay-widget-container"
                ref={widgetContainerRef}
                className="min-h-[280px] rounded-xl"
              >
                {!widgetReady && (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                    <Loader2 className="animate-spin h-6 w-6 mr-2" />
                    カード入力フォームを読み込み中...
                  </div>
                )}
              </div>
            </div>

            {/* Subscription start date info */}
            {paymentLink && application && !application.isRenewal && paymentLink.payType === 'monthly' && (
              <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-sm">
                <p className="font-semibold">📦 実際の決済処理開始日</p>
                <p className="text-xs mt-1">
                  デバイスの発送準備期間を考慮し、初回の決済処理は <strong>{formatDateJP(addBusinessDays(new Date(), globalSettings?.shippingBufferDays ?? 3))}</strong> に開始されます。
                  サブスクリプションはデバイスがお手元に届くタイミングから開始されます。
                </p>
              </div>
            )}

            <div className="pt-6">
              <Button
                type="button"
                className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20"
                disabled={isProcessing || !widgetReady}
                onClick={handlePayment}
              >
                {isProcessing
                  ? <span className="flex items-center gap-2"><Loader2 className="animate-spin h-6 w-6" /> 処理中...</span>
                  : '決済を確定する'
                }
              </Button>
            </div>
          </CardContent>
          <CardFooter className="bg-secondary/20 p-6 flex flex-col gap-4 text-center">
            <div className="flex justify-center gap-6 opacity-50 grayscale">
              <span className="flex items-center gap-1 text-[9px] font-bold"><Lock className="h-3 w-3" /> Secure SSL</span>
              <span className="flex items-center gap-1 text-[9px] font-bold"><ShieldCheck className="h-3 w-3" /> PCI DSS</span>
            </div>
            <p className="text-[10px] text-muted-foreground">カード情報は直接決済システムへ送信され、当サイトには保存されません。</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
