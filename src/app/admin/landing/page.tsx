'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, ShieldAlert, Layers, MessageCircle, HelpCircle, Briefcase, ArrowUpRight,
  MousePointerClick, Save, Rocket, Package, Eye
} from 'lucide-react';
import { UserProfile, GlobalSettings, LandingCtas, LandingCtaConfig, LandingCtaButton } from '@/types';
import { DEFAULT_LANDING_CTAS } from '@/components/landing/landing-cta-buttons';

const landingModules = [
  {
    title: '利用者の声',
    desc: 'お客様のコメント・肩書き・動画埋め込みを管理',
    icon: MessageCircle,
    href: '/admin/testimonials',
    color: 'text-pink-500',
    bg: 'bg-pink-50',
  },
  {
    title: 'FAQ',
    desc: 'よくある質問の追加・編集・公開/非公開切替',
    icon: HelpCircle,
    href: '/admin/faqs',
    color: 'text-cyan-500',
    bg: 'bg-cyan-50',
  },
  {
    title: '導入事例',
    desc: 'ケーススタディの追加・編集・業種タグ管理',
    icon: Briefcase,
    href: '/admin/case-studies',
    color: 'text-lime-600',
    bg: 'bg-lime-50',
  },
];

function CtaSlotEditor({
  title,
  button,
  onChange,
}: {
  title: string;
  button: LandingCtaButton;
  onChange: (next: LandingCtaButton) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{title}</span>
          {button.enabled ? (
            <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">表示</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">非表示</Badge>
          )}
        </div>
        <Switch
          checked={button.enabled}
          onCheckedChange={(checked) => onChange({ ...button, enabled: checked })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground">ボタンラベル</Label>
        <Input
          placeholder="例: 先行予約に登録する"
          value={button.label}
          onChange={(e) => onChange({ ...button, label: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground">遷移先URL</Label>
        <Input
          placeholder="/early-booking または https://..."
          value={button.url}
          onChange={(e) => onChange({ ...button, url: e.target.value })}
        />
        <p className="text-[11px] text-muted-foreground">
          サイト内ページは「/」始まり（例: /early-booking）、外部URLは「https://」始まりで入力してください。
        </p>
      </div>
    </div>
  );
}

function CtaModeEditor({
  config,
  onChange,
}: {
  config: LandingCtaConfig;
  onChange: (next: LandingCtaConfig) => void;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <CtaSlotEditor
        title="プライマリCTA"
        button={config.primary}
        onChange={(next) => onChange({ ...config, primary: next })}
      />
      <CtaSlotEditor
        title="セカンダリCTA"
        button={config.secondary}
        onChange={(next) => onChange({ ...config, secondary: next })}
      />
    </div>
  );
}

export default function AdminLandingPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const profileRef = useMemo(
    () => user ? doc(db, 'users', user.uid) : null,
    [db, user]
  );
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

  const settingsRef = useMemo(() => doc(db, 'settings', 'global'), [db]);
  const { data: settings, loading: settingsLoading } = useDoc<GlobalSettings>(settingsRef as any);

  const [landingCtas, setLandingCtas] = useState<LandingCtas>(DEFAULT_LANDING_CTAS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings?.landingCtas) {
      setLandingCtas(settings.landingCtas);
    }
  }, [settings?.landingCtas]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(settingsRef, { landingCtas, updatedAt: serverTimestamp() } as any);
      toast({ title: '保存しました', description: 'CTA設定が更新されました。' });
    } catch (e) {
      console.error('Save CTA error', e);
      toast({ variant: 'destructive', title: 'エラー', description: 'CTA設定の保存に失敗しました。' });
    } finally {
      setIsSaving(false);
    }
  };

  // Default visible until the admin explicitly turns it off (matches /about-twrental behavior).
  const showDeviceDigest = settings?.showDeviceDigest ?? true;

  const handleToggleDeviceDigest = async (checked: boolean) => {
    try {
      await updateDoc(settingsRef, { showDeviceDigest: checked, updatedAt: serverTimestamp() } as any);
      toast({ title: '更新しました', description: `対応機種ダイジェストを${checked ? '表示' : '非表示'}にしました。` });
    } catch (e) {
      console.error('Toggle deviceDigest error', e);
      toast({ variant: 'destructive', title: 'エラー', description: '更新に失敗しました。' });
    }
  };

  if (authLoading || (profileLoading && !profile)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || profile?.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <ShieldAlert className="h-20 w-20 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold font-headline">アクセス制限</h1>
        <p className="text-muted-foreground">管理者権限が必要です。</p>
        <Link href="/"><Button variant="outline" className="rounded-xl">トップページへ</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold font-headline flex items-center gap-3">
            <Layers className="h-8 w-8 text-primary" />
            ランディング
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            ランディングページ・静的ページに表示されるコンテンツの管理画面です。
          </p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードへ戻る</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {landingModules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="hover:shadow-xl transition-all duration-300 border-none rounded-3xl group cursor-pointer h-full bg-white">
              <CardContent className="p-8 flex flex-col space-y-4">
                <div className="flex items-start justify-between">
                  <div className={`p-4 rounded-2xl ${m.bg} ${m.color} group-hover:scale-110 transition-transform`}>
                    <m.icon className="h-6 w-6" />
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{m.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{m.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* CTA Configuration */}
      <Card className="border-none shadow-lg rounded-3xl bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
            <MousePointerClick className="h-5 w-5" />
            CTA設定
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            /about-twrental のヒーローセクションと最終CTAセクションに表示されるボタンを設定します。<br />
            プライマリ・セカンダリの2つを基本とし、それぞれ個別に表示/非表示を切替可能です。
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <Tabs defaultValue={settings?.preBookingMode ? 'on' : 'off'}>
                <TabsList className="grid w-full grid-cols-2 rounded-xl">
                  <TabsTrigger value="on" className="rounded-lg flex items-center gap-2">
                    <Rocket className="h-3.5 w-3.5" />
                    先行予約モード ON
                  </TabsTrigger>
                  <TabsTrigger value="off" className="rounded-lg">
                    先行予約モード OFF
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="on" className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground px-1">
                    先行予約モードが <span className="font-semibold text-rose-500">ON</span> の時に表示されるCTAです。
                  </p>
                  <CtaModeEditor
                    config={landingCtas.preBookingOn}
                    onChange={(next) => setLandingCtas((prev) => ({ ...prev, preBookingOn: next }))}
                  />
                </TabsContent>

                <TabsContent value="off" className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground px-1">
                    先行予約モードが <span className="font-semibold">OFF</span> の時に表示されるCTAです。
                  </p>
                  <CtaModeEditor
                    config={landingCtas.preBookingOff}
                    onChange={(next) => setLandingCtas((prev) => ({ ...prev, preBookingOff: next }))}
                  />
                </TabsContent>
              </Tabs>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving} className="rounded-xl px-6">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  CTA設定を保存
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section Visibility */}
      <Card className="border-none shadow-lg rounded-3xl bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
            <Eye className="h-5 w-5" />
            ランディングページ表示設定
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            /about-twrental（導入説明）ページ内の各セクションの表示/非表示を切り替えます。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50/80">
              <div className="space-y-1 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">対応機種ダイジェスト</span>
                  {showDeviceDigest ? (
                    <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">表示</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">非表示</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  /about-twrental に表示される「対応機種ダイジェスト」セクションの表示を制御します。
                  非表示にすると機器カード一覧が描画されません。
                </p>
              </div>
              <Switch
                checked={showDeviceDigest}
                onCheckedChange={handleToggleDeviceDigest}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-lg rounded-3xl bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-8 space-y-3">
          <h3 className="font-bold">対象ページ</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            上記コンテンツは <Link href="/about-twrental" className="text-primary underline font-medium">/about-twrental（導入説明）</Link> ページで表示されます。<br />
            各セクションはコンテンツが0件の場合、自動的に非表示になります（利用者の声・FAQ・導入事例）。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
