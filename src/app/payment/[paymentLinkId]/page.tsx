'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, ShieldCheck, CreditCard, Lock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp, addDoc, collection, Timestamp, getDoc as firestoreGetDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PaymentLink, UserProfile, Application, GlobalSettings } from '@/types';
import { addBusinessDays, formatDateJP } from '@/lib/business-days';
import { getStripeConfig, getStripeInstance } from '@/lib/stripe';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';

// --- Stripe Card Form (inner component, used inside <Elements>) ---

const CARD_ELEMENT_OPTIONS = {
  hidePostalCode: true,
  style: {
    base: {
      fontSize: '16px',
      color: '#1f2937',
      fontFamily: "'Helvetica Neue', sans-serif",
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#ef4444' },
  },
};

function CheckoutForm({
  clientSecret,
  onSuccess,
  onError,
  isProcessing,
  setIsProcessing,
  payAmount,
}: {
  clientSecret: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  payAmount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      onError('カード入力フォームが見つかりません。');
      setIsProcessing(false);
      return;
    }

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      onError(error.message || 'お支払い処理に失敗しました。');
      setIsProcessing(false);
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess();
    } else {
      onError(`決済ステータス: ${paymentIntent?.status}`);
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="p-4 border rounded-xl bg-white">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>
      <Button
        type="submit"
        className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20"
        disabled={isProcessing || !stripe || !elements}
      >
        {isProcessing
          ? <span className="flex items-center gap-2"><Loader2 className="animate-spin h-6 w-6" /> 処理中...</span>
          : `¥${payAmount?.toLocaleString()} を支払う`
        }
      </Button>
    </form>
  );
}

