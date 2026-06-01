'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Edit, Trash2, Mail, Loader2, Palette, Eye, ShieldAlert, MessageSquare, Send, Plus, X, Link as LinkIcon, Sparkles } from 'lucide-react';
import { EmailTemplate, emailTemplateConverter, GlobalSettings } from '@/types';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { testGoogleChatTemplatePreview } from '@/lib/secret-actions';
import { SYSTEM_TEMPLATES } from '@/lib/email-defaults';

type DisplayTemplate = EmailTemplate & { isSystemDefault?: boolean };

export default function EmailTemplatesPage() {
  const db = useFirestore();
  const templatesQuery = useMemo(() => query(collection(db, 'emailTemplates'), orderBy('createdAt', 'desc')).withConverter(emailTemplateConverter), [db]);
  const { data: templates, loading } = useCollection<EmailTemplate>(templatesQuery as any);
  const { toast } = useToast();

  // Merge Firestore templates with built-in system templates so admins can see
  // and customize the system defaults from this screen. Editing a system
  // template creates a Firestore document with the same id, which overrides it.
  const displayTemplates: DisplayTemplate[] = useMemo(() => {
    const fromDb = templates || [];
    const systemOnly = SYSTEM_TEMPLATES.filter(s => !fromDb.some(t => t.id === s.id));
    const systemRows: DisplayTemplate[] = systemOnly.map(s => ({
      id: s.id,
      type: s.type,
      name: s.name,
      subject: s.subject,
      body: s.body,
      isAdmin: !!s.isAdmin,
      isSystemDefault: true,
      createdAt: null as any,
      updatedAt: null as any,
    }));
    return [...fromDb, ...systemRows];
  }, [templates]);

  const settingsRef = useMemo(() => doc(db, 'settings', 'global'), [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  // Form state
  const [formType, setFormType] = useState('');
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formChatSubject, setFormChatSubject] = useState('');
  const [formChatBody, setFormChatBody] = useState('');
  const [formChatFormat, setFormChatFormat] = useState<'text' | 'card'>('text');
  const [formChatButtons, setFormChatButtons] = useState<Array<{ label: string; url: string }>>([]);
  const [editorTab, setEditorTab] = useState<'email' | 'chat'>('email');
  const [testDestinationId, setTestDestinationId] = useState<string>('');
  const [testSending, setTestSending] = useState(false);

  // Design state
  const [design, setDesign] = useState({
    primaryColor: '#2563eb',
    buttonColor: '#2563eb',
    buttonRadius: '8px',
    fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
    footerText: `© ${new Date().getFullYear()} {{serviceName}}. All rights reserved.\nこのメールは{{serviceName}}システムから自動送信されています。`,
  });

  useEffect(() => {
    if (settings?.emailDesign) {
      setDesign(prev => ({ ...prev, ...settings.emailDesign }));
    }
  }, [settings]);

  const openCreate = () => {
    setEditingTemplate(null);
    setFormType('');
    setFormName('');
    setFormSubject('');
    setFormBody('');
    setFormIsAdmin(false);
    setFormChatSubject('');
    setFormChatBody('');
    setFormChatFormat('text');
    setFormChatButtons([]);
    setEditorTab('email');
    setIsFormOpen(true);
  };

  const openEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormType(template.type || '');
    setFormName(template.name || '');
    setFormSubject(template.subject || '');
    setFormBody(template.body || '');
    setFormIsAdmin(template.isAdmin ?? false);
    setFormChatSubject(template.chatSubject || '');
    setFormChatBody(template.chatBody || '');
    setFormChatFormat((template.chatFormat as 'text' | 'card') || 'text');
    setFormChatButtons(Array.isArray(template.chatCardButtons) ? template.chatCardButtons : []);
    setEditorTab('email');
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    const missing: string[] = [];
    if (!formType?.trim()) missing.push('テンプレートタイプ');
    if (!formName?.trim()) missing.push('テンプレート名');
    if (!formSubject?.trim()) missing.push('件名');
    if (!formBody?.trim()) missing.push('本文');
    if (missing.length > 0) {
      toast({
        variant: 'destructive',
        title: '必須項目が未入力です',
        description: `${missing.join(' / ')} を入力してください。`,
      });
      return;
    }
    try {
      const data: any = {
        type: formType, name: formName, subject: formSubject, body: formBody,
        isAdmin: formIsAdmin,
        chatSubject: formChatSubject || '',
        chatBody: formChatBody || '',
        chatFormat: formChatFormat,
        chatCardButtons: formChatButtons.filter((b) => b.label.trim() && b.url.trim()),
        updatedAt: serverTimestamp(),
      };
      const existing = editingTemplate as DisplayTemplate | null;
      if (existing?.id && !existing.isSystemDefault) {
        // Existing Firestore-backed template — patch in place.
        await updateDoc(doc(db, 'emailTemplates', existing.id), data);
        toast({ title: '更新しました' });
      } else if (existing?.isSystemDefault && existing.id) {
        // First customization of a system default — create override with the same id.
        await setDoc(doc(db, 'emailTemplates', existing.id), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast({ title: 'カスタマイズ版を保存しました', description: 'この設定がシステム標準より優先されます。' });
      } else {
        // Brand-new template — let Firestore generate the id.
        await addDoc(collection(db, 'emailTemplates'), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast({ title: '作成しました' });
      }
      setIsFormOpen(false);
      setEditingTemplate(null);
    } catch (e: any) {
      console.error('[email-templates] save error', e);
      toast({ variant: 'destructive', title: 'エラー', description: e?.message || '保存に失敗しました。' });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("このテンプレートを削除しますか？")) {
      try {
        await deleteDoc(doc(db, 'emailTemplates', id));
        toast({ title: "削除しました" });
      } catch (e) {
        toast({ variant: "destructive", title: "削除に失敗しました" });
      }
    }
  };

  const handleTestChatSend = async () => {
    if (!testDestinationId) {
      toast({ variant: 'destructive', title: '送信先を選択してください' });
      return;
    }
    setTestSending(true);
    try {
      const result = await testGoogleChatTemplatePreview({
        destinationId: testDestinationId,
        format: formChatFormat,
        subject: (formChatSubject || formSubject).trim(),
        body: (formChatBody || '').trim() || '(Chat 用本文が空のため、本番ではメール本文がプレーンテキスト変換されます)',
        cardButtons: formChatButtons,
        serviceName: settings?.serviceName,
      });
      if (result.success) {
        toast({ title: 'テスト送信成功', description: '選択した宛先に送信しました。Google Chat で確認してください。' });
      } else {
        toast({ variant: 'destructive', title: 'テスト送信失敗', description: result.error });
      }
    } finally {
      setTestSending(false);
    }
  };

  const handleSaveDesign = async () => {
    try {
      await updateDoc(settingsRef, { emailDesign: design, updatedAt: serverTimestamp() });
      toast({ title: "デザイン設定を保存しました" });
    } catch (e) {
      toast({ variant: "destructive", title: "保存に失敗しました" });
    }
  };

  const buildEmailHtml = (subject: string, bodyContent: string, isStaff: boolean = false) => {
    const d = design;
    const isRichHtml = bodyContent.includes('<') && bodyContent.includes('>');
    const processedBody = isRichHtml ? bodyContent : bodyContent.replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
.email-body p { margin: 0 0 4px 0; }
.email-body br { line-height: 1.6; }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:${d.fontFamily};">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<!-- Header -->
<tr><td style="background-color:${isStaff ? '#374151' : d.primaryColor};padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${settings?.serviceName || 'TimeWaverHub'}</h1>
${isStaff ? '<p style="margin:4px 0 0;color:#9ca3af;font-size:11px;">管理者通知</p>' : ''}
</td></tr>
<!-- Body -->
<tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
<div class="email-body" style="color:#1f2937;font-size:14px;line-height:1.6;">${processedBody}</div>
</td></tr>
<!-- Footer -->
<tr><td style="background-color:#f9fafb;padding:24px 32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
<p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">${(d.footerText || '').replace(/\n/g, '<br>')}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  };

  const handlePreview = (template?: EmailTemplate) => {
    const subject = template?.subject || formSubject || 'プレビュー';
    const body = template?.body || formBody || '';
    const isStaff = template ? (template.isAdmin ?? false) : formIsAdmin;
    setPreviewHtml(buildEmailHtml(subject, body, isStaff));
    setShowPreview(true);
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Mail className="h-8 w-8 text-primary" /> メールテンプレート管理
          </h1>
          <p className="text-muted-foreground">自動送信メールのテンプレートを作成・管理します。</p>
        </div>
        <Button className="rounded-xl" onClick={openCreate}>
          <PlusCircle className="h-4 w-4 mr-2" /> 新規テンプレートを作成
        </Button>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="bg-white border rounded-xl h-11 p-1">
          <TabsTrigger value="templates" className="rounded-lg px-4 flex items-center gap-2"><Mail className="h-4 w-4" /> テンプレート一覧</TabsTrigger>
          <TabsTrigger value="design" className="rounded-lg px-4 flex items-center gap-2"><Palette className="h-4 w-4" /> デザイン設定</TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-6">
          {/* Template edit dialog */}
          <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingTemplate(null); setShowPlaceholders(false); setFormIsAdmin(false); } }}>
            <DialogContent className={`max-h-[90vh] overflow-y-auto transition-all ${showPlaceholders ? 'sm:max-w-5xl' : 'sm:max-w-3xl'}`}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {editingTemplate ? 'メールテンプレートを編集' : '新規メールテンプレートを作成'}
                  {formIsAdmin && (
                    <Badge className="bg-gray-700 text-white text-[10px] px-2 py-0.5 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> 管理用
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>{'{{userName}}'} のようなプレースホルダーを使用できます。リッチテキストでHTMLメールを作成できます。</DialogDescription>
              </DialogHeader>
              <div className={`flex gap-4 ${showPlaceholders ? '' : ''}`}>
                {/* Main editor */}
                <div className="flex-1 space-y-4 py-4 min-w-0">
                  {/* isAdmin toggle */}
                  <div className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${formIsAdmin ? 'border-gray-400 bg-gray-50' : 'border-border bg-background'}`}>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className={`h-4 w-4 ${formIsAdmin ? 'text-gray-700' : 'text-muted-foreground'}`} />
                        <Label className={`font-semibold ${formIsAdmin ? 'text-gray-800' : ''}`}>管理用メール</Label>
                      </div>
                      <p className="text-[11px] text-muted-foreground">ONにすると管理者・スタッフ向けデザイン（グレーヘッダー）が適用されます。</p>
                    </div>
                    <Switch checked={formIsAdmin} onCheckedChange={setFormIsAdmin} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>テンプレートタイプ</Label>
                      <Input value={formType} onChange={(e) => setFormType(e.target.value)} placeholder="例: application" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>テンプレート名</Label>
                      <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
                    </div>
                  </div>
                  <Tabs value={editorTab} onValueChange={(v: any) => setEditorTab(v)}>
                    <TabsList className="bg-secondary/50 rounded-xl h-10 grid grid-cols-2 w-full max-w-sm">
                      <TabsTrigger value="email" className="rounded-lg flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5" /> メール
                      </TabsTrigger>
                      <TabsTrigger value="chat" className="rounded-lg flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5" /> Chat
                        {formChatBody && <Badge variant="outline" className="text-[9px] h-4 px-1 ml-0.5">設定済</Badge>}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="email" className="mt-4 space-y-4">
                      <div className="space-y-1.5">
                        <Label>件名</Label>
                        <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>本文（リッチテキスト）</Label>
                        <RichTextEditor value={formBody} onChange={setFormBody} placeholder="メール本文を入力..." />
                      </div>
                    </TabsContent>

                    <TabsContent value="chat" className="mt-4 space-y-4">
                      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-700 leading-relaxed">
                        <strong>Google Chat 用の文面を編集</strong>します。空欄のままでも構いません — その場合は<strong>メール本文がプレーンテキスト変換されて送信</strong>されます。<br />
                        Google Chat は HTML をレンダリングしないため、<code className="bg-blue-100 px-1 rounded">*太字*</code>、<code className="bg-blue-100 px-1 rounded">_斜体_</code>、<code className="bg-blue-100 px-1 rounded">`コード`</code> など簡易マークダウンが使えます。
                      </div>

                      {/* Format selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">送信形式</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFormChatFormat('text')}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${formChatFormat === 'text' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                          >
                            <div className="font-bold text-sm flex items-center gap-2">
                              <MessageSquare className="h-3.5 w-3.5" />テキスト形式
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1">シンプル。`*件名*` の太字 + 本文。</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormChatFormat('card')}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${formChatFormat === 'card' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                          >
                            <div className="font-bold text-sm flex items-center gap-2">
                              <LinkIcon className="h-3.5 w-3.5" />カード形式
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1">ヘッダー＋本文＋ボタンで視認性UP。</div>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-2">
                          {formChatFormat === 'card' ? 'カードタイトル（任意）' : 'Chat 用 件名（任意）'}
                          <span className="text-[10px] font-normal text-muted-foreground">空欄ならメール件名を使用</span>
                        </Label>
                        <Input
                          value={formChatSubject}
                          onChange={(e) => setFormChatSubject(e.target.value)}
                          placeholder="例: 🔔 新規申込が届きました"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-2">
                          Chat 用 本文（任意）
                          <span className="text-[10px] font-normal text-muted-foreground">空欄ならメール本文を変換して使用</span>
                        </Label>
                        <Textarea
                          value={formChatBody}
                          onChange={(e) => setFormChatBody(e.target.value)}
                          rows={10}
                          placeholder={'例:\n*{{userName}}* 様から新しい申込がありました\n\n• 機器: {{deviceType}}\n• 期間: {{rentalType}}\n• 金額: ¥{{payAmount}}\n\n→ 管理画面で詳細確認: {{linkApplications}}'}
                          className="font-mono text-xs"
                        />
                      </div>

                      {/* Card buttons editor (only when card format) */}
                      {formChatFormat === 'card' && (
                        <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold">カード CTA ボタン</Label>
                            <span className="text-[10px] text-muted-foreground">クリックで指定 URL に遷移します</span>
                          </div>
                          {formChatButtons.length === 0 && (
                            <p className="text-[11px] text-muted-foreground italic px-1">ボタン未設定。下のボタンから追加できます。</p>
                          )}
                          {formChatButtons.map((btn, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                placeholder="ボタンラベル（例: 管理画面で確認）"
                                value={btn.label}
                                onChange={(e) => {
                                  const next = [...formChatButtons];
                                  next[i] = { ...btn, label: e.target.value };
                                  setFormChatButtons(next);
                                }}
                                className="h-9"
                              />
                              <Input
                                placeholder="https://... または {{linkAdminEarlyBookings}}"
                                value={btn.url}
                                onChange={(e) => {
                                  const next = [...formChatButtons];
                                  next[i] = { ...btn, url: e.target.value };
                                  setFormChatButtons(next);
                                }}
                                className="h-9 font-mono text-xs"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-destructive shrink-0"
                                onClick={() => setFormChatButtons(formChatButtons.filter((_, idx) => idx !== i))}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => setFormChatButtons([...formChatButtons, { label: '', url: '' }])}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />ボタンを追加
                          </Button>
                          <div className="text-[10px] text-muted-foreground leading-relaxed pt-1 space-y-1">
                            <p>
                              URL 内に <code className="bg-gray-100 px-1 rounded">{'{{linkAdminEarlyBookings}}'}</code> 等のプレースホルダーを使えます。実行時に絶対URLへ置換されます。
                            </p>
                            <p className="text-amber-700">
                              ⚠️ 「テスト送信」時はプレースホルダー URL がサンプルURLに置換されます（実際のリンクは確認できませんが、ボタン構造は確認できます）。
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Preview */}
                      {(formChatSubject || formChatBody) && (
                        formChatFormat === 'card' ? (
                          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                              <LinkIcon className="h-3 w-3" />Card プレビュー
                            </div>
                            <div className="bg-white rounded-xl border shadow-sm overflow-hidden max-w-md">
                              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b">
                                <div className="font-bold text-sm">{formChatSubject || formSubject || '(タイトル)'}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{settings?.serviceName || 'TimeWaverHub'}</div>
                              </div>
                              <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed">
                                {formChatBody || '(メール本文がここに変換挿入されます)'}
                              </div>
                              {formChatButtons.filter(b => b.label && b.url).length > 0 && (
                                <div className="px-4 pb-4 flex flex-wrap gap-2">
                                  {formChatButtons.filter(b => b.label && b.url).map((b, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium">
                                      {b.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                              <MessageSquare className="h-3 w-3" />Chat プレビュー
                            </div>
                            <div className="text-sm whitespace-pre-wrap leading-relaxed font-mono bg-gray-50 rounded-lg p-3 border">
                              <span className="font-bold">{formChatSubject || formSubject || '(件名)'}</span>
                              {'\n\n'}
                              {formChatBody || '(メール本文がここに変換挿入されます)'}
                            </div>
                          </div>
                        )
                      )}

                      {/* Test send */}
                      <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Send className="h-4 w-4 text-emerald-600" />
                          <Label className="text-xs font-bold">テスト送信</Label>
                        </div>
                        {(settings?.googleChatDestinations || []).filter(d => d.enabled !== false && d.hasUrl !== false).length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            送信先が未登録です。まず <a href="/admin/settings" className="text-primary underline">基本設定</a> で Google Chat 通知先を追加してください。
                          </p>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <select
                                value={testDestinationId}
                                onChange={(e) => setTestDestinationId(e.target.value)}
                                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                              >
                                <option value="">送信先を選択...</option>
                                {(settings?.googleChatDestinations || []).filter(d => d.enabled !== false && d.hasUrl !== false).map(d => (
                                  <option key={d.id} value={d.id}>{d.label}</option>
                                ))}
                              </select>
                              <Button
                                onClick={handleTestChatSend}
                                disabled={!testDestinationId || testSending}
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                                size="sm"
                              >
                                {testSending ? (
                                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />送信中...</>
                                ) : (
                                  <><Send className="h-3.5 w-3.5 mr-1" />このメッセージを送信</>
                                )}
                              </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              ※ プレースホルダー（{'{{userName}}'} 等）は<strong>展開されず</strong>そのまま送信されます。実際の送信時にはイベントデータで置換されます。
                            </p>
                          </>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Placeholder sidebar */}
                {showPlaceholders && (
                  <div className="w-[240px] shrink-0 border-l pl-4 py-4 space-y-3 overflow-y-auto max-h-[60vh]">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">代入キー一覧</h4>
                    <p className="text-[10px] text-muted-foreground">クリックで本文に挿入されます</p>
                    {[
                      {
                        group: 'サービス情報', keys: [
                          { key: 'serviceName', label: 'サービス名' },
                          { key: 'operatorCompanyName', label: '運営会社名' },
                        ]
                      },
                      {
                        group: 'ユーザー情報', keys: [
                          { key: 'userName', label: 'ユーザー名' },
                          { key: 'userEmail', label: 'メールアドレス' },
                        ]
                      },
                      {
                        group: '機器情報', keys: [
                          { key: 'deviceType', label: '機器名' },
                          { key: 'deviceId', label: '機器ID' },
                          { key: 'deviceSerialNumber', label: 'シリアル番号' },
                        ]
                      },
                      {
                        group: '申請情報', keys: [
                          { key: 'applicationId', label: '申請ID' },
                          { key: 'payAmount', label: '支払金額' },
                          { key: 'payType', label: '支払方法' },
                          { key: 'rentalType', label: 'レンタル期間' },
                        ]
                      },
                      {
                        group: '配送先', keys: [
                          { key: 'shippingZipcode', label: '郵便番号' },
                          { key: 'shippingPrefecture', label: '都道府県' },
                          { key: 'shippingAddress1', label: '住所1' },
                          { key: 'shippingAddress2', label: '住所2' },
                          { key: 'shippingTel', label: '電話番号' },
                          { key: 'shippingCompanyName', label: '会社名' },
                        ]
                      },
                      {
                        group: '決済・契約', keys: [
                          { key: 'paymentLinkUrl', label: '決済リンクURL' },
                          { key: 'deliveryDate', label: '配送予定日' },
                          { key: 'deadline', label: '期限日' },
                          { key: 'endDate', label: '契約終了日' },
                          { key: 'startAt', label: '契約開始日' },
                        ]
                      },
                      {
                        group: 'クーポン', keys: [
                          { key: 'couponCode', label: 'クーポンコード' },
                          { key: 'couponDiscount', label: '割引額' },
                          { key: 'originalAmount', label: '割引前金額' },
                        ]
                      },
                      {
                        group: '運営会社情報', keys: [
                          { key: 'companyName', label: '会社名' },
                          { key: 'managerName', label: '担当者名' },
                          { key: 'managerEmail', label: '担当者メール' },
                          { key: 'companyPhone', label: '電話番号' },
                          { key: 'companyPostalCode', label: '郵便番号' },
                          { key: 'companyPrefecture', label: '都道府県' },
                          { key: 'companyCity', label: '市区町村' },
                          { key: 'companyAddress', label: '住所' },
                          { key: 'companyBuilding', label: '建物名' },
                          { key: 'companyFullAddress', label: '住所（全結合）' },
                        ]
                      },
                      {
                        group: 'リンク', keys: [
                          { key: 'linkMypage', label: 'マイページURL' },
                          { key: 'linkApplications', label: '申請履歴URL' },
                          { key: 'linkDevices', label: 'マイデバイスURL' },
                          { key: 'linkPaymentHistory', label: '支払履歴URL' },
                          { key: 'linkProfile', label: '会員情報URL' },
                          { key: 'linkDeviceList', label: '機器一覧URL' },
                          { key: 'linkAdminEarlyBookings', label: '先行予約管理URL（管理）' },
                        ]
                      },
                    ].map((section) => (
                      <div key={section.group}>
                        <p className="text-[10px] font-semibold text-primary mb-1 mt-2">{section.group}</p>
                        <div className="space-y-0.5">
                          {section.keys.map(({ key, label }) => (
                            <button
                              key={key}
                              type="button"
                              className="w-full text-left text-[10px] px-2 py-1 rounded-md border bg-gray-50 hover:bg-primary/10 hover:border-primary/30 transition-colors cursor-pointer flex items-center justify-between gap-1"
                              onClick={() => {
                                const placeholder = `{{${key}}}`;
                                setFormBody(prev => prev + placeholder);
                                toast({ title: `${placeholder} を挿入しました` });
                              }}
                              title={`{{${key}}} を挿入`}
                            >
                              <span className="text-muted-foreground truncate">{label}</span>
                              <code className="text-[9px] font-mono text-primary/70 shrink-0">{`{{${key}}}`}</code>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowPlaceholders(!showPlaceholders)} className="mr-auto text-xs">
                  {showPlaceholders ? '◀ パネルを閉じる' : '▶ プレースホルダー一覧'}
                </Button>
                <Button variant="outline" onClick={() => handlePreview()}>
                  <Eye className="h-4 w-4 mr-1" /> プレビュー
                </Button>
                <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditingTemplate(null); }}>キャンセル</Button>
                <Button onClick={handleSave}>保存</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Preview dialog moved outside Tabs below */}

          <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/10">
                    <TableHead className="pl-8 py-5">テンプレート名</TableHead>
                    <TableHead>タイプ</TableHead>
                    <TableHead>件名</TableHead>
                    <TableHead>最終更新日</TableHead>
                    <TableHead className="text-right pr-8">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>}
                  {!loading && displayTemplates.map((template) => (
                    <TableRow key={template.id} className={template.isSystemDefault ? 'bg-blue-50/20' : ''}>
                      <TableCell className="pl-8 font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          {template.name}
                          {template.isAdmin && (
                            <Badge className="bg-gray-700 text-white text-[10px] px-1.5 py-0 flex items-center gap-0.5 shrink-0">
                              <ShieldAlert className="h-2.5 w-2.5" /> 管理用
                            </Badge>
                          )}
                          {template.isSystemDefault && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-0.5 shrink-0 text-blue-600 border-blue-200 bg-blue-50">
                              <Sparkles className="h-2.5 w-2.5" /> システム標準
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><code className="bg-muted px-2 py-1 rounded-md text-sm">{template.type}</code></TableCell>
                      <TableCell className="text-sm">{template.subject}</TableCell>
                      <TableCell className="text-sm">
                        {template.isSystemDefault
                          ? <span className="text-[10px] text-muted-foreground italic">未カスタマイズ</span>
                          : (template.updatedAt?.toDate?.() ? template.updatedAt.toDate().toLocaleDateString() : '-')}
                      </TableCell>
                      <TableCell className="text-right pr-8 space-x-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => handlePreview(template as any)} title="プレビュー">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(template as any)} title={template.isSystemDefault ? 'カスタマイズする' : '編集'}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!template.isSystemDefault && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDelete(template.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Design Tab */}
        <TabsContent value="design" className="mt-6 space-y-6">
          <Card className="border-none shadow-lg rounded-2xl bg-white">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /> メールデザイン設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>ヘッダーカラー</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={design.primaryColor} onChange={(e) => setDesign({ ...design, primaryColor: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                    <Input value={design.primaryColor} onChange={(e) => setDesign({ ...design, primaryColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>ボタンカラー</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={design.buttonColor} onChange={(e) => setDesign({ ...design, buttonColor: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                    <Input value={design.buttonColor} onChange={(e) => setDesign({ ...design, buttonColor: e.target.value })} className="flex-1" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>ボタン角丸</Label>
                  <Input value={design.buttonRadius} onChange={(e) => setDesign({ ...design, buttonRadius: e.target.value })} placeholder="8px" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>フォントファミリー</Label>
                <Input value={design.fontFamily} onChange={(e) => setDesign({ ...design, fontFamily: e.target.value })} />
              </div>

              <div className="pt-4 border-t space-y-1.5">
                <Label className="text-base font-bold">フッター情報</Label>
                <Textarea value={design.footerText} onChange={(e) => setDesign({ ...design, footerText: e.target.value })} className="min-h-[80px]" placeholder={`© ${new Date().getFullYear()} ${settings?.serviceName || 'TimeWaverHub'}...`} />
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <Button variant="outline" onClick={() => {
                  const preview = buildEmailHtml(`【${settings?.serviceName || 'TimeWaverHub'}】デザインプレビュー`, '<p>{{userName}} 様</p><p>これはデザインプレビューです。</p><p>対象機器: {{deviceType}}</p><p><a href="https://example.com" style="display:inline-block;padding:12px 24px;background-color:' + design.buttonColor + ';color:#fff;text-decoration:none;border-radius:' + design.buttonRadius + ';font-weight:bold;">ボタンサンプル</a></p>');
                  setPreviewHtml(preview);
                  setShowPreview(true);
                }}>
                  <Eye className="h-4 w-4 mr-1" /> プレビュー
                </Button>
                <Button onClick={handleSaveDesign}>デザイン設定を保存</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview dialog — outside Tabs so it works from any tab */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>メールプレビュー</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-gray-100 p-4">
            <iframe srcDoc={previewHtml} className="w-full h-[500px] bg-white rounded" title="Email Preview" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
