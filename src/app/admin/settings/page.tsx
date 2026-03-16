'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Globe, Key, CreditCard, ShieldCheck, Info, Settings as SettingsIcon, Clock, Hourglass, Timer } from 'lucide-react';
import { GlobalSettings, UserProfile } from '@/types';
import Link from 'next/link';

export default function AdminSettingsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const hasLoadedRef = useRef(false);

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'settings', 'global');
  }, [db]);
  const { data: settings, loading } = useDoc<GlobalSettings>(settingsRef as any);

  const [formData, setFormData] = useState<Partial<GlobalSettings>>({
    mode: 'test',
    firstpayTest: { apiKey: '', bearerToken: '' },
    firstpayProd: { apiKey: '', bearerToken: '' },
    managerName: '',
    managerEmail: '',
    companyName: '',
    tel: '',
    zipcode: '',
    address: '',
    waitlistEmailInterval: 24,
    waitlistValidityHours: 48,
    applicationSessionMinutes: 15
  });

  useEffect(() => {
    if (settings && !hasLoadedRef.current) {
      setFormData(prev => ({
        ...prev,
        ...settings,
        firstpayTest: {
          apiKey: settings.firstpayTest?.apiKey || '',
          bearerToken: settings.firstpayTest?.bearerToken || ''
        },
        firstpayProd: {
          apiKey: settings.firstpayProd?.apiKey || '',
          bearerToken: settings.firstpayProd?.bearerToken || ''
        },
        waitlistEmailInterval: settings.waitlistEmailInterval || 24,
        waitlistValidityHours: settings.waitlistValidityHours || 48,
        applicationSessionMinutes: settings.applicationSessionMinutes || 15
      }));
      hasLoadedRef.current = true;
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    if (profile?.role !== 'admin') {
      toast({ variant: "destructive", title: "権限エラー", description: "管理者権限が必要です。" });
      return;
    }
    
    setIsSaving(true);
    
    const dataToSave = {
      ...formData,
      firstpayTest: {
        apiKey: formData.firstpayTest?.apiKey?.trim() || '',
        bearerToken: formData.firstpayTest?.bearerToken?.trim().replace(/^Bearer\s+/i, '') || ''
      },
      firstpayProd: {
        apiKey: formData.firstpayProd?.apiKey?.trim() || '',
        bearerToken: formData.firstpayProd?.bearerToken?.trim().replace(/^Bearer\s+/i, '') || ''
      },
      waitlistEmailInterval: Number(formData.waitlistEmailInterval) || 24,
      waitlistValidityHours: Number(formData.waitlistValidityHours) || 48,
      applicationSessionMinutes: Number(formData.applicationSessionMinutes) || 15,
      updatedAt: serverTimestamp(),
    };

    setDoc(doc(db, 'settings', 'global'), dataToSave, { merge: true })
      .then(() => {
        toast({ title: "設定を保存しました" });
      })
      .catch((error) => {
        toast({ variant: "destructive", title: "保存に失敗しました", description: error.message });
      })
      .finally(() => setIsSaving(false));
  };

  const handleTestConnection = async () => {
    const currentCreds = formData.mode === 'production' ? formData.firstpayProd : formData.firstpayTest;
    
    if (!currentCreds?.apiKey || !currentCreds?.bearerToken) {
      toast({ variant: "destructive", title: "入力不足", description: "APIキーとトークンを入力してください。" });
      return;
    }

    setIsTesting(true);
    try {
      const API_BASE = formData.mode === "production" ? "https://www.api.firstpay.jp" : "https://dev.api.firstpay.jp";
      
      const res = await fetch(`${API_BASE}/token/encryption/key`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "FIRSTPAY-PAYMENT-API-KEY": currentCreds.apiKey.trim(),
          "Authorization": `Bearer ${currentCreds.bearerToken.trim().replace(/^Bearer\s+/i, '')}`
        }
      });

      if (res.ok) {
        toast({ title: "接続成功", description: "FirstPayとの通信に成功しました。" });
      } else {
        const errorText = await res.text();
        throw new Error(`認証失敗 (${res.status})`);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "接続失敗", description: error.message });
    } finally {
      setIsTesting(false);
    }
  };

  if (loading && !hasLoadedRef.current) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-8">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold font-headline">基本設定</h1>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>権限:</span>
            <Badge variant="outline">{profile?.role || 'loading...'}</Badge>
          </div>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2 text-primary"><Globe className="h-5 w-5" /> システム稼働モード</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between p-6 bg-secondary/20 rounded-[2rem] border border-white">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-xl">{formData.mode === 'production' ? '本番モード' : 'テストモード'}</p>
                  <Badge variant={formData.mode === 'production' ? 'default' : 'secondary'} className={formData.mode === 'production' ? 'bg-red-500' : 'bg-blue-500 text-white'}>
                    {formData.mode === 'production' ? '実売上発生' : 'テスト用'}
                  </Badge>
                </div>
              </div>
              <Switch 
                checked={formData.mode === 'production'} 
                onCheckedChange={(checked) => setFormData({...formData, mode: checked ? 'production' : 'test'})}
                className="scale-125"
              />
            </div>
          </CardContent>
        </Card>

        {/* Waitlist & Session Automation Settings */}
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2 text-amber-600"><Clock className="h-5 w-5" /> 自動化・セッション設定</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-10">
            <div className="space-y-2">
              <Label>一括案内送信の間隔（時間）</Label>
              <div className="flex items-center gap-4">
                <Input 
                  type="number" 
                  min="1"
                  max="168"
                  value={formData.waitlistEmailInterval} 
                  onChange={e => setFormData({...formData, waitlistEmailInterval: parseInt(e.target.value) || 0})} 
                  className="rounded-xl max-w-[120px]"
                />
                <span className="text-sm font-medium">時間おきに送信</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                キャンセル待ちユーザーに対して一括でオファーを送信する際、各ユーザーへの案内送信をこの間隔でずらして予約します。
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100">
              <Label className="flex items-center gap-2">
                <Hourglass className="h-4 w-4 text-amber-500" /> 受付有効期間（時間）
              </Label>
              <div className="flex items-center gap-4">
                <Input 
                  type="number" 
                  min="1"
                  max="720"
                  value={formData.waitlistValidityHours} 
                  onChange={e => setFormData({...formData, waitlistValidityHours: parseInt(e.target.value) || 0})} 
                  className="rounded-xl max-w-[120px]"
                />
                <span className="text-sm font-medium">時間経過後にリストをリフレッシュ</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                案内プロセスの最後の1人への通知が完了した後、この時間が経過しても申し込みがない場合、その機器のキャンセル待ちリストを自動的にリフレッシュします。
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-100">
              <Label className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" /> 申請セッションタイム（分）
              </Label>
              <div className="flex items-center gap-4">
                <Input 
                  type="number" 
                  min="1"
                  max="60"
                  value={formData.applicationSessionMinutes} 
                  onChange={e => setFormData({...formData, applicationSessionMinutes: parseInt(e.target.value) || 0})} 
                  className="rounded-xl max-w-[120px]"
                />
                <span className="text-sm font-medium">分間操作がない場合にタイムアウト</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                レンタル申請画面で入力がないまま放置された場合、この時間が経過すると自動的にセッションを終了し、確保していた「手続中」状態を解除します。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> FirstPay 認証情報</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting}>
              {isTesting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              接続テスト
            </Button>
          </CardHeader>
          <CardContent className="p-8 space-y-10">
            <div className={`space-y-4 p-6 rounded-2xl border-2 transition-all ${formData.mode === 'test' ? 'border-blue-500 bg-blue-50/30' : 'opacity-60'}`}>
              <h3 className="font-bold flex items-center gap-2 text-blue-600"><Key className="h-4 w-4" /> テスト環境用</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">API KEY (TEST)</Label>
                  <Input 
                    placeholder="TEST-API-KEY..." 
                    className="rounded-xl bg-white"
                    value={formData.firstpayTest?.apiKey || ''} 
                    onChange={e => setFormData({
                      ...formData, 
                      firstpayTest: { ...formData.firstpayTest!, apiKey: e.target.value }
                    })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">BEARER TOKEN (TEST)</Label>
                  <Input 
                    type="password"
                    placeholder="TEST-TOKEN..." 
                    className="rounded-xl bg-white"
                    value={formData.firstpayTest?.bearerToken || ''} 
                    onChange={e => setFormData({
                      ...formData, 
                      firstpayTest: { ...formData.firstpayTest!, bearerToken: e.target.value }
                    })} 
                  />
                </div>
              </div>
            </div>

            <div className={`space-y-4 p-6 rounded-2xl border-2 transition-all ${formData.mode === 'production' ? 'border-red-500 bg-red-50/30' : 'opacity-60'}`}>
              <h3 className="font-bold flex items-center gap-2 text-red-600"><ShieldCheck className="h-4 w-4" /> 本番環境用</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">API KEY (PROD)</Label>
                  <Input 
                    placeholder="PROD-API-KEY..." 
                    className="rounded-xl bg-white"
                    value={formData.firstpayProd?.apiKey || ''} 
                    onChange={e => setFormData({
                      ...formData, 
                      firstpayProd: { ...formData.firstpayProd!, apiKey: e.target.value }
                    })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">BEARER TOKEN (PROD)</Label>
                  <Input 
                    type="password"
                    placeholder="PROD-TOKEN..." 
                    className="rounded-xl bg-white"
                    value={formData.firstpayProd?.bearerToken || ''} 
                    onChange={e => setFormData({
                      ...formData, 
                      firstpayProd: { ...formData.firstpayProd!, bearerToken: e.target.value }
                    })} 
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><SettingsIcon className="h-5 w-5" /> 運営者情報</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>運営担当者名</Label>
                <Input value={formData.managerName || ''} onChange={e => setFormData({...formData, managerName: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>担当者メール</Label>
                <Input type="email" value={formData.managerEmail || ''} onChange={e => setFormData({...formData, managerEmail: e.target.value})} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>会社名</Label>
              <Input value={formData.companyName || ''} onChange={e => setFormData({...formData, companyName: e.target.value})} className="rounded-xl" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pb-12">
          <Button type="submit" size="lg" className="rounded-2xl px-16 h-16 text-lg font-bold shadow-xl" disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin h-6 w-6" /> : '設定内容を保存'}
          </Button>
        </div>
      </form>
    </div>
  );
}
