'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, query, orderBy, updateDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  FileText,
  Send,
  Mail, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  User as UserIcon, 
  MapPin, 
  Phone, 
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { Application, UserProfile, EmailTemplate, applicationConverter, userProfileConverter, emailTemplateConverter } from '@/types';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { ScrollArea } from '@/components/ui/scroll-area';

function ApplicationDetailModal({ application }: { application: Application }) {
  const isDeleted = application.status === 'canceled';

  const db = useFirestore();
  const [activeDoc, setActiveDoc] = useState<'agreement' | 'id'>('id'); 

  const userProfileRef = useMemo(() => {
    if (!db || !application.userId) return null;
    return doc(db, 'users', application.userId).withConverter(userProfileConverter);
  }, [db, application.userId]);
  
  const { data: profile, loading } = useDoc<UserProfile>(userProfileRef);

  const [showDetailEmail, setShowDetailEmail] = useState(false);

  const currentDocUrl = activeDoc === 'agreement' ? application.agreementPdfUrl : application.identificationImageUrl;

  return (
    <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem]">
      <DialogHeader className="p-8 bg-primary/5 border-b shrink-0">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-headline flex items-center gap-2">
              申請詳細: {application.userName}
            </DialogTitle>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Mail className="h-3 w-3" /> {application.userEmail}
            </div>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => setShowDetailEmail(true)}>
            <Mail className="h-4 w-4 mr-2" /> メール作成
          </Button>
        </div>
      </DialogHeader>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-3/5 bg-slate-100 p-6 flex flex-col gap-4 border-r overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> 提出書類プレビュー
            </h3>
            <Tabs value={activeDoc} onValueChange={(v: any) => setActiveDoc(v)} className="w-fit">
              <TabsList className="bg-white/50 rounded-lg h-9 border">
                <TabsTrigger value="id" className="text-[10px] px-3 h-7 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <UserCheck className="h-3 w-3 mr-1" /> 本人確認書類
                </TabsTrigger>
                <TabsTrigger value="agreement" className="text-[10px] px-3 h-7 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <FileText className="h-3 w-3 mr-1" /> 同意書
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {currentDocUrl && !isDeleted ? (
            <div className="flex-1 min-h-[400px] bg-white rounded-2xl shadow-inner border overflow-hidden relative">
              <iframe 
                src={currentDocUrl} 
                className="w-full h-full border-none"
                title="Document Preview"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed">
              <AlertTriangle className={`h-12 w-12 mb-2 ${isDeleted ? 'text-amber-400' : 'text-slate-300'}`} />
              <p className="text-xs text-slate-500 text-center px-8">
                {isDeleted 
                  ? "この申請は取り消し済みのため、個人情報保護の観点から書類は自動削除されました。" 
                  : (activeDoc === 'id' ? "本人確認書類がアップロードされていません" : "同意書がまだアップロードされていません")
                }
              </p>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1 rounded-xl text-xs h-9" disabled={!currentDocUrl} asChild>
              <a href={currentDocUrl} target="_blank" rel="noopener noreferrer">全画面で開く</a>
            </Button>
          </div>
        </div>

        <div className="w-2/5 p-8 overflow-y-auto space-y-8">
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <UserIcon className="h-3 w-3" /> 申請者プロフィール
            </h3>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5 text-primary" /></div>
            ) : profile ? (
              <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">お名前（ふりがな）</p>
                  <p className="text-sm font-medium">{profile.familyName} {profile.givenName}</p>
                  <p className="text-[10px] text-muted-foreground">({profile.familyNameKana} {profile.givenNameKana})</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">電話番号</p>
                  <p className="text-sm font-medium">{profile.tel || '-'}</p>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-[10px] text-muted-foreground">住所</p>
                  <p className="text-sm font-medium">〒{profile.zipcode}</p>
                  <p className="text-xs">{profile.address1} {profile.address2}</p>
                </div>
                {profile.companyName && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-[10px] text-muted-foreground">会社名</p>
                    <p className="text-sm font-medium">{profile.companyName}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-destructive">プロフィールの取得に失敗しました</p>
            )}
          </section>

          <Separator />

          <section className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="h-3 w-3" /> 申請内容
            </h3>
            <div className="bg-secondary/20 p-4 rounded-2xl grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">対象機器</p>
                <p className="text-sm font-bold">{application.deviceType}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">プラン</p>
                <p className="text-sm font-bold">{application.rentalPeriod}ヶ月 / {application.payType === 'monthly' ? '月次' : '一括'}</p>
                <p className="text-xs text-primary font-bold">¥{(application.payAmount ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Email compose from detail modal */}
      <EmailComposeModal
        application={application}
        open={showDetailEmail}
        onOpenChange={setShowDetailEmail}
      />
    </DialogContent>
  );
}

