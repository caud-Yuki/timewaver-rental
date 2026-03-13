'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Settings, ShieldAlert, Globe, Key, CreditCard, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { GlobalSettings, UserProfile } from '@/types';
import { getFirstPayConfig, createCardToken } from '@/lib/firstpay';
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
    firstpay: {
      apiKey: '',
      bearerToken: '',
    }
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        ...settings,
        firstpay: settings.firstpay || { apiKey: '', bearerToken: '' }
      });
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || profile?.role !== 'admin') return;
    setIsSaving(true);

    setDoc(doc(db, 'settings', 'global'), {
      ...formData,
      updatedAt: serverTimestamp(),
    }, { merge: true })
      .then(() => {
        toast({ title: "設定を保存しました" });
      })
      .catch(() => {
        toast({ variant: "destructive", title: "保存に失敗しました" });
      })
      .finally(() => setIsSaving(false));
  };

  const handleTestConnection = async () => {
    if (!formData.firstpay?.apiKey || !formData.firstpay?.bearerToken) {
      toast({ variant: "destructive", title: "入力不足", description: "APIキーとトークンを入力してください。" });
      return;
    }

    setIsTesting(true);
    try {
      // We test the connection by trying to fetch the encryption key
      const config = {
        apiKey: formData.firstpay.apiKey,
        bearerToken: formData.firstpay.bearerToken,
        mode: formData.mode || 'test'
      };
      
      // Attempt a simple tokenization-related call to verify credentials
      // We'll mock a card token request just to see if the headers are accepted
      const API_BASE = config.mode === "production" ? "https://www.api.firstpay.jp" : "https://dev.api.firstpay.jp";
      const res = await fetch(`${API_BASE}/token/encryption/key`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "FIRSTPAY-PAYMENT-API-KEY": config.apiKey,
          "Authorization": `Bearer ${config.bearerToken}`
        }
      });

      if (res.ok) {
        toast({ title: "接続成功", description: "FirstPay APIとの通信に成功しました。" });
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
  if (profile?.role !== 'admin') return <div className="text-center py-20">アクセス権限がありません</div>;

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
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> システムモード</CardTitle>
            <CardDescription>FirstPay等の決済APIの動作環境を切り替えます</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-2xl">
              <div>
                <p className="font-bold">{formData.mode === 'production' ? '本番モード' : 'テストモード'}</p>
                <p className="text-xs text-muted-foreground">
                  現在は {formData.mode === 'production' ? '実売上が発生する本番環境' : '開発・テスト用のダミー環境'} が使用されます。
                </p>
              </div>
              <Switch 
                checked={formData.mode === 'production'} 
                onCheckedChange={(checked) => setFormData({...formData, mode: checked ? 'production' : 'test'})}
              />
            </div>
          </CardContent>
        </Card>

        {/* FirstPay Config */}
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> FirstPay 決済設定</CardTitle>
              <CardDescription>決済プロバイダーから提供された認証情報を入力します</CardDescription>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="rounded-xl" 
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              接続テスト
            </Button>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                FIRSTPAY-PAYMENT-API-KEY
                <TooltipProvider><Tooltip><TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger><TooltipContent>FirstPay管理画面から取得できる公開用のAPIキーです。</TooltipContent></Tooltip></TooltipProvider>
              </Label>
              <div className="relative">
                <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="APIキーを入力" 
                  className="pl-10 rounded-xl"
                  value={formData.firstpay?.apiKey || ''} 
                  onChange={e => setFormData({
                    ...formData, 
                    firstpay: { ...formData.firstpay!, apiKey: e.target.value }
                  })} 
                />
              </div>
              <p className="text-[10px] text-muted-foreground ml-1">※この値はすべてのリクエストヘッダーに含まれます。</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Authorization Bearer (Token)
                <TooltipProvider><Tooltip><TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger><TooltipContent>FirstPay管理画面から取得できるシークレットトークンです。通常は固定の値を入力します。</TooltipContent></Tooltip></TooltipProvider>
              </Label>
              <div className="relative">
                <ShieldAlert className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="ベアラートークンを入力" 
                  className="pl-10 rounded-xl"
                  type="password"
                  value={formData.firstpay?.bearerToken || ''} 
                  onChange={e => setFormData({
                    ...formData, 
                    firstpay: { ...formData.firstpay!, bearerToken: e.target.value }
                  })} 
                />
              </div>
              <p className="text-[10px] text-muted-foreground ml-1">※決済処理の認証に使用される静的なシークレットキーです。</p>
            </div>
          </CardContent>
        </Card>

        {/* Operator Info */}
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> 運営者情報</CardTitle>
            <CardDescription>特定商取引法に基づく表記やメール送信時に使用されます</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>担当者名</Label>
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
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>代表電話番号</Label>
                <Input value={formData.tel || ''} onChange={e => setFormData({...formData, tel: e.target.value})} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>問合せ電話番号</Label>
                <Input value={formData.contactNumber || ''} onChange={e => setFormData({...formData, contactNumber: e.target.value})} className="rounded-xl" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="rounded-xl px-12 shadow-lg" disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" /> : '設定を保存'}
          </Button>
        </div>
      </form>
    </div>
  );
}

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
