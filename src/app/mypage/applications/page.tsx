'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter, 
  DialogDescription, 
  DialogClose 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, ShoppingCart, RefreshCw, AlertTriangle, ExternalLink, Upload, ArrowLeft, Download, Pen, Camera, Mail, X } from 'lucide-react';
import { Application, applicationConverter, GlobalSettings } from '@/types';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { generateConsentFormHtml } from '@/lib/consent-form-html';
import { useServiceName } from '@/hooks/use-service-name';
import { ConsentFormDoc, ConsentFormSection, consentFormConverter } from '@/types';

const CancelApplicationModal = ({ application, onConfirm }: { application: Application; onConfirm: () => void }) => {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="text-destructive" />
          申請のキャンセル
        </DialogTitle>
        <DialogDescription>
          以下の申請を本当にキャンセルしますか？この操作は取り消せません。
        </DialogDescription>
      </DialogHeader>
      <div className="py-4 space-y-2">
        <div className="text-sm"><strong>申請ID:</strong> {application.id}</div>
        <div className="text-sm"><strong>機器:</strong> {application.deviceType}</div>
        <div className="text-sm"><strong>申請日:</strong> {application.createdAt?.seconds ? new Date(application.createdAt.seconds * 1000).toLocaleDateString() : '-'}</div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" className="rounded-lg">閉じる</Button>
        </DialogClose>
        <Button variant="destructive" className="rounded-lg" onClick={onConfirm}>キャンセルを実行</Button>
      </DialogFooter>
    </DialogContent>
  );
};