function EmailComposeModal({ application, open, onOpenChange }: { application: Application; open: boolean; onOpenChange: (open: boolean) => void }) {
  const db = useFirestore();
  const { toast } = useToast();

  const templatesQuery = useMemo(() => query(collection(db, 'emailTemplates'), orderBy('createdAt', 'desc')).withConverter(emailTemplateConverter), [db]);
  const { data: templates } = useCollection<EmailTemplate>(templatesQuery as any);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);

  // Auto-fill placeholders from application data
  const fillPlaceholders = (text: string) => {
    const baseUrl = 'https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app';
    const replacements: Record<string, string> = {
      userName: application.userName || '',
      userEmail: application.userEmail || '',
      deviceType: application.deviceType || '',
      deviceId: application.deviceId || '',
      deviceSerialNumber: (application as any).deviceSerialNumber || '',
      applicationId: application.id || '',
      payAmount: (application.payAmount ?? 0).toLocaleString(),
      payType: application.payType === 'monthly' ? '月々払い' : '一括払い',
      rentalType: String((application as any).rentalType || (application as any).rentalPeriod || ''),
      shippingZipcode: (application as any).shippingZipcode || '',
      shippingPrefecture: (application as any).shippingPrefecture || '',
      shippingAddress1: (application as any).shippingAddress1 || '',
      shippingAddress2: (application as any).shippingAddress2 || '',
      shippingTel: (application as any).shippingTel || '',
      shippingCompanyName: (application as any).shippingCompanyName || '',
      linkMypage: `${baseUrl}/mypage`,
      linkApplications: `${baseUrl}/mypage/applications`,
      linkDevices: `${baseUrl}/mypage/devices`,
      linkPaymentHistory: `${baseUrl}/mypage/payment-history`,
      linkProfile: `${baseUrl}/mypage/profile`,
      linkDeviceList: `${baseUrl}/devices`,
    };

    let result = text;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  };

  // When template selection changes
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'blank') {
      setEmailSubject(`【ChronoRent】${application.deviceType} - ${application.userName}様`);
      setEmailBody('');
    } else {
      const template = templates?.find(t => t.id === templateId);
      if (template) {
        setEmailSubject(fillPlaceholders(template.subject || ''));
        setEmailBody(fillPlaceholders(template.body || ''));
      }
    }
  };

  // Initialize with blank on open
  useEffect(() => {
    if (open) {
      setSelectedTemplateId('blank');
      setEmailSubject(`【ChronoRent】${application.deviceType} - ${application.userName}様`);
      setEmailBody('');
    }
  }, [open, application]);

  const handleSend = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast({ variant: 'destructive', title: '件名と本文を入力してください' });
      return;
    }

    setSending(true);
    try {
      const functions = getFunctions();
      const sendEmail = httpsCallable(functions, 'sendAdHocEmail');
      await sendEmail({
        to: application.userEmail,
        subject: emailSubject,
        body: emailBody,
      });
      toast({ title: 'メール送信完了', description: `${application.userEmail} に送信しました。` });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Email send error:', error);
      toast({ variant: 'destructive', title: '送信に失敗しました', description: error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            メール作成
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            宛先: <span className="font-medium text-foreground">{application.userName}</span> ({application.userEmail})
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Template selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">テンプレート選択</Label>
            <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue placeholder="テンプレートを選択..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">
                  <span className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    白紙メール（新規作成）
                  </span>
                </SelectItem>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-primary" />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">件名</Label>
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="メールの件名..." />
          </div>

          {/* Body with rich text editor */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">本文</Label>
            <RichTextEditor value={emailBody} onChange={setEmailBody} placeholder="メール本文を入力..." />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            送信
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminApplicationsPage() {
  const { user, loading: authLoading } = useUser();
  const router = useRouter();
  const db = useFirestore();
  const { toast } = useToast();

  const profileRef = useMemo(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid).withConverter(userProfileConverter);
  }, [db, user]);
  const { data: adminProfile, loading: profileLoading } = useDoc<UserProfile>(profileRef);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    } else if (!authLoading && adminProfile && adminProfile.role !== 'admin') {
      router.push('/');
    }
  }, [user, authLoading, adminProfile, router]);

  // Email compose modal state
  const [emailTarget, setEmailTarget] = useState<Application | null>(null);
  const [showEmailCompose, setShowEmailCompose] = useState(false);

  const openEmailCompose = (app: Application) => {
    setEmailTarget(app);
    setShowEmailCompose(true);
  };

  const applicationsQuery = useMemo(() => {
    if (!db) return null;
    return query(collection(db, 'applications'), orderBy('createdAt', 'desc')).withConverter(applicationConverter);
  }, [db]);
  const { data: applications, loading: appsLoading } = useCollection<Application>(applicationsQuery);

  // 1. Add this helper to handle the confirmation toast
  const handleUpdateStatus = async (appId: string, status: Application['status']) => {
    if (!db) return;

    // Optional: Visual confirmation for destructive actions
    const isDestructive = status === 'canceled';

    try {
      await updateDoc(doc(db, 'applications', appId), {
        status,
        updatedAt: serverTimestamp(),
      });

      toast({ 
        title: "ステータスを更新しました", 
        description: isDestructive 
          ? "この申請に関連する提出書類はバックエンドで自動削除されます。" 
          : "変更が保存されました。" 
      });
    } catch (error) {
      console.error("Update error:", error);
      toast({ 
        variant: "destructive", 
        title: "更新に失敗しました", 
        description: "通信状態を確認してください。" 
      });
    }
  };

  const handleCreatePaymentLink = async (application: Application) => {
    if (!db) return;
    
    const paymentLinkData = {
      applicationId: application.id,
      userId: application.userId,
      deviceId: application.deviceId,
      deviceName: application.deviceType,
      payType: application.payType,
      payAmount: application.payAmount,
      status: 'open',
      createdAt: serverTimestamp(),
      expiresAt: serverTimestamp(),
    };

    addDoc(collection(db, 'paymentLinks'), paymentLinkData)
      .then((docRef) => {
        updateDoc(doc(db, 'applications', application.id), {
          status: 'payment_sent',
          paymentLinkId: docRef.id,
          updatedAt: serverTimestamp(),
        });
        toast({ title: "決済リンクを送信しました" });
      });
  };

  if (authLoading || profileLoading || !user || adminProfile?.role !== 'admin') {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" /> 申請管理
          </h1>
          <p className="text-muted-foreground">レンタル申込の審査とステータス管理</p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5">申請者名 / メール</TableHead>
                <TableHead>申請日</TableHead>
                <TableHead>対象機器</TableHead>
                <TableHead>身分証/同意書</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(applications ?? []).map((app) => (
                <TableRow 
                  key={app.id} 
                  className={`group hover:bg-muted/5 transition-colors ${['canceled', 'closed'].includes(app.status) ? 'opacity-50 bg-slate-50' : ''}`}
                >
                  <TableCell className="pl-8">
                    <div className={`font-bold text-sm ${app.status === 'canceled' ? 'line-through text-muted-foreground' : ''}`}>
                      {app.userName}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{app.userEmail}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{app.deviceType}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {app.identificationImageUrl ? (
                        <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100 text-[10px]">ID済</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">ID未</Badge>
                      )}
                      {app.agreementPdfUrl ? (
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[10px]">同意済</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">同意未</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={app.status} 
                      onValueChange={(v: any) => handleUpdateStatus(app.id, v)}
                    >
                      <SelectTrigger className={`w-[130px] h-8 text-[10px] rounded-lg ${app.status === 'canceled' ? 'border-destructive text-destructive' : ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">審査中</SelectItem>
                        <SelectItem value="awaiting_consent_form">承認(同意書待ち)</SelectItem>
                        <SelectItem value="consent_form_review">同意書確認中</SelectItem>
                        <SelectItem value="consent_form_approved">同意書承認</SelectItem>
                        <SelectItem value="rejected">却下</SelectItem>
                        <SelectItem value="payment_sent">決済リンク送信済</SelectItem>
                        <SelectItem value="completed">決済完了</SelectItem>
                        <SelectItem value="shipped">発送済み</SelectItem>
                        <SelectItem value="in_use">利用中</SelectItem>
                        <SelectItem value="expired">契約満了</SelectItem>
                        <SelectItem value="returning">返却手続中</SelectItem>
                        <SelectItem value="inspection">点検中</SelectItem>
                        <SelectItem value="returned">返却完了</SelectItem>
                        <SelectItem value="damaged" className="text-orange-600 font-bold">破損・不具合あり</SelectItem>
                        <SelectItem value="closed" disabled>終了</SelectItem>
                        <SelectItem value="canceled" className="text-destructive font-bold">取り消し済み</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right pr-8 space-x-1">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="詳細を表示">
                          <Eye className="h-4 w-4 text-primary" />
                        </Button>
                      </DialogTrigger>
                      <ApplicationDetailModal application={app} />
                    </Dialog>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      title="メールを送信"
                      onClick={() => openEmailCompose(app)}
                    >
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </Button>

                    {app.status === 'consent_form_approved' && (
                      <Button size="sm" className="h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600" onClick={() => handleCreatePaymentLink(app)}>
                        <Send className="h-3.5 w-3.5 mr-1" /> 決済リンク
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!applications || applications.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-24 text-muted-foreground italic">
                    現在、進行中の申請はありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Email Compose Modal */}
      {emailTarget && (
        <EmailComposeModal
          application={emailTarget}
          open={showEmailCompose}
          onOpenChange={(open) => {
            setShowEmailCompose(open);
            if (!open) setEmailTarget(null);
          }}
        />
      )}
    </div>
  );
}
