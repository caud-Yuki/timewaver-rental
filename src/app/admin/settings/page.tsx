
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
import { Loader2, Settings, ShieldAlert, Globe, Mail, Phone } from 'lucide-react';
import { GlobalSettings, UserProfile } from '@/types';

export default function AdminSettingsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

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
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings);
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  if (profile?.role !== 'admin') return <div className="text-center py-20">アクセス権限がありません</div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-headline">基本設定</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> システムモード</CardTitle>
            <CardDescription>API連携（FirstPay等）の動作環境を切り替えます</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-2xl">
              <div>
                <p className="font-bold">{formData.mode === 'production' ? '本番モード' : 'テストモード'}</p>
                <p className="text-xs text-muted-foreground">現在は {formData.mode === 'production' ? '実際の決済が行われます' : 'テスト用APIが使用されます'} </p>
              </div>
              <Switch 
                checked={formData.mode === 'production'} 
                onCheckedChange={(checked) => setFormData({...formData, mode: checked ? 'production' : 'test'})}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> 運営者情報</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>担当者名</Label>
                <Input value={formData.managerName || ''} onChange={e => setFormData({...formData, managerName: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>担当者メール</Label>
                <Input type="email" value={formData.managerEmail || ''} onChange={e => setFormData({...formData, managerEmail: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>会社名</Label>
              <Input value={formData.companyName || ''} onChange={e => setFormData({...formData, companyName: e.target.value})} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>代表電話番号</Label>
                <Input value={formData.tel || ''} onChange={e => setFormData({...formData, tel: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>問合せ電話番号</Label>
                <Input value={formData.contactNumber || ''} onChange={e => setFormData({...formData, contactNumber: e.target.value})} />
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