const ConsentFormModal = ({ application, serviceName, onConfirm }: { application: Application; serviceName: string; onConfirm: (files: File[]) => Promise<void> }) => {
  const db = useFirestore();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useMemo(() => ({ current: null as HTMLInputElement | null }), []);

  // Load settings for company address
  const settingsRef = useMemo(() => doc(db, 'settings', 'global'), [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);

  // Load Firestore consent form sections
  const consentFormRef = useMemo(() => doc(db, 'consentForm', 'current').withConverter(consentFormConverter), [db]);
  const { data: consentFormData } = useDoc<ConsentFormDoc>(consentFormRef as any);
  const sections: ConsentFormSection[] | undefined = consentFormData?.sections;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const newFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    addFiles(newFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    addFiles(newFiles);
    if (e.target) e.target.value = '';
  };

  const addFiles = (newFiles: File[]) => {
    const valid = newFiles.filter(f => {
      if (f.size > 10 * 1024 * 1024) { toast({ variant: 'destructive', title: `${f.name} は10MB以下にしてください` }); return false; }
      return true;
    });
    setFiles(prev => [...prev, ...valid]);
    setPreviews(prev => [...prev, ...valid.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : '')]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (files.length === 0) {
      toast({ variant: "destructive", title: "ファイルを選択してください" });
      return;
    }
    setIsUploading(true);
    await onConfirm(files);
    setIsUploading(false);
  };

  const handleOpenConsentForm = () => {
    const html = generateConsentFormHtml({ application, serviceName, sections });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const companyAddress = [settings?.companyPostalCode ? `〒${settings.companyPostalCode}` : '', settings?.companyPrefecture, settings?.companyCity, settings?.companyAddress, settings?.companyBuilding].filter(Boolean).join(' ');

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-xl">同意書の提出</DialogTitle>
        <DialogDescription>下記の手順に従って、署名済みの同意書をご提出ください。</DialogDescription>
      </DialogHeader>
      <div className="space-y-6 py-2">
        {/* Step 1: Download */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">1</span>
            同意書をダウンロード
          </div>
          <Button variant="outline" onClick={handleOpenConsentForm} className="w-full rounded-xl h-11 justify-start gap-2 border-primary/30 text-primary hover:bg-primary/5">
            <Download className="h-4 w-4" />
            同意書を開く（印刷 / PDF保存）
          </Button>
        </div>

        {/* Step 2: Sign */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">2</span>
            同意書に記入・捺印
          </div>
          <p className="text-xs text-muted-foreground pl-8">
            日付、署名、住所、電話番号を記入し、実印（ない場合は認印）を押してください。
          </p>
        </div>

        {/* Step 3: Upload */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">3</span>
            スキャン / 写真を提出
          </div>
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {files.length === 0 ? (
              <div className="py-4">
                <Camera className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">ここにファイルをドロップ</p>
                <p className="text-[10px] text-gray-400 mt-1">またはクリックして選択（複数可）</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 justify-center">
                {files.map((f, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg border overflow-hidden group">
                    {previews[i] ? (
                      <img src={previews[i]} alt={f.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-50">
                        <FileText className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="absolute top-0.5 right-0.5 h-4 w-4 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-2.5 w-2.5" />
                    </button>
                    <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-[7px] text-white text-center truncate px-1">{f.name}</span>
                  </div>
                ))}
                <div className="w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center text-gray-400">
                  <Upload className="h-5 w-5" />
                </div>
              </div>
            )}
          </div>
          <input ref={(el) => { fileInputRef.current = el; }} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFileSelect} />
          <p className="text-[10px] text-muted-foreground">
            ＊捺印済みの同意書画像が確認できた時点で決済リンクをお送りします。
          </p>
        </div>

        {/* Step 4: Mail */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">4</span>
            一部を郵送、もう一部はお客様保管
          </div>
          {companyAddress ? (
            <div className="bg-gray-50 rounded-xl p-3 pl-8 text-xs text-muted-foreground space-y-0.5">
              <p>{settings?.companyPostalCode ? `〒${settings.companyPostalCode}` : ''}</p>
              <p>{[settings?.companyPrefecture, settings?.companyCity, settings?.companyAddress].filter(Boolean).join('')}</p>
              {settings?.companyBuilding && <p>{settings.companyBuilding}</p>}
              <p className="font-semibold text-foreground">{settings?.companyName}</p>
              {settings?.companyPhone && <p>TEL: {settings.companyPhone}</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground pl-8">郵送先は管理者にお問い合わせください。</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" className="rounded-lg">閉じる</Button>
        </DialogClose>
        <Button onClick={handleConfirm} className="rounded-lg" disabled={isUploading || files.length === 0}>
          {isUploading ? <Loader2 className="animate-spin h-4 w-4"/> : <Upload className="h-4 w-4 mr-2"/>}
          提出する（{files.length}件）
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export default function MyApplicationsPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const serviceName = useServiceName();
  const [isCancelling, setIsCancelling] = useState<string | null>(null);

  const applicationsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(db, 'applications'), 
      where('userId', '==', user.uid), 
      orderBy('createdAt', 'desc')
    ).withConverter(applicationConverter);
  }, [user, db]);

  const { data: applications, loading: appsLoading, error } = useCollection<Application>(applicationsQuery as any);

  const handleCancelApplication = async (appId: string) => {
    if (!db) return;
    setIsCancelling(appId);
    try {
      // 1. Update Firestore
      await updateDoc(doc(db, 'applications', appId), {
        status: 'canceled',
        updatedAt: serverTimestamp(),
      });
  
      // 2. Notify the user
      toast({ 
        title: "申請をキャンセルしました", 
        description: "提出済みの本人確認書類と同意書は、プライバシー保護のため自動的に削除されます。" 
      });
    } catch (error) {
      console.error("Error cancelling application: ", error);
      toast({ 
        variant: "destructive", 
        title: "エラー", 
        description: "キャンセル処理中にエラーが発生しました。" 
      });
    } finally {
      setIsCancelling(null);
    }
  };

  const handleConsentFormUpload = async (application: Application, files: File[]) => {
    if (!user || !db || files.length === 0) return;

    try {
      const storage = getStorage();
      const urls: string[] = [];

      for (const file of files) {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `users/${user.uid}/applications/${application.id}/consentForm/${fileName}`;
        const storageRef = ref(storage, filePath);
        const snapshot = await uploadBytes(storageRef, file);
        const fileUrl = await getDownloadURL(snapshot.ref);
        urls.push(fileUrl);
      }

      await updateDoc(doc(db, 'applications', application.id), {
        agreementPdfUrl: urls[0],
        agreementImageUrls: urls,
        status: 'consent_form_review',
        updatedAt: serverTimestamp(),
      });

      toast({ title: `同意書をアップロードしました（${urls.length}件）` });
    } catch (error) {
      console.error("Upload error:", error);
      toast({ variant: "destructive", title: "アップロードに失敗しました。" });
    }
  };

  if (authLoading || appsLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (error) {
    return <div className="text-destructive text-center py-10">エラー: データの読み込みに失敗しました。</div>;
  }

  const getStatusBadge = (status: Application['status']) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary" className="bg-amber-100 text-amber-800">審査中</Badge>;
      case 'awaiting_consent_form': return <Badge variant="secondary" className="bg-blue-100 text-blue-800">承認済み(同意書待ち)</Badge>;
      case 'consent_form_review': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">同意書確認中</Badge>;
      case 'consent_form_approved': return <Badge variant="secondary" className="bg-teal-100 text-teal-800">同意書承認</Badge>;
      case 'rejected': return <Badge variant="destructive" className="bg-red-100">却下</Badge>;
      case 'payment_sent': return <Badge variant="secondary" className="bg-purple-100 text-purple-800">決済待ち</Badge>;
      case 'completed': return <Badge variant="default" className="bg-green-600">契約完了</Badge>;
      case 'shipped': return <Badge variant="secondary" className="bg-indigo-100 text-indigo-800">発送済み</Badge>;
      case 'in_use': return <Badge variant="default" className="bg-emerald-500">利用中</Badge>;
      case 'expired': return <Badge variant="secondary" className="bg-amber-100 text-amber-800">契約満了</Badge>;
      case 'returning': return <Badge variant="secondary" className="bg-orange-100 text-orange-800">返却手続中</Badge>;
      case 'inspection': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">点検中</Badge>;
      case 'returned': return <Badge variant="secondary" className="bg-teal-100 text-teal-800">返却完了</Badge>;
      case 'damaged': return <Badge variant="destructive" className="bg-red-100 text-red-800">破損・不具合あり</Badge>;
      case 'closed': return <Badge variant="secondary" className="bg-gray-200 text-gray-500">終了</Badge>;
      case 'canceled': return <Badge variant="outline">キャンセル済</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => window.location.href = '/mypage'}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        マイページに戻る
      </Button>
      <CardHeader className="px-0">
        <CardTitle className="font-headline text-3xl flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          申請履歴
        </CardTitle>
        <CardDescription>過去のレンタル申請と現在のステータスを確認できます。</CardDescription>
      </CardHeader>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5">申請日</TableHead>
                <TableHead>対象機器</TableHead>
                <TableHead>プラン</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications && applications.length > 0 ? (
                applications.map((app) => {
                  const canCancel = ['pending', 'awaiting_consent_form'].includes(app.status);

                  return (
                    <TableRow key={app.id} className={['canceled', 'closed', 'returned'].includes(app.status) ? 'opacity-60 bg-slate-50' : ''}>
                      <TableCell className="pl-8 text-sm text-muted-foreground">{app.createdAt?.seconds ? new Date(app.createdAt.seconds * 1000).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="font-medium">{app.deviceType}</TableCell>
                      <TableCell>{app.rentalType}ヶ月 / {app.payType === 'monthly' ? '月次' : '一括'}</TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell className="text-right pr-8">
                        {app.status === 'awaiting_consent_form' && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" className="rounded-lg h-9 bg-primary hover:bg-primary/90">同意書を提出</Button>
                            </DialogTrigger>
                            <ConsentFormModal application={app} serviceName={serviceName} onConfirm={(files) => handleConsentFormUpload(app, files)} />
                          </Dialog>
                        )}
                        {app.status === 'payment_sent' && app.paymentLinkId && (
                           <Button size="sm" className="rounded-lg h-9 bg-emerald-500 hover:bg-emerald-600" asChild>
                            <Link href={`/payment/${app.paymentLinkId}`}>支払いへ</Link>
                          </Button>
                        )}
                        {canCancel && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="rounded-lg h-9 text-destructive hover:text-destructive hover:bg-destructive/10">
                                {isCancelling === app.id ? <Loader2 className="animate-spin h-4 w-4" /> : 'キャンセル'}
                              </Button>
                            </DialogTrigger>
                            <CancelApplicationModal application={app} onConfirm={() => handleCancelApplication(app.id)} />
                          </Dialog>
                        )}
                        {(app.status === 'completed' || app.status === 'rejected' || app.status === 'canceled') && (
                          <Button disabled variant="outline" size="sm" className="rounded-lg h-9">対応不要</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-24 text-muted-foreground italic">
                    申請履歴はありません。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
