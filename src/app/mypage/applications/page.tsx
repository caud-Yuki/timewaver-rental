'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
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
import { Loader2, FileText, ShoppingCart, RefreshCw, AlertTriangle, ExternalLink, Upload, ArrowLeft } from 'lucide-react';
import { Application, applicationConverter } from '@/types';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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

const ConsentFormModal = ({ application, onConfirm }: { application: Application; onConfirm: (file: File) => Promise<void> }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleConfirm = async () => {
    if (!file) {
      toast({ variant: "destructive", title: "ファイルを選択してください" });
      return;
    }
    setIsUploading(true);
    await onConfirm(file);
    setIsUploading(false);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>同意書の提出</DialogTitle>
        <DialogDescription>署名済みの同意書をアップロードしてください。</DialogDescription>
      </DialogHeader>
      <div className="py-4 space-y-4">
        <input type="file" onChange={handleFileChange} accept="application/pdf,image/*" />
        <p className="text-xs text-muted-foreground">
          PDFまたは画像ファイルをアップロードできます。
        </p>
        <a href="/path-to-your/consent-form.pdf" download className="text-sm text-primary hover:underline flex items-center gap-1">
          <FileText className="h-4 w-4"/>
          同意書をダウンロード
        </a>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" className="rounded-lg">閉じる</Button>
        </DialogClose>
        <Button onClick={handleConfirm} className="rounded-lg" disabled={isUploading || !file}>
          {isUploading ? <Loader2 className="animate-spin h-4 w-4"/> : <Upload className="h-4 w-4 mr-2"/>}
          提出する
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export default function MyApplicationsPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
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

  //NEWLY EDITED BASED ON YOUR ADVICE
  const handleConsentFormUpload = async (application: Application, file: File) => {
    if (!user || !db) return; // Ensure db is available
    
    try {
      const storage = getStorage(); 
      const filePath = `users/${user.uid}/applications/${application.id}/consentForm/${file.name}`;
      const storageRef = ref(storage, filePath);
      
      // 1. Upload
      const snapshot = await uploadBytes(storageRef, file);
      
      // 2. Get URL
      const fileUrl = await getDownloadURL(snapshot.ref);
  
      // 3. Update Firestore using the 'db' instance you already have from useFirestore()
      await updateDoc(doc(db, 'applications', application.id), {
        agreementPdfUrl: fileUrl,
        status: 'consent_form_review',
        updatedAt: serverTimestamp(),
      });
      
      toast({ title: "同意書をアップロードしました。" });
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
    <div className="space-y-8">
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
                            <ConsentFormModal application={app} onConfirm={(file) => handleConsentFormUpload(app, file)} />
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
