
'use client';

import { useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, ShieldCheck, Camera, FileCheck, AlertCircle } from 'lucide-react';
import { Device, UserProfile } from '@/types';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';

function RenewForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const db = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const deviceId = searchParams.get('deviceId');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idFileUploaded, setIdFileUploaded] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>('');

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage) return;

    setIsSubmitting(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `renewal_id_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `identifications/${user.uid}/${fileName}`);
      
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
    if (!idFileUploaded) {
      toast({ variant: "destructive", title: "本人確認書類が必要です", description: "更新には最新の身分証明書の提示が必要です。" });
      return;
    }

    setIsSubmitting(true);

    const applicationData = {
      userId: user.uid,
      userName: `${profile?.familyName} ${profile?.givenName}`,
      userEmail: user.email,
      deviceId: device.id,
      deviceSerialNumber: device.serialNumber,
      deviceType: device.type,
      rentalType: 12, 
      payType: 'monthly',
      payAmount: device.price['12m'].monthly,
      status: 'pending',
      identificationImageUrl: uploadedFileUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isRenewal: true
    };

    addDoc(collection(db, 'applications'), applicationData)
      .then(() => {
        toast({ title: "契約更新の申請を送信しました", description: "管理者による確認後、決済案内をお送りします。" });
        router.push('/mypage/devices');
      })
      .finally(() => setIsSubmitting(false));
  };

  if (deviceLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-20 max-w-2xl">
      <Card className="border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white">
        <CardHeader className="bg-primary/5 p-12 text-center">
          <RefreshCw className="mx-auto h-16 w-16 text-primary mb-6" />
          <CardTitle className="text-3xl font-headline">契約更新・プラン変更</CardTitle>
          <CardDescription className="text-lg">
            {device?.type} の利用期間を延長します
          </CardDescription>
        </CardHeader>
        <CardContent className="p-12 space-y-8">
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>現在の契約満了後も継続してTimeWaverをご利用いただけるよう、更新手続きを行います。</p>
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl flex items-start gap-3 text-left">
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
              <p>更新にあたり、再度本人確認書類の提出をお願いしております。</p>
            </div>
          </div>

          <Separator />

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

            <div className="border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 bg-slate-50 transition-colors hover:bg-slate-100">
              {idFileUploaded ? (
                <div className="flex flex-col items-center gap-2 text-emerald-600">
                  <FileCheck className="h-12 w-12" />
                  <p className="text-sm font-bold">書類を受領しました</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setIdFileUploaded(false); fileInputRef.current?.click(); }}>変更する</Button>
                </div>
              ) : (
                <>
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Camera className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="rounded-xl mb-2" 
                      onClick={() => fileInputRef.current?.click()} 
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : "ファイルを選択してアップロード"}
                    </Button>
                    <p className="text-[10px] text-muted-foreground">JPG, PNG, PDF (最大 10MB)</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <Button 
              size="lg" 
              className="w-full h-16 rounded-2xl text-xl font-bold shadow-xl shadow-primary/20" 
              onClick={handleRenew}
              disabled={isSubmitting || !idFileUploaded}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : '更新を申請する'}
            </Button>
            <Link href="/mypage/devices" className="block">
              <Button variant="ghost" className="w-full h-12 rounded-xl">
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
