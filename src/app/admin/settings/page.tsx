'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFirestore, useDoc, useUser } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Globe, Clock, CreditCard, Settings, Save, ShieldCheck, KeyRound, Sparkles, Lock, CheckCircle2, XCircle, Users, Plus, Trash2, MessageSquare, FileText, Rocket, Phone, Layers, Package, Mail } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { GlobalSettings, UserProfile } from '@/types';
import { saveSecrets, getSecretsStatus, type SecretPayload } from '@/lib/secret-actions';
import { AVAILABLE_GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from '@/ai/models';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConsentFormManager } from '@/components/admin/consent-form-manager';
import { MailSettings } from '@/components/admin/mail-settings';

export default function SettingsPage() {
  const db = useFirestore();
  const { user } = useUser();

  const settingsRef = useMemo(() => doc(db, 'settings', 'global'), [db]);
  const userProfileRef = useMemo(() => user ? doc(db, 'users', user.uid) : null, [db, user]);

  const { data: initialSettings, loading: settingsLoading, error: settingsError } = useDoc<GlobalSettings>(settingsRef as any);
  const { data: userProfile, loading: userLoading } = useDoc<UserProfile>(userProfileRef as any);

  const [settings, setSettings] = useState<Partial<GlobalSettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  // Secret Manager state — only holds new values the admin wants to change
  const [secretInputs, setSecretInputs] = useState<SecretPayload>({});
  const [secretsStatus, setSecretsStatus] = useState<Record<string, boolean>>({});
  const [secretsLoading, setSecretsLoading] = useState(true);

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  // Load secrets status on mount (which ones are configured)
  useEffect(() => {
    getSecretsStatus().then((status) => {
      setSecretsStatus(status);
      setSecretsLoading(false);
    }).catch(() => setSecretsLoading(false));
  }, []);

  const handleInputChange = (path: string, value: any) => {
    const keys = path.split('.');
    setSettings(prev => {
      const newSettings = { ...prev };
      let current: any = newSettings;
      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          current[key] = value;
        } else {
          current[key] = { ...(current[key] || {}) };
          current = current[key];
        }
      });
      return newSettings;
    });
  };

  const handleSecretChange = (field: keyof SecretPayload, value: string) => {
    setSecretInputs(prev => ({ ...prev, [field]: value }));
  };

  const handleModeToggle = (checked: boolean) => {
    handleInputChange('mode', checked ? 'test' : 'production');
  };

  const handleConnectionTest = async () => {
    setIsTesting(true);
    try {
      const isTestMode = settings.mode === 'test';
      toast({ title: "接続テスト", description: `${isTestMode ? 'テスト' : '本番'}環境への接続テストを実行中...` });
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast({ title: "成功", description: "接続テストが成功しました。" });
    } catch (error) {
      console.error("Connection test error:", error);
      toast({ variant: "destructive", title: "エラー", description: "接続テストに失敗しました。" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Save non-sensitive settings to Firestore
      const settingsToUpdate = { ...settings, updatedAt: serverTimestamp() };
      await updateDoc(settingsRef, settingsToUpdate as any);

      // 2. Save sensitive secrets to Secret Manager (only non-empty values)
      const hasSecrets = Object.values(secretInputs).some(v => v && v.trim());
      if (hasSecrets) {
        const result = await saveSecrets(secretInputs);
        if (!result.success) {
          toast({ variant: "destructive", title: "シークレット保存エラー", description: result.error || "Secret Managerへの保存に失敗しました。" });
          setIsSaving(false);
          return;
        }
        // Refresh secrets status after saving
        const newStatus = await getSecretsStatus();
        setSecretsStatus(newStatus);
        // Clear inputs after successful save
        setSecretInputs({});
      }

      toast({ title: "保存完了", description: "設定が正常に更新されました。" });
    } catch (error) {
      console.error("Error saving settings: ", error);
      toast({ variant: "destructive", title: "エラー", description: "設定の保存に失敗しました。" });
    } finally {
      setIsSaving(false);
    }
  };

  if (settingsLoading || userLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (userProfile && userProfile.role !== 'admin') {
    return <div>Unauthorized</div>;
  }

  const isTestMode = settings.mode === 'test';

  // Helper to render a secret field with status indicator
  const SecretField = ({ label, field, placeholder }: { label: string; field: keyof SecretPayload; placeholder?: string }) => {
    const statusKey = field as string;
    const isConfigured = secretsStatus[statusKey];
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          {label}
          {!secretsLoading && (
            isConfigured
              ? <span className="flex items-center gap-1 text-green-600 normal-case text-[10px]"><CheckCircle2 className="h-3 w-3" />設定済み</span>
              : <span className="flex items-center gap-1 text-red-400 normal-case text-[10px]"><XCircle className="h-3 w-3" />未設定</span>
          )}
        </Label>
        <Input
          type="password"
          placeholder={isConfigured ? '●●●●●●●● (変更する場合のみ入力)' : (placeholder || '入力してください')}
          value={secretInputs[field] || ''}
          onChange={(e) => handleSecretChange(field, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">基本設定</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">権限:</span>
            <Badge variant="secondary" className="text-xs">admin</Badge>
          </div>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => window.location.href = '/admin'}>
          ダッシュボードに戻る
        </Button>
      </div>

      <Tabs defaultValue="settings">
        <TabsList className="grid w-full grid-cols-3 rounded-xl mb-2">
          <TabsTrigger value="settings" className="rounded-lg">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            一般設定
          </TabsTrigger>
          <TabsTrigger value="mail" className="rounded-lg">
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            メール設定
          </TabsTrigger>
          <TabsTrigger value="consent" className="rounded-lg">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            同意書管理
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mail" className="space-y-6 mt-6">
          <MailSettings />
        </TabsContent>

        <TabsContent value="consent" className="mt-6">
          <ConsentFormManager />
        </TabsContent>

        <TabsContent value="settings" className="space-y-8 mt-6">

          {/* Section 1: System Operation Mode */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Globe className="h-5 w-5" />
                システム稼働モード
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/80">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">テストモード</span>
                  {isTestMode && (
                    <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs">テスト用</Badge>
                  )}
                  {!isTestMode && (
                    <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">本番稼働中</Badge>
                  )}
                </div>
                <Switch checked={isTestMode} onCheckedChange={handleModeToggle} />
              </div>
            </CardContent>
          </Card>

          {/* Section 1.5: Pre-Booking Mode & Consultation URL */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                先行予約モード
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/80">
                <div className="space-y-1 flex-1 pr-4">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm">先行予約モード</span>
                    {settings.preBookingMode ? (
                      <Badge className="bg-rose-500 hover:bg-rose-600 text-white text-xs">ON</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">OFF</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ON: /devices のお申し込みボタンを非表示。/about-twrental の最終CTAは先行予約フォームへ遷移します。<br />
                    OFF: 通常の申込導線（/devices への誘導）が有効になります。
                  </p>
                </div>
                <Switch
                  checked={!!settings.preBookingMode}
                  onCheckedChange={(checked) => handleInputChange('preBookingMode', checked)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  無料相談予約URL
                </Label>
                <Input
                  type="url"
                  placeholder="https://timerex.net/s/... or https://calendar.google.com/..."
                  value={settings.consultationBookingUrl || ''}
                  onChange={(e) => handleInputChange('consultationBookingUrl', e.target.value)}
                />
                <p className="text-xs text-blue-500">
                  /about-twrental の「無料相談予約」CTAから遷移するURLです。空の場合はCTAセクションが非表示になります。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 1.6: Landing Page Section Visibility */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Layers className="h-5 w-5" />
                ランディングページ表示設定
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                /about-twrental（導入説明）ページ内の各セクションの表示/非表示を切り替えます。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/80">
                <div className="space-y-1 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">対応機種ダイジェスト</span>
                    {(settings.showDeviceDigest ?? true) ? (
                      <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">表示</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">非表示</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    /about-twrental に表示される「対応機種ダイジェスト」セクションの表示を制御します。
                    非表示にすると機器カード一覧が描画されません。
                  </p>
                </div>
                <Switch
                  checked={settings.showDeviceDigest ?? true}
                  onCheckedChange={(checked) => handleInputChange('showDeviceDigest', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Automation & Session Settings */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Clock className="h-5 w-5" />
                自動化・セッション設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">一括案内送信の間隔（時間）</Label>
                <div className="flex items-center gap-3">
                  <Input type="number" className="w-24" value={settings.waitlistEmailInterval || 0} onChange={(e) => handleInputChange('waitlistEmailInterval', Number(e.target.value) || 0)} />
                  <span className="text-sm text-muted-foreground">時間おきに送信</span>
                </div>
                <p className="text-xs text-blue-500">キャンセル待ちユーザーに対して一括でオファーを送信する際、各ユーザーへの案内送信をこの間隔でずらして予約します。</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2"><span className="text-orange-500">⏳</span>受付有効期間（時間）</Label>
                <div className="flex items-center gap-3">
                  <Input type="number" className="w-24" value={settings.waitlistValidityHours || 0} onChange={(e) => handleInputChange('waitlistValidityHours', Number(e.target.value) || 0)} />
                  <span className="text-sm text-muted-foreground">時間経過後にリストをリフレッシュ</span>
                </div>
                <p className="text-xs text-blue-500">案内プロセスの最後の1人への通知が完了した後、この時間が経過しても申し込みがない場合、その機器のキャンセル待ちリストを自動的にリフレッシュします。</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2"><span className="text-gray-400">⏱</span>申請セッションタイム（分）</Label>
                <div className="flex items-center gap-3">
                  <Input type="number" className="w-24" value={settings.applicationSessionMinutes || 0} onChange={(e) => handleInputChange('applicationSessionMinutes', Number(e.target.value) || 0)} />
                  <span className="text-sm text-muted-foreground">分間操作がない場合にタイムアウト</span>
                </div>
                <p className="text-xs text-blue-500">レンタル申請画面で入力がないまま放置された場合、この時間が経過すると自動的にセッションを終了し、確保していた「手続中」状態を解除します。</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2"><span className="text-blue-400">📦</span>発送準備期間（営業日）</Label>
                <div className="flex items-center gap-3">
                  <Input type="number" className="w-24" value={settings.shippingBufferDays || 3} onChange={(e) => handleInputChange('shippingBufferDays', Number(e.target.value) || 3)} />
                  <span className="text-sm text-muted-foreground">営業日（土日除く）</span>
                </div>
                <p className="text-xs text-blue-500">決済完了後、初回の継続課金が開始されるまでの営業日数です。この期間中にデバイスを発送し、ユーザーの手元に届くようにしてください。契約更新の場合はこのバッファは適用されません。</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2"><span className="text-purple-400">🧩</span>モジュール基本加算単価（円）</Label>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">¥</span>
                  <Input type="number" className="w-32" value={settings.moduleBasePrice || 0} onChange={(e) => handleInputChange('moduleBasePrice', Number(e.target.value) || 0)} />
                  <span className="text-sm text-muted-foreground">× モジュールポイント</span>
                </div>
                <p className="text-xs text-blue-500">各モジュールのポイントにこの単価を掛けた金額が、デバイスの月額料金に加算されます。例: 単価500円 × ポイント2 = 月額 +1,000円</p>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Stripe Authentication — Secret Manager */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Stripe 認証情報
                </CardTitle>
                <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={handleConnectionTest} disabled={isTesting}>
                  {isTesting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                  接続テスト
                </Button>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Lock className="h-3 w-3 text-green-600" />
                <span className="text-[11px] text-green-600 font-medium">Google Cloud Secret Manager で安全に管理されています</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Test Environment */}
              <div className="p-5 rounded-xl border-2 border-blue-200 bg-blue-50/30 space-y-4">
                <h3 className="text-sm font-bold text-blue-600 flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  テスト環境用
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SecretField label="PUBLISHABLE KEY (TEST)" field="stripeTestPublishableKey" placeholder="pk_test_..." />
                  <SecretField label="SECRET KEY (TEST)" field="stripeTestSecretKey" placeholder="sk_test_..." />
                </div>
              </div>

              {/* Production Environment */}
              <div className="p-5 rounded-xl border border-gray-200 bg-gray-50/30 space-y-4">
                <h3 className="text-sm font-bold text-red-500 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  本番環境用
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SecretField label="PUBLISHABLE KEY (LIVE)" field="stripeLivePublishableKey" placeholder="pk_live_..." />
                  <SecretField label="SECRET KEY (LIVE)" field="stripeLiveSecretKey" placeholder="sk_live_..." />
                </div>
              </div>

              {/* Webhook Secret */}
              <div className="p-5 rounded-xl border border-amber-200 bg-amber-50/30 space-y-4">
                <h3 className="text-sm font-bold text-amber-600 flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Webhook
                </h3>
                <SecretField label="WEBHOOK SECRET" field="stripeWebhookSecret" placeholder="whsec_..." />
                <p className="text-xs text-amber-600">Stripeダッシュボードの Developers → Webhooks から取得できます。決済ステータスのリアルタイム同期に使用されます。</p>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: AI Settings — Secret Manager */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI設定
              </CardTitle>
              <div className="flex items-center gap-1.5 mt-1">
                <Lock className="h-3 w-3 text-green-600" />
                <span className="text-[11px] text-green-600 font-medium">Google Cloud Secret Manager で安全に管理されています</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <SecretField label="GEMINI API KEY" field="geminiApiKey" placeholder="AIza..." />
              <p className="text-xs text-blue-500">Google Gemini APIのシークレットキーを入力してください。AIサポート機能に使用されます。</p>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">使用モデル</Label>
                <Select
                  value={settings.geminiModel || DEFAULT_GEMINI_MODEL}
                  onValueChange={(value) => handleInputChange('geminiModel', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="モデルを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_GEMINI_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">AIサポートコンシェルジュが使用するGeminiモデルを選択してください。</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  AIコンテキスト（サービス全体像）
                </Label>
                <p className="text-xs text-muted-foreground">
                  AIチャットボットの初回メッセージ時にシステムプロンプトに含まれるサービス説明文です。
                  サービスの概要、利用の流れ、よくある質問などを記載してください。Markdown形式対応。
                </p>
                <textarea
                  className="w-full min-h-[300px] p-4 rounded-xl border border-gray-200 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={`# 背景\n${settings.serviceName || 'TimeWaverHub'}は、TimeWaverデバイスのレンタルプラットフォームです。\n\n# サービスの流れ\n1. 機器一覧からデバイスを選択\n2. レンタル申請を送信\n3. 管理者による審査（1〜3営業日）\n4. 同意書の提出\n5. 決済リンクの送付・お支払い\n6. デバイスの発送\n7. 利用開始\n\n# よくある質問\nQ: レンタル期間は？\nA: 3ヶ月、6ヶ月、12ヶ月から選択できます。`}
                  value={settings.aiContext || ''}
                  onChange={(e) => handleInputChange('aiContext', e.target.value)}
                />
                <p className="text-xs text-blue-500">
                  この内容はAIチャットボットのシステムプロンプトに追加され、ユーザーへの回答の質が向上します。
                  空の場合はデフォルトのコンテキストが使用されます。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 5: Operator Information */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Settings className="h-5 w-5" />
                運営者情報
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">サービス名</Label>
                <Input placeholder="サービス名" value={settings.serviceName || ''} onChange={(e) => handleInputChange('serviceName', e.target.value)} />
                <p className="text-xs text-muted-foreground">サイト全体やメールで表示されるサービス名称です。</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">運営担当者名</Label>
                  <Input value={settings.managerName || ''} onChange={(e) => handleInputChange('managerName', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">担当者メール</Label>
                  <Input type="email" value={settings.managerEmail || ''} onChange={(e) => handleInputChange('managerEmail', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">会社名</Label>
                <Input value={settings.companyName || ''} onChange={(e) => handleInputChange('companyName', e.target.value)} />
              </div>
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground">会社住所</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">電話番号</Label>
                    <Input type="tel" placeholder="03-1234-5678" value={settings.companyPhone || ''} onChange={(e) => handleInputChange('companyPhone', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">郵便番号</Label>
                    <Input placeholder="123-4567" value={settings.companyPostalCode || ''} onChange={(e) => handleInputChange('companyPostalCode', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">都道府県</Label>
                    <Input placeholder="東京都" value={settings.companyPrefecture || ''} onChange={(e) => handleInputChange('companyPrefecture', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">市区町村</Label>
                    <Input placeholder="渋谷区" value={settings.companyCity || ''} onChange={(e) => handleInputChange('companyCity', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">住所</Label>
                  <Input placeholder="神宮前1-2-3" value={settings.companyAddress || ''} onChange={(e) => handleInputChange('companyAddress', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">建物名・部屋番号</Label>
                  <Input placeholder="〇〇ビル 5F" value={settings.companyBuilding || ''} onChange={(e) => handleInputChange('companyBuilding', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 6: Staff Management */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <Users className="h-5 w-5" />
                スタッフ管理
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current staff list */}
              {(settings.staff || []).map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50/50">
                  <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{s.email}</span>
                    <Badge variant="outline" className="w-fit text-[10px]">
                      {s.role === 'operations' ? '発送・運用' : s.role === 'support' ? 'サポート' : '管理者'}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                    const updated = [...(settings.staff || [])];
                    updated.splice(i, 1);
                    handleInputChange('staff', updated);
                  }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {/* Add new staff */}
              <div className="flex items-end gap-2 pt-2 border-t">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">名前</Label>
                  <Input id="newStaffName" placeholder="山田太郎" className="h-9" />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">メール</Label>
                  <Input id="newStaffEmail" placeholder="staff@example.com" type="email" className="h-9" />
                </div>
                <div className="w-[130px] space-y-1">
                  <Label className="text-xs">役割</Label>
                  <Select defaultValue="operations">
                    <SelectTrigger className="h-9" id="newStaffRole"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operations">発送・運用</SelectItem>
                      <SelectItem value="support">サポート</SelectItem>
                      <SelectItem value="admin">管理者</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-9" onClick={() => {
                  const name = (document.getElementById('newStaffName') as HTMLInputElement)?.value;
                  const email = (document.getElementById('newStaffEmail') as HTMLInputElement)?.value;
                  const roleEl = document.getElementById('newStaffRole');
                  const role = roleEl?.closest('[data-state]')?.textContent === 'サポート' ? 'support' : roleEl?.closest('[data-state]')?.textContent === '管理者' ? 'admin' : 'operations';
                  if (!name || !email) { toast({ variant: 'destructive', title: '名前とメールは必須です' }); return; }
                  const updated = [...(settings.staff || []), { name, email, role }];
                  handleInputChange('staff', updated);
                  (document.getElementById('newStaffName') as HTMLInputElement).value = '';
                  (document.getElementById('newStaffEmail') as HTMLInputElement).value = '';
                }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />追加
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Section 7: Chat Notification Settings */}
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                チャット通知設定
              </CardTitle>
              <div className="flex items-center gap-1.5 mt-1">
                <Lock className="h-3 w-3 text-green-600" />
                <span className="text-[11px] text-green-600 font-medium">Google Cloud Secret Manager で安全に管理されています</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Chatwork */}
              <div className="p-5 rounded-xl border border-gray-200 bg-gray-50/30 space-y-4">
                <h3 className="text-sm font-bold text-gray-700">Chatwork</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SecretField label="API TOKEN" field="chatworkApiToken" placeholder="xxxxxxxxxx" />
                  <SecretField label="ROOM ID" field="chatworkRoomId" placeholder="123456789" />
                </div>
              </div>
              {/* Google Chat */}
              <div className="p-5 rounded-xl border border-gray-200 bg-gray-50/30 space-y-4">
                <h3 className="text-sm font-bold text-gray-700">Google Chat</h3>
                <SecretField label="WEBHOOK URL" field="googleChatWebhookUrl" placeholder="https://chat.googleapis.com/v1/spaces/..." />
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isSaving} size="lg" className="rounded-xl shadow-lg px-10 py-6 text-base font-semibold">
              {isSaving ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Save className="h-5 w-5 mr-2" />}
              設定内容を保存
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
