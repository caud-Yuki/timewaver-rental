'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useFirestore, useDoc } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Rocket, CheckCircle2, ChevronLeft, Sparkles } from 'lucide-react';
import { useServiceName } from '@/hooks/use-service-name';
import { GlobalSettings } from '@/types';

const DEVICE_OPTIONS = [
  'TimeWaver Mobile',
  'TimeWaver Mobile Quantum',
  'TimeWaver Tabletop',
];

export default function EarlyBookingPage() {
  const db = useFirestore();
  const { toast } = useToast();
  const serviceName = useServiceName();

  const settingsRef = useMemo(() => db ? doc(db, 'settings', 'global') : null, [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', companyName: '', desiredDevice: '', message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      toast({ variant: 'destructive', title: 'お名前とメールアドレスは必須です' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast({ variant: 'destructive', title: 'メールアドレスの形式が正しくありません' });
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'earlyBookings'), {
        name: form.name,
        email: form.email,
        phone: form.phone || '',
        companyName: form.companyName || '',
        desiredDevice: form.desiredDevice || '',
        message: form.message || '',
        status: 'new',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err: any) {
      toast({ variant: 'destructive', title: '送信に失敗しました', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Pre-booking mode OFF → この画面には来ないはずだが、安全策として案内を表示
  if (settings && settings.preBookingMode === false) {
    return (
      <div className="container mx-auto px-4 py-24 text-center space-y-6 max-w-xl">
        <Sparkles className="h-16 w-16 text-primary mx-auto" />
        <h1 className="text-3xl font-bold">現在は通常お申し込みを受付中です</h1>
        <p className="text-muted-foreground">
          先行予約は現在クローズしています。機器ラインナップから直接お申し込みいただけます。
        </p>
        <Link href="/devices">
          <Button className="rounded-xl">機器ラインナップを見る</Button>
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="container mx-auto px-4 py-24 max-w-xl">
        <Card className="border-none shadow-2xl rounded-3xl text-center">
          <CardContent className="p-12 space-y-6">
            <div className="h-20 w-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="font-headline text-2xl font-bold">先行予約を受け付けました</h1>
            <p className="text-muted-foreground leading-relaxed">
              ご登録ありがとうございます。<br />
              確認メールを <span className="font-semibold">{form.email}</span> 宛にお送りしました。<br />
              担当者より改めてご連絡差し上げます。
            </p>
            <Link href="/">
              <Button variant="outline" className="rounded-xl">
                <ChevronLeft className="h-4 w-4 mr-1" />トップへ戻る
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <div className="text-center space-y-4 mb-10">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Rocket className="h-8 w-8" />
        </div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold">先行予約フォーム</h1>
        <p className="text-muted-foreground">
          {serviceName} の正式ローンチ時に優先的にご案内いたします。<br />
          下記フォームよりご登録ください。
        </p>
      </div>

      <Card className="border-none shadow-xl rounded-3xl">
        <CardHeader>
          <CardTitle className="text-lg">お客様情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>お名前 <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>会社名・屋号</Label>
                <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>メールアドレス <span className="text-destructive">*</span></Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>電話番号</Label>
                <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ご興味のある機器</Label>
              <Select value={form.desiredDevice} onValueChange={(v) => setForm({ ...form, desiredDevice: v })}>
                <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                <SelectContent>
                  {DEVICE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ご質問・ご要望（任意）</Label>
              <Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>

            <div className="flex items-center justify-between pt-4">
              <Link href="/about-twrental">
                <Button type="button" variant="ghost"><ChevronLeft className="h-4 w-4 mr-1" />戻る</Button>
              </Link>
              <Button type="submit" disabled={submitting} size="lg" className="rounded-xl px-10 font-bold">
                {submitting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Rocket className="h-5 w-5 mr-2" />}
                先行予約する
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
