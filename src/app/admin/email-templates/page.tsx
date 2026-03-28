'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Mail, Loader2, Palette, Eye } from 'lucide-react';
import { EmailTemplate, emailTemplateConverter, GlobalSettings } from '@/types';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

export default function EmailTemplatesPage() {
  const db = useFirestore();
  const templatesQuery = useMemo(() => query(collection(db, 'emailTemplates'), orderBy('createdAt', 'desc')).withConverter(emailTemplateConverter), [db]);
  const { data: templates, loading } = useCollection<EmailTemplate>(templatesQuery as any);
  const { toast } = useToast();

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

  // Design state
  const [design, setDesign] = useState({
    primaryColor: '#2563eb',
    buttonColor: '#2563eb',
    buttonRadius: '8px',
    fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
    footerText: '© 2026 ChronoRent. All rights reserved.\nこのメールはChronoRentシステムから自動送信されています。',
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
    setIsFormOpen(true);
  };

  const openEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormType(template.type || '');
    setFormName(template.name || '');
    setFormSubject(template.subject || '');
    setFormBody(template.body || '');
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formName || !formSubject || !formBody || !formType) return;
    try {
      if (editingTemplate?.id) {
        await updateDoc(doc(db, 'emailTemplates', editingTemplate.id), {
          type: formType, name: formName, subject: formSubject, body: formBody,
          updatedAt: serverTimestamp(),
        });
        toast({ title: "成功", description: "テンプレートを更新しました。" });
      } else {
        await addDoc(collection(db, 'emailTemplates'), {
          type: formType, name: formName, subject: formSubject, body: formBody,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        toast({ title: "成功", description: "テンプレートを作成しました。" });
      }
      setIsFormOpen(false);
      setEditingTemplate(null);
    } catch (e) {
      toast({ variant: "destructive", title: "エラー", description: "保存に失敗しました。" });
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
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">ChronoRent</h1>
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
    const isStaff = (template?.type || formType || '').includes('general') || subject.includes('管理者') || subject.includes('スタッフ');
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
          <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingTemplate(null); setShowPlaceholders(false); } }}>
            <DialogContent className={`max-h-[90vh] overflow-y-auto transition-all ${showPlaceholders ? 'sm:max-w-5xl' : 'sm:max-w-3xl'}`}>
              <DialogHeader>
                <DialogTitle>{editingTemplate ? 'メールテンプレートを編集' : '新規メールテンプレートを作成'}</DialogTitle>
                <DialogDescription>{'{{userName}}'} のようなプレースホルダーを使用できます。リッチテキストでHTMLメールを作成できます。</DialogDescription>
              </DialogHeader>
              <div className={`flex gap-4 ${showPlaceholders ? '' : ''}`}>
                {/* Main editor */}
                <div className="flex-1 space-y-4 py-4 min-w-0">
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
                  <div className="space-y-1.5">
                    <Label>件名</Label>
                    <Input value={formSubject} onChange={(e) => setFormSubject(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>本文（リッチテキスト）</Label>
                    <RichTextEditor value={formBody} onChange={setFormBody} placeholder="メール本文を入力..." />
                  </div>
                </div>

                {/* Placeholder sidebar */}
                {showPlaceholders && (
                  <div className="w-[240px] shrink-0 border-l pl-4 py-4 space-y-3 overflow-y-auto max-h-[60vh]">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">代入キー一覧</h4>
                    <p className="text-[10px] text-muted-foreground">クリックで本文に挿入されます</p>
                    {[
                      { group: 'ユーザー情報', keys: [
                        { key: 'userName', label: 'ユーザー名' },
                        { key: 'userEmail', label: 'メールアドレス' },
                      ]},
                      { group: '機器情報', keys: [
                        { key: 'deviceType', label: '機器名' },
                        { key: 'deviceId', label: '機器ID' },
                        { key: 'deviceSerialNumber', label: 'シリアル番号' },
                      ]},
                      { group: '申請情報', keys: [
                        { key: 'applicationId', label: '申請ID' },
                        { key: 'payAmount', label: '支払金額' },
                        { key: 'payType', label: '支払方法' },
                        { key: 'rentalType', label: 'レンタル期間' },
                      ]},
                      { group: '配送先', keys: [
                        { key: 'shippingZipcode', label: '郵便番号' },
                        { key: 'shippingPrefecture', label: '都道府県' },
                        { key: 'shippingAddress1', label: '住所1' },
                        { key: 'shippingAddress2', label: '住所2' },
                        { key: 'shippingTel', label: '電話番号' },
                        { key: 'shippingCompanyName', label: '会社名' },
                      ]},
                      { group: '決済・契約', keys: [
                        { key: 'paymentLinkUrl', label: '決済リンクURL' },
                        { key: 'deliveryDate', label: '配送予定日' },
                        { key: 'deadline', label: '期限日' },
                        { key: 'endDate', label: '契約終了日' },
                        { key: 'startAt', label: '契約開始日' },
                      ]},
                      { group: 'クーポン', keys: [
                        { key: 'couponCode', label: 'クーポンコード' },
                        { key: 'couponDiscount', label: '割引額' },
                        { key: 'originalAmount', label: '割引前金額' },
                      ]},
                      { group: '運営会社情報', keys: [
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
                      ]},
                      { group: 'リンク', keys: [
                        { key: 'linkMypage', label: 'マイページURL' },
                        { key: 'linkApplications', label: '申請履歴URL' },
                        { key: 'linkDevices', label: 'マイデバイスURL' },
                        { key: 'linkPaymentHistory', label: '支払履歴URL' },
                        { key: 'linkProfile', label: '会員情報URL' },
                        { key: 'linkDeviceList', label: '機器一覧URL' },
                      ]},
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
                  {!loading && templates?.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="pl-8 font-medium">{template.name}</TableCell>
                      <TableCell><code className="bg-muted px-2 py-1 rounded-md text-sm">{template.type}</code></TableCell>
                      <TableCell className="text-sm">{template.subject}</TableCell>
                      <TableCell className="text-sm">{template.updatedAt?.toDate?.() ? template.updatedAt.toDate().toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-right pr-8 space-x-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => handlePreview(template)} title="プレビュー">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(template)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDelete(template.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
                <Textarea value={design.footerText} onChange={(e) => setDesign({ ...design, footerText: e.target.value })} className="min-h-[80px]" placeholder="© 2026 ChronoRent..." />
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <Button variant="outline" onClick={() => {
                  const preview = buildEmailHtml('【ChronoRent】デザインプレビュー', '<p>{{userName}} 様</p><p>これはデザインプレビューです。</p><p>対象機器: {{deviceType}}</p><p><a href="https://example.com" style="display:inline-block;padding:12px 24px;background-color:' + design.buttonColor + ';color:#fff;text-decoration:none;border-radius:' + design.buttonRadius + ';font-weight:bold;">ボタンサンプル</a></p>');
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
