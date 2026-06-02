'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, addDoc, collection, serverTimestamp, where, query, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, Briefcase, Building2, User as UserIcon } from 'lucide-react';
import { Device, deviceConverter, UserProfile, userProfileConverter, ApplicantType } from '@/types';
import { cn } from '@/lib/utils';

export default function WaitlistPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>}>
      <WaitlistForm />
    </Suspense>
  );
}

function WaitlistForm() {
  const { user, loading: userLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deviceId = searchParams.get('deviceId');
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyOnWaitlist, setAlreadyOnWaitlist] = useState(false);
  const [applicantType, setApplicantType] = useState<ApplicantType>('individual');
  const [corporateNumber, setCorporateNumber] = useState('');
  const [companyName, setCompanyName] = useState('');

  const deviceRef = useMemo(() =>
    deviceId ? doc(db, 'devices', deviceId).withConverter(deviceConverter) : null
  , [db, deviceId]);
  const { data: device, loading: deviceLoading } = useDoc<Device>(deviceRef);

  const profileRef = user ? doc(db, 'users', user.uid).withConverter(userProfileConverter) : null;
  const { data: profile } = useDoc<UserProfile>(profileRef);

  // Prefill applicant type / company from the user's saved profile when available.
  useEffect(() => {
    if (!profile) return;
    if (profile.applicantType) setApplicantType(profile.applicantType);
    if (profile.companyName) setCompanyName(profile.companyName);
  }, [profile]);

  useEffect(() => {
    if (user && device) {
      const checkWaitlist = async () => {
        const q = query(
          collection(db, 'waitlist'),
          where('userId', '==', user.uid),
          where('deviceType', '==', device.type)
        );
        const snapshot = await getDocs(q);
        setAlreadyOnWaitlist(!snapshot.empty);
      };
      checkWaitlist();
    }
  }, [user, device, db]);

  const handleWaitlistSubmit = async () => {
    if (!user || !device) return;

    if (applicantType === 'corporate' && !companyName.trim()) {
      toast({ variant: "destructive", title: "会社名を入力してください", description: "法人として登録する場合、会社名は必須です。" });
      return;
    }

    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'waitlist'), {
        userId: user.uid,
        userEmail: user.email || '',
        userName: profile ? `${profile.familyName} ${profile.givenName}` : (user.email || '-'),
        deviceId: device.id,
        deviceType: device.type, // Correctly use device.type
        status: 'waiting',
        applicantType,
        companyName: applicantType === 'corporate' ? companyName.trim() : '',
        corporateNumber: applicantType === 'corporate' ? corporateNumber.trim() : '',
        createdAt: serverTimestamp(), // Correctly use serverTimestamp
      });

      toast({ 
        title: "キャンセル待ちに登録しました", 
        description: "在庫が確保され次第、ご案内をお送りします。"
      });
      router.push('/mypage/waitlist');

    } catch (error: any) {
        console.error("Error adding to waitlist: ", error);
        toast({ 
            variant: "destructive",
            title: "登録エラー", 
            description: "キャンセル待ちの登録中にエラーが発生しました。" 
        });
    } finally {
      setIsSubmitting(false);
    }
  };

  const loading = userLoading || deviceLoading;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

  if (!deviceId || !device) {
    return <div className="text-center py-20">デバイスが見つかりません。</div>;
  }

  return (
    <div className="container mx-auto max-w-lg py-12">
      <Card className="border-none shadow-xl rounded-[2rem] bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">キャンセル待ち登録</CardTitle>
          <CardDescription className="pt-2">ご希望のデバイスの在庫が確保でき次第、メールでお知らせします。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="border rounded-xl p-4 bg-slate-50/70 space-y-3">
            <div>
              <h3 className="text-xs text-muted-foreground">対象デバイス</h3>
              <p className="font-bold text-lg">{device.type}</p>
              <p className="font-mono text-xs text-muted-foreground">{device.type}</p>
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground">登録メールアドレス</h3>
              <p className="font-semibold">{user?.email}</p>
            </div>
          </div>

          {!alreadyOnWaitlist && (
            <>
              {/* Applicant type — used for B2B-priority offer dispatch */}
              <div className="space-y-3">
                <Label className="text-sm font-bold flex items-center gap-2">
                  <Briefcase className="h-4 w-4" /> 申込タイプ
                </Label>
                <div className="inline-flex w-full rounded-2xl border-2 border-muted bg-slate-50 p-1">
                  {([
                    { key: 'individual' as ApplicantType, label: '個人', icon: UserIcon },
                    { key: 'corporate' as ApplicantType, label: '法人', icon: Building2 },
                  ]).map(({ key, label, icon: Icon }) => {
                    const selected = applicantType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setApplicantType(key)}
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
                  本サービスは法人のお客様のお申込みを優先してご案内しております。
                </p>
              </div>

              {applicantType === 'corporate' && (
                <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-indigo-600" />
                    <Label className="text-sm font-bold text-indigo-900">法人情報</Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wl-companyName" className="text-xs">法人名 / 会社名 <span className="text-red-500">*</span></Label>
                    <Input id="wl-companyName" placeholder="株式会社〇〇" className="rounded-xl bg-white" value={companyName} onChange={e => setCompanyName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wl-corporateNumber" className="text-xs">法人番号</Label>
                    <Input id="wl-corporateNumber" placeholder="13桁の法人番号" className="rounded-xl bg-white" value={corporateNumber} onChange={e => setCorporateNumber(e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}

          {alreadyOnWaitlist ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0"/>
              <p className="text-sm text-amber-900">既にこのタイプのデバイスのキャンセル待ちに登録済みです。 <br/>状況はマイページの<a href="/mypage/waitlist" className="font-bold underline">キャンセル待ち状況</a>から確認できます。</p>
            </div>
          ) : (
            <Button onClick={handleWaitlistSubmit} disabled={isSubmitting} className="w-full h-12 text-base font-bold rounded-xl shadow-lg">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '同意して登録する'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
