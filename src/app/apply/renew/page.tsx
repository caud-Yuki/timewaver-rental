
'use client';

import { useState, Suspense, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase, useStorage } from '@/firebase';
import { doc, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, RefreshCw, ShieldCheck, Camera, FileCheck, Check, ArrowLeft,
  Timer, Tag, X, CheckCircle2, Building2, User as UserIcon, Briefcase, AlertCircle,
} from 'lucide-react';
import { Device, UserProfile, GlobalSettings, Subscription, ApplicantType } from '@/types';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { calculateTotalMonthly, calculateTotalFull } from '@/lib/module-pricing';
import { isRenewalEligible, toDateOrNull, RENEWAL_IN_PROGRESS_STATUSES } from '@/lib/renewal';

type PlanDuration = '3m' | '6m' | '12m';
type PayType = 'monthly' | 'full';

interface PlanOption {
  duration: PlanDuration;
  months: number;
  label: string;
}

const PLAN_OPTIONS: PlanOption[] = [
  { duration: '3m', months: 3, label: '3ヶ月' },
  { duration: '6m', months: 6, label: '6ヶ月' },
  { duration: '12m', months: 12, label: '12ヶ月' },
];

/** 更新できない理由。理由ごとに案内文を変えるため状態として持つ。 */
type BlockReason = 'not_logged_in' | 'no_device' | 'not_owner' | 'out_of_window' | null;

function RenewForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deviceId = searchParams.get('deviceId');
  // 互換のため受け取るだけ（対象契約は activeSubscription で決める）
  const requestedSubscriptionId = searchParams.get('subscriptionId');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idFileUploaded, setIdFileUploaded] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>('');

  // 送信済みフラグ。送信後は離脱警告・セッションタイマーを止める。
  const isSubmittedRef = useRef(false);

  // Plan selection state
  const [selectedDuration, setSelectedDuration] = useState<PlanDuration>('12m');
  const [selectedPayType, setSelectedPayType] = useState<PayType>('monthly');

  // セッションタイムアウト（新規申込 /apply/new と同じ仕様）
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(10);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const deviceRef = useMemoFirebase(() => {
    if (!db || !deviceId) return null;
    return doc(db, 'devices', deviceId);
  }, [db, deviceId]);
  const { data: device, loading: deviceLoading } = useDoc<Device>(deviceRef as any);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'settings', 'global');
  }, [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);
  const moduleBasePrice = settings?.moduleBasePrice || 0;

  // 【本人確認】更新できるのは「自分がこの機器で有効な契約を持っている」場合だけ。
  // URL の subscriptionId は自己申告なので信用せず、必ず自分の契約一覧から引き当てる。
  const mySubsQuery = useMemoFirebase(() => {
    if (!db || !user || !deviceId) return null;
    return query(
      collection(db, 'subscriptions'),
      where('userId', '==', user.uid),
      where('deviceId', '==', deviceId),
      where('status', '==', 'active'),
    );
  }, [db, user, deviceId]);
  const { data: mySubs, loading: subsLoading } = useCollection<Subscription>(mySubsQuery as any);

  const activeSubscription = useMemo(() => {
    if (!mySubs || mySubs.length === 0) return null;
    // 常に「終了日が最も遅い契約」を延長対象にする。
    // 更新が成立すると旧契約と新契約がどちらも active で残るため、URL の subscriptionId を
    // そのまま採用すると、既に更新済みの古い契約を対象にして二重更新になりうる。
    // URL のパラメータは互換のため受け取るだけで、対象の決定には使わない。
    return [...mySubs].sort(
      (a, b) => (toDateOrNull(b.endAt)?.getTime() || 0) - (toDateOrNull(a.endAt)?.getTime() || 0),
    )[0];
  }, [mySubs]);

  const contractEndAt = activeSubscription?.endAt;
  const eligible = isRenewalEligible(contractEndAt, settings);

  const isLoading = authLoading || deviceLoading || subsLoading || !settings;

  const blockReason: BlockReason = useMemo(() => {
    if (isLoading) return null;
    if (!user) return 'not_logged_in';
    if (!device) return 'no_device';
    if (!activeSubscription) return 'not_owner';
    if (!eligible) return 'out_of_window';
    return null;
  }, [isLoading, user, device, activeSubscription, eligible]);

  const formReady = !isLoading && !blockReason;

  // --- 申込者区分・法人情報（新規申込と同じ項目） ---
  const [formData, setFormData] = useState({
    applicantType: 'individual' as ApplicantType,
    corporateNumber: '',
    invoiceNumber: '',
    corpCompanyName: '',
    corpZipcode: '',
    corpAddress: '',
    corpPhone: '',
    contactName: '',
    contactEmail: '',
  });

  // 会員情報から法人情報を引き継ぐ。
  // 一度だけ適用する（プロフィールの再取得で、ユーザーが選び直した申込タイプを巻き戻さない）。
  const profilePrefilledRef = useRef(false);
  useEffect(() => {
    if (profile && !profilePrefilledRef.current) {
      profilePrefilledRef.current = true;
      setFormData((prev) => ({
        ...prev,
        applicantType: profile.applicantType || prev.applicantType,
        invoiceNumber: prev.invoiceNumber || profile.invoiceNumber || '',
        corpCompanyName: prev.corpCompanyName || profile.companyName || '',
        corpZipcode: prev.corpZipcode || profile.zipcode || '',
        corpAddress: prev.corpAddress || `${profile.address1 || ''} ${profile.address2 || ''}`.trim(),
        corpPhone: prev.corpPhone || profile.tel || '',
        contactEmail: prev.contactEmail || profile.email || '',
        contactName: prev.contactName
          || (profile.familyName ? `${profile.familyName} ${profile.givenName || ''}`.trim() : ''),
      }));
    }
  }, [profile]);

  // --- クーポン（新規申込と同じ検証） ---
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim() || !db || !user) return;
    setCouponLoading(true);
    setCouponError('');
    setAppliedCoupon(null);

    try {
      const couponQuery = query(collection(db, 'coupons'), where('code', '==', couponCode.trim().toUpperCase()));
      const couponSnap = await getDocs(couponQuery);

      if (couponSnap.empty) {
        setCouponError('クーポンコードが見つかりません。');
        return;
      }

      const couponDoc = couponSnap.docs[0];
      const coupon = { id: couponDoc.id, ...couponDoc.data() } as any;

      if (!coupon.isActive || coupon.status !== 'active') {
        setCouponError('このクーポンは現在無効です。');
        return;
      }

      if (coupon.expiresAt && coupon.expiresAt.toDate() < new Date()) {
        setCouponError('このクーポンの有効期限が切れています。');
        return;
      }

      if (coupon.maxTotalUsers && (coupon.currentUsageCount || 0) >= coupon.maxTotalUsers) {
        setCouponError('このクーポンの利用上限に達しました。');
        return;
      }

      // 更新申込は定義上「新規のお客様」ではないため、新規限定クーポンは使えない。
      // サーバー側 (functions/src/pricing.ts) も更新申込では同じ理由で割引を 0 にする。
      if (coupon.newCustomerOnly) {
        setCouponError('このクーポンは新規申込の方のみご利用いただけます。');
        return;
      }

      setAppliedCoupon(coupon);
      toast({ title: 'クーポンを適用しました', description: coupon.name });
    } catch (e) {
      setCouponError('クーポンの確認中にエラーが発生しました。');
    } finally {
      setCouponLoading(false);
    }
  };

  // --- 金額計算 ---
  // 新規申込（/apply/new）と同じくモジュール料金を含める。
  // サーバー側 (functions/src/pricing.ts) の再計算もこの式と一致している必要がある。
  const months = PLAN_OPTIONS.find((p) => p.duration === selectedDuration)?.months || 12;

  const unitPriceFor = useCallback((duration: PlanDuration, payType: PayType) => {
    const plan = device?.price?.[duration];
    if (!plan) return 0;
    const planMonths = PLAN_OPTIONS.find((p) => p.duration === duration)?.months || 12;
    return payType === 'monthly'
      ? calculateTotalMonthly(plan.monthly || 0, device?.modules, moduleBasePrice)
      : calculateTotalFull(plan.full || 0, device?.modules, moduleBasePrice, planMonths);
  }, [device, moduleBasePrice]);

  // 月々払いなら 1 ヶ月分、一括払いなら期間分の総額（いずれもモジュール込み・クーポン適用前）
  const baseAmount = unitPriceFor(selectedDuration, selectedPayType);

  const discount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.discountType === 'percentage') {
      return Math.floor(baseAmount * (appliedCoupon.discountValue / 100));
    }
    return Math.min(appliedCoupon.discountValue, baseAmount);
  }, [appliedCoupon, baseAmount]);

  const payableAmount = Math.max(0, baseAmount - discount);

  // --- セッションタイムアウト ---
  const handleTimeout = useCallback(() => {
    setShowTimeoutDialog(true);

    let count = 10;
    setTimeoutCountdown(count);
    countdownIntervalRef.current = setInterval(() => {
      count -= 1;
      setTimeoutCountdown(count);
      if (count <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        router.push('/mypage/devices');
      }
    }, 1000);
  }, [router]);

  const resetInactivityTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (showTimeoutDialog || isSubmittedRef.current) return;

    const sessionMinutes = settings?.applicationSessionMinutes || 15;
    timerRef.current = setTimeout(() => {
      handleTimeout();
    }, sessionMinutes * 60 * 1000);
  }, [settings?.applicationSessionMinutes, handleTimeout, showTimeoutDialog]);

  useEffect(() => {
    // 入力できる状態のときだけ計測する（エラー画面で無用なダイアログを出さない）。
    // 更新は自分の契約中の機器が対象なので、新規申込と違って機器ロックは触らない。
    if (!formReady) return;

    resetInactivityTimer();
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, resetInactivityTimer));

    return () => {
      events.forEach((name) => window.removeEventListener(name, resetInactivityTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
      // ここで countdownIntervalRef は止めない。タイムアウト時に showTimeoutDialog が変わると
      // この効果が張り直されるため、掃除すると開始直後のカウントダウンを自分で止めてしまう。
    };
  }, [formReady, resetInactivityTimer]);

  // カウントダウンの後始末はアンマウント時だけ
  useEffect(() => () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  useEffect(() => {
    // 書類をアップロード済み＝やり直しの手間が大きい場合だけ確認する。
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSubmittedRef.current || !formReady || !idFileUploaded) return;
      e.preventDefault();
      e.returnValue = 'ページを離れると入力中の情報が失われますが、よろしいですか？';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [formReady, idFileUploaded]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage) return;

    setIsSubmitting(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `renewal_id_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `users/${user.uid}/identifications/${fileName}`);

      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setUploadedFileUrl(downloadUrl);
      setIdFileUploaded(true);
      toast({ title: "書類をアップロードしました" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "アップロード失敗",
        description: "ファイルのアップロードに失敗しました。"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenew = async () => {
    if (!user || !device || !db) return;
    if (!activeSubscription || !eligible) return;
    if (!idFileUploaded) {
      toast({ variant: "destructive", title: "本人確認書類が必要です", description: "更新には最新の身分証明書の提示が必要です。" });
      return;
    }

    // 法人を選んだ場合の必須項目（新規申込と同じ）
    if (formData.applicantType === 'corporate') {
      if (!formData.corpCompanyName.trim() || !formData.contactName.trim() || !formData.contactEmail.trim()) {
        toast({ variant: "destructive", title: "法人情報が必要です", description: "法人名・担当者名・担当者メールアドレスは必須項目です。" });
        return;
      }
    }

    setIsSubmitting(true);

    // 重複ガード: 同じ機器で「進行中」の更新申込が既にあればブロックする。
    // 完了済みの更新申込は対象外（RENEWAL_IN_PROGRESS_STATUSES 参照）。次回の更新を
    // 永久に塞がないためで、完了直後の二重更新は更新期間の判定側で防いでいる。
    try {
      const myAppsSnap = await getDocs(query(collection(db, 'applications'), where('userId', '==', user.uid)));
      const hasActiveRenewal = myAppsSnap.docs.some((d) => {
        const a = d.data() as any;
        return a.isRenewal === true
          && a.deviceId === device.id
          && RENEWAL_IN_PROGRESS_STATUSES.includes(a.status);
      });
      if (hasActiveRenewal) {
        toast({
          variant: "destructive",
          title: "既に更新申請が進行中です",
          description: `「${device.type}」の更新手続きは受付済みです。完了・終了後に再度お申し込みください。`,
        });
        setIsSubmitting(false);
        router.push('/mypage/applications');
        return;
      }
    } catch (guardErr) {
      // ガード判定の失敗で正規の更新申請まで止めない（サーバー側でも検証している）。
      console.warn('[RENEW] duplicate guard check skipped:', guardErr);
    }

    // 継続利用のため、次期契約の開始日は「現契約の終了日」。
    // URL 由来ではなく本人確認済みの契約から取る。
    const previousEndAtDate = toDateOrNull(activeSubscription.endAt);

    const corporateInfo = formData.applicantType === 'corporate' ? {
      corporateNumber: formData.corporateNumber.trim() || null,
      invoiceNumber: formData.invoiceNumber.trim() || null,
      companyName: formData.corpCompanyName.trim() || null,
      companyZipcode: formData.corpZipcode.trim() || null,
      companyAddress: formData.corpAddress.trim() || null,
      companyPhone: formData.corpPhone.trim() || null,
      contactName: formData.contactName.trim() || null,
      contactEmail: formData.contactEmail.trim() || null,
    } : null;

    const applicationData = {
      userId: user.uid,
      userName: `${profile?.familyName} ${profile?.givenName}`,
      userEmail: user.email,
      deviceId: device.id,
      deviceSerialNumber: device.serialNumber,
      deviceType: device.type,
      rentalType: months,
      payType: selectedPayType,
      payAmount: payableAmount,
      status: 'pending',
      // Applicant classification
      applicantType: formData.applicantType,
      corporateInfo,
      identificationImageUrl: uploadedFileUrl,
      // Coupon info（金額はサーバー側 onApplicationCreate が再計算して上書きする）
      couponId: appliedCoupon?.id || null,
      couponCode: appliedCoupon?.code || null,
      couponDiscount: discount,
      originalAmount: baseAmount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isRenewal: true,
      previousSubscriptionId: activeSubscription.id,
      previousEndAt: previousEndAtDate ? previousEndAtDate.toISOString() : null,
    };

    // 会員情報側にも法人情報を反映（新規申込と同じ挙動・失敗しても申請は続行）
    const profileUpdate: Record<string, any> = {
      applicantType: formData.applicantType,
      updatedAt: serverTimestamp(),
    };
    if (formData.applicantType === 'corporate') {
      if (formData.corpCompanyName.trim()) profileUpdate.companyName = formData.corpCompanyName.trim();
      if (formData.invoiceNumber.trim()) profileUpdate.invoiceNumber = formData.invoiceNumber.trim();
    }
    updateDoc(doc(db, 'users', user.uid), profileUpdate).catch(() => {});

    try {
      await addDoc(collection(db, 'applications'), applicationData);
    } catch (error: any) {
      toast({ variant: "destructive", title: "エラー", description: error?.message || '申請の送信に失敗しました。' });
      setIsSubmitting(false);
      return;
    }

    isSubmittedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    toast({ title: "契約更新の申請を送信しました", description: "管理者による確認後、決済案内をお送りします。" });
    setIsSubmitting(false);
    router.push('/mypage/devices');
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  if (blockReason) {
    const messages: Record<Exclude<BlockReason, null>, { title: string; body: string }> = {
      not_logged_in: {
        title: 'ログインが必要です',
        body: 'ご契約内容を確認するため、ログインしてから更新手続きを行ってください。',
      },
      no_device: {
        title: 'デバイスが見つかりません',
        body: '対象の機器情報を取得できませんでした。マイデバイスからやり直してください。',
      },
      not_owner: {
        title: 'この機器の契約が見つかりません',
        body: 'ご利用中の契約が確認できないため、更新手続きを開始できません。マイデバイスからご利用中の機器を選択してください。',
      },
      out_of_window: {
        title: '契約更新はまだできません',
        body: '契約更新は終了日の1ヶ月前から手続きが可能です。期間になりましたらマイデバイスからお手続きください。',
      },
    };
    const m = messages[blockReason];
    // 未ログインはログイン後にこのページへ戻す（?redirect= はログイン画面が解釈する）
    const backHref = blockReason === 'not_logged_in'
      ? `/auth/login?redirect=${encodeURIComponent(`/apply/renew${typeof window !== 'undefined' ? window.location.search : ''}`)}`
      : '/mypage/devices';
    return (
      <div className="container mx-auto px-4 py-20 max-w-2xl text-center space-y-4">
        <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
        <h1 className="text-xl font-bold">{m.title}</h1>
        <p className="text-muted-foreground text-sm">{m.body}</p>
        <Link href={backHref}>
          <Button variant="outline" className="mt-4">
            {blockReason === 'not_logged_in' ? 'ログインする' : 'マイデバイスに戻る'}
          </Button>
        </Link>
      </div>
    );
  }

  const contractEndLabel = toDateOrNull(contractEndAt)?.toLocaleDateString() || '未設定';

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl space-y-6">
      {/* Timeout Dialog */}
      <Dialog open={showTimeoutDialog} onOpenChange={() => {}}>
        <DialogContent className="rounded-[2rem] max-w-md text-center p-12">
          <DialogHeader>
            <div className="h-20 w-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Timer className="h-10 w-10 animate-pulse" />
            </div>
            <DialogTitle className="text-2xl font-headline font-bold">セッション終了</DialogTitle>
            <DialogDescription className="text-base py-4 leading-relaxed">
              一定時間操作がなかったため、セキュリティ上の理由によりセッションを終了しました。<br />
              お手数ですが、もう一度更新手続きを行ってください。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6">
            <p className="text-sm font-bold text-muted-foreground mb-4">
              あと <span className="text-primary text-xl px-1">{timeoutCountdown}</span> 秒でマイデバイスに戻ります
            </p>
            <Button className="w-full rounded-xl h-12 font-bold" onClick={() => router.push('/mypage/devices')}>
              今すぐマイデバイスに戻る
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => router.push('/mypage/devices')}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        マイデバイスに戻る
      </Button>

      <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-10 text-center">
          <RefreshCw className="mx-auto h-12 w-12 text-primary mb-4" />
          <CardTitle className="text-2xl font-headline">契約更新・プラン変更</CardTitle>
          <CardDescription className="text-base">
            {device!.type} の利用期間を延長します
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 space-y-8">
          {/* Info */}
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>現在の契約満了後も継続してTimeWaverをご利用いただけるよう、更新手続きを行います。</p>
            <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between text-xs">
              <span>現在の契約終了日</span>
              <span className="font-bold text-slate-700">{contractEndLabel}</span>
            </div>
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
              <p>更新にあたり、再度本人確認書類の提出をお願いしております。</p>
            </div>
          </div>

          <Separator />

          {/* Applicant Type */}
          <div className="space-y-3">
            <Label className="text-base font-bold flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> 申込タイプ
            </Label>
            <div className="inline-flex w-full rounded-2xl border-2 border-muted bg-slate-50 p-1">
              {([
                { key: 'individual' as ApplicantType, label: '個人', icon: UserIcon },
                { key: 'corporate' as ApplicantType, label: '法人', icon: Building2 },
              ]).map(({ key, label, icon: Icon }) => {
                const selected = formData.applicantType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormData({ ...formData, applicantType: key })}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                      selected
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-slate-500 hover:text-slate-700 hover:bg-white"
                    )}
                    aria-pressed={selected}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              法人として契約する場合は「法人」を選択すると、法人情報の入力欄が表示されます。
            </p>
          </div>

          {/* Corporate Info */}
          {formData.applicantType === 'corporate' && (
            <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-600" />
                <Label className="text-base font-bold text-indigo-900">法人情報</Label>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="corporateNumber" className="text-xs">法人番号</Label>
                  <Input id="corporateNumber" placeholder="13桁の法人番号" className="rounded-xl bg-white" value={formData.corporateNumber} onChange={e => setFormData({ ...formData, corporateNumber: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber" className="text-xs">インボイス登録番号</Label>
                  <Input id="invoiceNumber" placeholder="T1234567890123" className="rounded-xl bg-white" value={formData.invoiceNumber} onChange={e => setFormData({ ...formData, invoiceNumber: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="corpCompanyName" className="text-xs">法人名 / 会社名 <span className="text-red-500">*</span></Label>
                <Input id="corpCompanyName" placeholder="株式会社〇〇" className="rounded-xl bg-white" value={formData.corpCompanyName} onChange={e => setFormData({ ...formData, corpCompanyName: e.target.value })} required />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="corpZipcode" className="text-xs">会社郵便番号</Label>
                  <Input id="corpZipcode" placeholder="123-4567" className="rounded-xl bg-white" value={formData.corpZipcode} onChange={e => setFormData({ ...formData, corpZipcode: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="corpPhone" className="text-xs">会社電話番号</Label>
                  <Input id="corpPhone" placeholder="03-0000-0000" className="rounded-xl bg-white" value={formData.corpPhone} onChange={e => setFormData({ ...formData, corpPhone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="corpAddress" className="text-xs">会社住所</Label>
                <Input id="corpAddress" placeholder="東京都渋谷区神宮前1-2-3 〇〇ビル5F" className="rounded-xl bg-white" value={formData.corpAddress} onChange={e => setFormData({ ...formData, corpAddress: e.target.value })} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName" className="text-xs">担当者名 <span className="text-red-500">*</span></Label>
                  <Input id="contactName" placeholder="山田 太郎" className="rounded-xl bg-white" value={formData.contactName} onChange={e => setFormData({ ...formData, contactName: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail" className="text-xs">担当者メールアドレス <span className="text-red-500">*</span></Label>
                  <Input id="contactEmail" type="email" placeholder="taro@example.co.jp" className="rounded-xl bg-white" value={formData.contactEmail} onChange={e => setFormData({ ...formData, contactEmail: e.target.value })} required />
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Plan Selection */}
          <div className="space-y-4">
            <Label className="text-base font-bold">プラン選択</Label>

            {/* Duration */}
            <div className="grid grid-cols-3 gap-3">
              {PLAN_OPTIONS.map((plan) => {
                const isSelected = selectedDuration === plan.duration;
                const planMonthly = unitPriceFor(plan.duration, 'monthly');
                return (
                  <button
                    key={plan.duration}
                    type="button"
                    onClick={() => setSelectedDuration(plan.duration)}
                    className={`relative p-4 rounded-xl border-2 text-center transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute -top-2 -right-2 bg-primary text-white rounded-full p-0.5">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <div className="text-lg font-bold">{plan.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      ¥{planMonthly.toLocaleString()}/月
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pay Type */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPayType('monthly')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPayType === 'monthly'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-bold text-sm">月々払い</div>
                <div className="text-xs text-muted-foreground mt-1">
                  ¥{unitPriceFor(selectedDuration, 'monthly').toLocaleString()} × {months}回
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPayType('full')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPayType === 'full'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-bold text-sm">一括払い</div>
                <div className="text-xs text-muted-foreground mt-1">
                  ¥{unitPriceFor(selectedDuration, 'full').toLocaleString()}
                </div>
                {device!.fullPaymentDiscountRate ? (
                  <Badge className="bg-red-500 text-white text-[10px] mt-1">{device!.fullPaymentDiscountRate}%OFF</Badge>
                ) : null}
              </button>
            </div>
          </div>

          {/* Coupon Code */}
          <div className="space-y-3">
            <Label className="text-base font-bold flex items-center gap-2">
              <Tag className="h-4 w-4" /> クーポンコード
            </Label>
            {appliedCoupon ? (
              <div className="flex items-center justify-between p-3 rounded-xl border-2 border-green-200 bg-green-50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <div>
                    <span className="text-sm font-bold text-green-700">{appliedCoupon.name}</span>
                    <span className="text-xs text-green-600 ml-2">
                      ({appliedCoupon.discountType === 'percentage' ? `${appliedCoupon.discountValue}% OFF` : `¥${appliedCoupon.discountValue.toLocaleString()} OFF`})
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}>
                  <X className="h-3 w-3 mr-1" /> 解除
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="クーポンコードを入力"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                  className="rounded-xl uppercase"
                />
                <Button variant="outline" className="rounded-xl shrink-0" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()}>
                  {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '適用'}
                </Button>
              </div>
            )}
            {couponError && <p className="text-xs text-red-500">{couponError}</p>}
          </div>

          {/* Price Summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">小計</span>
              <span>¥{baseAmount.toLocaleString()}</span>
            </div>
            {appliedCoupon && discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> クーポン割引（{appliedCoupon.name}）</span>
                <span className="font-bold">-¥{discount.toLocaleString()}</span>
              </div>
            )}
            <Separator />
            <div className="flex items-end justify-between">
              <span className="text-sm font-bold">お支払い金額</span>
              <div className="text-right">
                {discount > 0 && (
                  <span className="text-[10px] text-muted-foreground block mb-1 line-through opacity-50">
                    ¥{baseAmount.toLocaleString()}
                  </span>
                )}
                <span className="text-xl font-bold text-primary">¥{payableAmount.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground block">
                  {selectedPayType === 'monthly' ? '(月額・税込)' : '(全額分・税込)'}
                </span>
              </div>
            </div>
            {selectedPayType === 'monthly' && (
              <p className="text-[11px] text-muted-foreground text-right">
                契約期間合計 ¥{(payableAmount * months).toLocaleString()}（{months}回）
              </p>
            )}
          </div>

          <Separator />

          {/* ID Upload */}
          <div className="space-y-4">
            <Label className="text-base font-bold">本人確認書類の提出</Label>
            <p className="text-xs text-muted-foreground">運転免許証、パスポート、マイナンバーカードのいずれかをアップロードしてください。</p>

            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
            />

            <div className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 bg-slate-50 transition-colors hover:bg-slate-100">
              {idFileUploaded ? (
                <div className="flex flex-col items-center gap-2 text-emerald-600">
                  <FileCheck className="h-10 w-10" />
                  <p className="text-sm font-bold">書類を受領しました</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setIdFileUploaded(false); fileInputRef.current?.click(); }}>変更する</Button>
                </div>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Camera className="h-5 w-5" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : "ファイルを選択してアップロード"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">JPG, PNG, PDF (最大 10MB)</p>
                </>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="space-y-3 pt-4">
            <Button
              size="lg"
              className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20"
              onClick={handleRenew}
              disabled={isSubmitting || !idFileUploaded}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : '更新を申請する'}
            </Button>
            <Link href="/mypage/devices" className="block">
              <Button variant="ghost" className="w-full h-11 rounded-xl">
                キャンセル
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApplyRenewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>}>
      <RenewForm />
    </Suspense>
  );
}