// --- Main Payment Page ---

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
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

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

  // --- Initialize Stripe + Create PaymentIntent/Subscription ---
  const initializingRef = useState(false);
  const initializeStripe = useCallback(async () => {
    if (!db || !paymentLink || !user || !profile || initializingRef[0]) return;
    initializingRef[1](true);

    try {
      // 1. Get Stripe config (publishable key)
      const config = await getStripeConfig(db);
      if (!config) {
        setConfigError('決済システムの設定が完了していません。管理者にお問い合わせください。');
        return;
      }

      // 2. Initialize Stripe.js
      const stripe = await getStripeInstance(config.publishableKey);
      if (!stripe) {
        setConfigError('Stripe.jsの初期化に失敗しました。');
        return;
      }
      setStripeInstance(stripe);

      // 3. Call Cloud Function to create PaymentIntent or Subscription
      const functions = getFunctions();
      const createPayment = httpsCallable(functions, 'createStripePayment');
      const result = await createPayment({
        paymentLinkId: paymentLink.id,
        userId: user.uid,
      });

      const data = result.data as { clientSecret: string; stripeCustomerId: string; paymentIntentId: string };
      if (!data.clientSecret) {
        throw new Error('決済セッションの作成に失敗しました。');
      }

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);

      // Save stripeCustomerId to user profile if new
      if (data.stripeCustomerId && !profile.stripeCustomerId) {
        await updateDoc(doc(db, 'users', user.uid), {
          stripeCustomerId: data.stripeCustomerId,
          updatedAt: serverTimestamp(),
        });
      }

      setStripeReady(true);
      console.log('[PAYMENT_DEBUG] Stripe Elements ready.');
    } catch (error: any) {
      console.error('[PAYMENT_DEBUG] Stripe initialization failed:', error);
      setConfigError(`決済の初期化に失敗しました: ${error.message}`);
    }
  }, [db, paymentLink, user, profile]);

  useEffect(() => {
    if (paymentLink && user && profile && !stripeReady && !configError) {
      initializeStripe();
    }
  }, [paymentLink, user, profile, stripeReady, configError, initializeStripe]);

  // --- Payment Success Handler ---
  const handlePaymentSuccess = async () => {
    if (!db || !paymentLink || !user || !application) return;

    setIsCompleted(true);
    toast({ title: '決済が完了しました' });
    console.log('[PAYMENT_DEBUG] Payment confirmed. Syncing to Firestore...');

    try {
      // Calculate subscription dates
      const isRenewal = !!(application as any).isRenewal && !!(application as any).previousEndAt;
      let startDate: Date;
      if (isRenewal) {
        startDate = new Date((application as any).previousEndAt);
      } else {
        const bufferDays = globalSettings?.shippingBufferDays ?? 3;
        startDate = addBusinessDays(new Date(), bufferDays);
      }

      // rentalPeriod is numeric (3, 6, 12), rentalType is string ('new'|'renew')
      const rentalMonths = (application as any).rentalPeriod || 12;

      const subStartAt = Timestamp.fromDate(startDate);
      const endBaseDate = new Date(startDate);
      endBaseDate.setMonth(endBaseDate.getMonth() + rentalMonths);
      const subEndAt = Timestamp.fromDate(endBaseDate);

      const subscriptionData = {
        userId: user.uid,
        deviceId: paymentLink.deviceId,
        deviceType: paymentLink.deviceName,
        payType: paymentLink.payType,
        rentalMonths: rentalMonths,
        startAt: subStartAt,
        endAt: subEndAt,
        stripeCustomerId: profile?.stripeCustomerId || null,
        stripeSubscriptionId: null, // Will be set after subscription creation for monthly
        stripePaymentIntentId: paymentIntentId || null,
        payAmount: paymentLink.payAmount,
        status: 'active',
        applicationId: paymentLink.applicationId,
        previousSubscriptionId: application.previousSubscriptionId || null,
        isRenewal: isRenewal,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const writes: Promise<any>[] = [
        addDoc(collection(db, 'subscriptions'), subscriptionData),
        updateDoc(doc(db, 'paymentLinks', paymentLink.id), { status: 'used', updatedAt: serverTimestamp() }),
        updateDoc(doc(db, 'applications', paymentLink.applicationId), { status: 'completed', updatedAt: serverTimestamp() }),
      ];

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
        writes.push(
          updateDoc(doc(db, 'devices', paymentLink.deviceId), {
            contractEndAt: subEndAt,
            updatedAt: serverTimestamp(),
          })
        );
      }

      Promise.allSettled(writes).then(async (results) => {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.warn(`[PAYMENT_DEBUG] Firestore write #${i} failed:`, r.reason?.message);
          }
        });
        console.log('[PAYMENT_DEBUG] Firestore sync completed.');

        // For monthly payments: create Stripe Subscription for recurring billing
        if (paymentLink.payType === 'monthly' && paymentIntentId && profile?.stripeCustomerId) {
          try {
            // Get the subscription doc ID (first write result)
            const subDocResult = results[0];
            const firestoreSubId = subDocResult.status === 'fulfilled' ? subDocResult.value?.id : null;

            const functions = getFunctions();
            const createSub = httpsCallable(functions, 'createStripeSubscription');

            // Read device to get monthlyPriceId
            const deviceSnap = await firestoreGetDoc(doc(db, 'devices', paymentLink.deviceId));
            const deviceData = deviceSnap.data();
            const termKey = rentalMonths <= 3 ? '3m' : rentalMonths <= 6 ? '6m' : '12m';
            const monthlyPriceId = deviceData?.stripeProducts?.[termKey]?.monthlyPriceId;

            const subResult = await createSub({
              stripeCustomerId: profile.stripeCustomerId,
              monthlyPriceId: monthlyPriceId || null,
              paymentIntentId,
              firestoreSubscriptionId: firestoreSubId,
              payAmount: paymentLink.payAmount,
              deviceName: paymentLink.deviceName,
            });
            console.log('[PAYMENT_DEBUG] Stripe Subscription created:', (subResult.data as any).stripeSubscriptionId);
          } catch (subErr: any) {
            console.warn('[PAYMENT_DEBUG] Stripe subscription creation failed:', subErr.message);
          }
        }
      });
    } catch (error: any) {
      console.error('[PAYMENT_DEBUG] Firestore sync error:', error);
    }
  };

  const handlePaymentError = (msg: string) => {
    toast({
      variant: 'destructive',
      title: '決済エラー',
      description: msg,
    });
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

  // --- Render: Completed ---
  if (isCompleted) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] overflow-hidden text-center p-12 space-y-6">
          <div className="h-20 w-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <h1 className="text-3xl font-bold font-headline">完了</h1>
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
          <p className="text-muted-foreground">安全なStripe決済システムで処理されます</p>
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

            {/* === Stripe Elements === */}
            {stripeInstance && clientSecret ? (
              <Elements stripe={stripeInstance}>
                <CheckoutForm
                  clientSecret={clientSecret}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                  isProcessing={isProcessing}
                  setIsProcessing={setIsProcessing}
                  payAmount={paymentLink.payAmount}
                />
              </Elements>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                <Loader2 className="animate-spin h-6 w-6 mr-2" />
                決済フォームを読み込み中...
              </div>
            )}

            {/* Subscription start date info */}
            {paymentLink && application && !application.isRenewal && paymentLink.payType === 'monthly' && (
              <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-sm">
                <p className="font-semibold">実際の決済処理開始日</p>
                <p className="text-xs mt-1">
                  デバイスの発送準備期間を考慮し、初回の決済処理は <strong>{formatDateJP(addBusinessDays(new Date(), globalSettings?.shippingBufferDays ?? 3))}</strong> に開始されます。
                  サブスクリプションはデバイスがお手元に届くタイミングから開始されます。
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-secondary/20 p-6 flex flex-col gap-4 text-center">
            <div className="flex justify-center gap-6 opacity-50 grayscale">
              <span className="flex items-center gap-1 text-[9px] font-bold"><Lock className="h-3 w-3" /> Secure SSL</span>
              <span className="flex items-center gap-1 text-[9px] font-bold"><ShieldCheck className="h-3 w-3" /> PCI DSS</span>
            </div>
            <p className="text-[10px] text-muted-foreground">カード情報は直接Stripeへ送信され、当サイトには保存されません。</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
