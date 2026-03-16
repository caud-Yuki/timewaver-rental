
'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Settings, ShieldAlert, Globe, Key, CreditCard, CheckCircle2, AlertTriangle, Info, ShieldCheck } from 'lucide-react';
import { GlobalSettings, UserProfile } from '@/types';
import Link from 'next/link';

export default function AdminSettingsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

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
    contactNumber: '',
    representativeName: '',
    zipcode: '',
    address: ''
  });

  // Only update formData when settings are loaded to prevent overwriting user input during a save
  useEffect(() => {
    if (settings) {
      setFormData({
        ...settings,
        firstpayTest: settings.firstpayTest || { apiKey: '', bearerToken: '' },
        firstpayProd: settings.firstpayProd || { apiKey: '', bearerToken: '' }
      });
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || profile?.role !== 'admin') {
      toast({ variant: "destructive", title: "権限エラー", description: "管理者としてログインしているか確認してください。" });
      return;
    }
    
    setIsSaving(true);
    console.log('[SETTINGS_DEBUG] Saving settings to Firestore:', formData);

    setDoc(doc(db, 'settings', 'global'), {
      ...formData,
      updatedAt: serverTimestamp(),
    }, { merge: true })
      .then(() => {
        toast({ title: "設定を保存しました" });
        console.log('[SETTINGS_DEBUG] Save successful');
      })
      .catch((error) => {
        console.error('[SETTINGS_DEBUG] Save failed:', error);
        toast({ variant: "destructive", title: "保存に失敗しました", description: error.message });
      })
      .finally(() => setIsSaving(false));
  };

  const handleTestConnection = async () => {
    const currentCreds = formData.mode === 'production' ? formData.firstpayProd : formData.firstpayTest;
    
    if (!currentCreds?.apiKey || !currentCreds?.bearerToken) {
      toast({ 
        variant: "destructive", 
        title: "入力不足", 
        description: `${formData.mode === 'production' ? '本番' : 'テスト'}用のAPIキーとトークンを入力してください。` 
      });
      return;
    }

    setIsTesting(true);
    try {
      const API_BASE = formData.mode === "production" ? "https://www.api.firstpay.jp" : "https://dev.api.firstpay.jp";
      const res = await fetch(`${API_BASE}/token/encryption/key`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "FIRSTPAY-PAYMENT-API-KEY": currentCreds.apiKey,
          "Authorization": `Bearer ${currentCreds.bearerToken}`
        }
      });

      if (res.ok) {
        toast({ title: "接続成功", description: `${formData.mode === 'production' ? '本番' : 'テスト'}環境との通信に成功しました。` });
      } else {
        const errorData = await res.json();
        throw new Error(errorData.errors?.[0]?.message || '認証に失敗しました。');
      }
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "接続失敗", 
        description: error.message || "APIキーまたはトークンが正しくない可能性があります。" 
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  if (profile?.role !== 'admin') return <div className="text-center py-20">アクセス権限がありません（ロール: {profile?.role || '未設定'}）</div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-headline">基本設定</h1>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* System Mode */}
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden border-2 border-primary/10">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2 text-primary"><Globe className="h-5 w-5" /> システム稼働モード</CardTitle>
            <CardDescription>FirstPay決済APIの動作環境を切り替えます。保存後に反映されます。</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between p-6 bg-secondary/20 rounded-[2rem] border border-white">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-xl">{formData.mode === 'production' ? '本番モード (Production)' : 'テストモード (Test/Sandbox)'}</p>
                  <Badge variant={formData.mode === 'production' ? 'default' : 'secondary'} className={formData.mode === 'production' ? 'bg-red-500' : 'bg-blue-500'}>
                    {formData.mode === 'production' ? '実売上発生' : 'テスト用'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  現在は {formData.mode === 'production' ? '実売上が発生する本番環境' : '開発・テスト用のダミー環境'} の設定が決済に使用されます。
                </p>
              </div>
              <Switch 
                checked={formData.mode === 'production'} 
                onCheckedChange={(checked) => setFormData({...formData, mode: checked ? 'production' : 'test'})}
                className="scale-125"
              />
            </div>
          </CardContent>
        </Card>

        {/* FirstPay Config */}
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> FirstPay 認証情報設定</CardTitle>
              <CardDescription>テスト用と本番用それぞれの認証情報を保存できます</CardDescription>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="rounded-xl border-primary text-primary hover:bg-primary/5" 
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              {formData.mode === 'production' ? '本番環境接続テスト' : 'テスト環境接続テスト'}
            </Button>
          </CardHeader>
          <CardContent className="p-8 space-y-10">
            
            {/* Test Credentials Group */}
            <div className={`space-y-4 p-6 rounded-2xl border-2 transition-all ${formData.mode === 'test' ? 'border-blue-500 bg-blue-50/30' : 'border-dashed border-muted bg-muted/5 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2 text-blue-600"><Key className="h-4 w-4" /> テスト環境用 (Test Mode)</h3>
                {formData.mode === 'test' && <Badge className="bg-blue-500">現在使用中</Badge>}
              </div>
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

            {/* Production Credentials Group */}
            <div className={`space-y-4 p-6 rounded-2xl border-2 transition-all ${formData.mode === 'production' ? 'border-red-500 bg-red-50/30' : 'border-dashed border-muted bg-muted/5 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2 text-red-600"><ShieldCheck className="h-4 w-4" /> 本番環境用 (Production Mode)</h3>
                {formData.mode === 'production' && <Badge className="bg-red-500">現在使用中</Badge>}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">API KEY (PRODUCTION)</Label>
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
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">BEARER TOKEN (PRODUCTION)</Label>
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

            <div className="bg-secondary/20 p-4 rounded-xl flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                FirstPay管理画面より、テスト用と本番用のそれぞれ2種類のキーを取得してください。モードを切り替える際は、必ず対応する環境のキーが入力されていることを確認し、右上の「接続テスト」で疎通を確認することをお勧めします。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Operator Info */}
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> 運営者情報設定</CardTitle>
            <CardDescription>特定商取引法に基づく表記や自動送信メールの署名等に使用されます</CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>運営担当者名</Label>
                <Input value={formData.managerName || ''} onChange={e => setFormData({...formData, managerName: e.target.value})} className="rounded-xl" placeholder="山田 太郎" />
              </div>
              <div className="space-y-2">
                <Label>担当者メールアドレス</Label>
                <Input type="email" value={formData.managerEmail || ''} onChange={e => setFormData({...formData, managerEmail: e.target.value})} className="rounded-xl" placeholder="admin@example.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>会社名 / 団体名</Label>
              <Input value={formData.companyName || ''} onChange={e => setFormData({...formData, companyName: e.target.value})} className="rounded-xl" placeholder="株式会社クロノレント" />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>代表電話番号</Label>
                <Input value={formData.tel || ''} onChange={e => setFormData({...formData, tel: e.target.value})} className="rounded-xl" placeholder="03-0000-0000" />
              </div>
              <div className="space-y-2">
                <Label>カスタマーサポート電話番号</Label>
                <Input value={formData.contactNumber || ''} onChange={e => setFormData({...formData, contactNumber: e.target.value})} className="rounded-xl" placeholder="0120-000-000" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pb-12">
          <Button type="submit" size="lg" className="rounded-2xl px-16 h-16 text-lg font-bold shadow-xl shadow-primary/20" disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin h-6 w-6" /> : '設定内容をすべて保存'}
          </Button>
        </div>
      </form>
    </div>
  );
}
