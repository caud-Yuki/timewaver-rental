'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Wrench, ShieldAlert, Search, Mail, MessageSquare, CheckCircle2, Inbox, Send,
} from 'lucide-react';
import {
  SupportRequest,
  SupportRequestStatus,
  SupportRequestType,
  supportRequestConverter,
  UserProfile,
  userProfileConverter,
} from '@/types';

const STATUS_META: Record<SupportRequestStatus, { label: string; color: string }> = {
  open:          { label: '未対応',     color: 'bg-red-500' },
  in_progress:   { label: '対応中',     color: 'bg-amber-500' },
  awaiting_user: { label: '利用者待ち', color: 'bg-blue-500' },
  resolved:      { label: '対応完了',   color: 'bg-green-600' },
  closed:        { label: 'クローズ',   color: 'bg-gray-400' },
};

const STATUS_ORDER: SupportRequestStatus[] = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'];

const TYPE_META: Record<SupportRequestType, { label: string; short: string }> = {
  repair:  { label: '故障・修理の依頼',         short: '修理' },
  support: { label: '操作方法・活用方法の相談', short: '相談' },
};

/** 未完了 = 一覧を開いた担当者が今日さばくべきもの。 */
const ACTIVE_STATUSES: SupportRequestStatus[] = ['open', 'in_progress', 'awaiting_user'];

const formatDateTime = (ts: any) =>
  ts && 'seconds' in ts ? new Date(ts.seconds * 1000).toLocaleString('ja-JP') : '-';

export default function AdminSupportRequestsPage() {
  const db = useFirestore();
  const { user, loading: authLoading } = useUser();
  const { toast } = useToast();

  const profileRef = useMemo(
    () => (db && user ? doc(db, 'users', user.uid).withConverter(userProfileConverter) : null),
    [db, user]
  );
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef);

  const requestsQuery = useMemo(() => {
    if (!db || profile?.role !== 'admin') return null;
    // status での絞り込みはクライアント側で行う。orderBy と組み合わせると
    // 複合インデックスが必要になるうえ、この件数では実益がない。
    return query(collection(db, 'supportRequests'), orderBy('createdAt', 'desc'))
      .withConverter(supportRequestConverter);
  }, [db, profile?.role]);

  const { data: requests, loading } = useCollection<SupportRequest>(requestsQuery);

  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | SupportRequestStatus>('active');
  const [typeFilter, setTypeFilter] = useState<'all' | SupportRequestType>('all');
  const [keyword, setKeyword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportRequest | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const openCount = useMemo(() => requests.filter((r) => r.status === 'open').length, [requests]);
  const activeCount = useMemo(
    () => requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
    [requests]
  );

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(r.status)) return false;
      if (statusFilter !== 'active' && statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (!kw) return true;
      return [r.userName, r.userEmail, r.deviceType, r.deviceSerialNumber, r.description, r.adminNote]
        .some((v) => (v || '').toLowerCase().includes(kw));
    });
  }, [requests, statusFilter, typeFilter, keyword]);

  const openDetail = (r: SupportRequest) => {
    setDetail(r);
    setNoteDraft(r.adminNote || '');
    setAssigneeDraft(r.assignedTo || '');
  };

  const handleStatus = async (id: string, status: SupportRequestStatus) => {
    setBusyId(id);
    try {
      await updateDoc(doc(db, 'supportRequests', id), { status, updatedAt: serverTimestamp() });
      toast({
        title: 'ステータスを更新しました',
        description: status === 'resolved'
          ? '「対応完了」に変更しました。完了通知メールはトリガー設定が有効な場合のみ送信されます。'
          : undefined,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e?.message || '更新に失敗しました' });
    } finally {
      setBusyId(null);
    }
  };

  const handleResendNotification = async (r: SupportRequest) => {
    const already = !!r.adminNotifiedAt;
    if (!confirm(already
      ? 'この依頼のスタッフ通知メールを再送信しますか？'
      : 'この依頼のスタッフ通知メールを送信しますか？')) return;
    setResendingId(r.id);
    try {
      const fn = httpsCallable(getFunctions(), 'resendSupportRequestNotification');
      const res: any = await fn({ requestId: r.id });
      toast({ title: '通知を送信しました', description: res?.data?.to ? `${res.data.to} に送信しました。` : undefined });
    } catch (e: any) {
      toast({ variant: 'destructive', title: '送信できませんでした', description: e?.message || '送信に失敗しました' });
    } finally {
      setResendingId(null);
    }
  };

  const handleSaveDetail = async () => {
    if (!detail) return;
    setSavingDetail(true);
    try {
      await updateDoc(doc(db, 'supportRequests', detail.id), {
        adminNote: noteDraft,
        assignedTo: assigneeDraft,
        updatedAt: serverTimestamp(),
      });
      toast({ title: '対応メモを保存しました' });
      setDetail(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e?.message || '保存に失敗しました' });
    } finally {
      setSavingDetail(false);
    }
  };

  if (authLoading || (profileLoading && !profile)) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user || profile?.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-6">
        <ShieldAlert className="h-20 w-20 text-destructive mx-auto" />
        <h1 className="text-3xl font-bold font-headline">アクセス制限</h1>
        <p className="text-muted-foreground">管理者権限が必要です。</p>
        <Link href="/"><Button variant="outline" className="rounded-xl">トップページに戻る</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Wrench className="h-8 w-8 text-primary" /> 修理・サポート依頼
          </h1>
          <p className="text-muted-foreground text-sm">
            マイページの「修理・サポート依頼」から届いた依頼の一覧と対応状況を管理します。
          </p>
        </div>
        <Link href="/admin"><Button variant="outline" className="rounded-xl">ダッシュボードへ</Button></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-none shadow-lg rounded-2xl bg-white">
          <CardContent className="p-5">
            <div className="text-[11px] text-muted-foreground font-bold">未対応</div>
            <div className={`text-3xl font-bold ${openCount > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{openCount}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-lg rounded-2xl bg-white">
          <CardContent className="p-5">
            <div className="text-[11px] text-muted-foreground font-bold">対応中・利用者待ち</div>
            <div className="text-3xl font-bold">{activeCount - openCount}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-lg rounded-2xl bg-white">
          <CardContent className="p-5">
            <div className="text-[11px] text-muted-foreground font-bold">修理依頼</div>
            <div className="text-3xl font-bold">{requests.filter((r) => r.type === 'repair').length}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-lg rounded-2xl bg-white">
          <CardContent className="p-5">
            <div className="text-[11px] text-muted-foreground font-bold">全依頼</div>
            <div className="text-3xl font-bold">{requests.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 leading-relaxed">
        新規の依頼は Cloud Functions が受付時に自動でスタッフへ通知します（宛先は
        <Link href="/admin/settings" className="underline">基本設定</Link>の「担当者メールアドレス」）。
        文面と通知チャネル（メール / Chatwork / Google Chat）は
        <Link href="/admin/email-triggers" className="underline">トリガー設定</Link>の「修理・サポート依頼受付時」から変更できます。
        通知列が「未送信」の依頼は誰にも届いていません。✉ ボタンから再送信できます。
      </div>

      <Card className="border-none shadow-lg rounded-2xl bg-white">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="利用者名・メール・機器・内容で検索"
              className="pl-9 rounded-xl h-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-full md:w-[180px] rounded-xl h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">未完了のみ</SelectItem>
              <SelectItem value="all">すべて</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="w-full md:w-[180px] rounded-xl h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">種類すべて</SelectItem>
              <SelectItem value="repair">{TYPE_META.repair.label}</SelectItem>
              <SelectItem value="support">{TYPE_META.support.label}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-none shadow-lg rounded-2xl overflow-hidden bg-white">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : visible.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground space-y-2">
              <Inbox className="h-10 w-10 mx-auto opacity-40" />
              <p>{requests.length === 0 ? 'まだ依頼はありません。' : '条件に一致する依頼はありません。'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-secondary/10">
                <TableRow>
                  <TableHead className="pl-6">受付日時</TableHead>
                  <TableHead>種類</TableHead>
                  <TableHead>利用者</TableHead>
                  <TableHead>対象機器</TableHead>
                  <TableHead className="min-w-[220px]">依頼内容</TableHead>
                  <TableHead>担当</TableHead>
                  <TableHead>通知</TableHead>
                  <TableHead className="min-w-[150px]">対応状況</TableHead>
                  <TableHead className="text-right pr-6">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id} className={r.status === 'open' ? 'bg-red-50/40' : ''}>
                    <TableCell className="pl-6 text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={r.type === 'repair' ? 'destructive' : 'secondary'} className="text-[10px] gap-1">
                        {r.type === 'repair' ? <Wrench className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                        {TYPE_META[r.type]?.short || r.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{r.userName || '-'}</div>
                      <div className="text-[10px] text-muted-foreground">{r.userEmail || '-'}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{r.deviceType || '-'}</div>
                      <div className="text-[10px] text-muted-foreground">{r.deviceSerialNumber || r.deviceId}</div>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{r.description}</p>
                      {r.adminNote && (
                        <p className="text-[10px] text-amber-700 mt-1 line-clamp-1">メモ: {r.adminNote}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.assignedTo || <span className="text-muted-foreground">未割当</span>}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {r.adminNotifiedAt ? (
                          <Badge variant="outline" className="text-[10px] gap-1 border-green-500 text-green-600">
                            <CheckCircle2 className="h-3 w-3" />送信済
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-400 gap-1">
                            <Mail className="h-3 w-3" />未送信
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={r.adminNotifiedAt ? 'スタッフ通知を再送信' : 'スタッフ通知を送信'}
                          disabled={resendingId === r.id}
                          onClick={() => handleResendNotification(r)}
                        >
                          {resendingId === r.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Send className="h-3.5 w-3.5 text-muted-foreground" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={r.status}
                        onValueChange={(v) => handleStatus(r.id, v as SupportRequestStatus)}
                        disabled={busyId === r.id}
                      >
                        <SelectTrigger className="h-8 w-[140px] rounded-lg">
                          <SelectValue>
                            <Badge className={`${STATUS_META[r.status]?.color || 'bg-gray-400'} text-white text-[10px]`}>
                              {STATUS_META[r.status]?.label || r.status}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button size="sm" variant="ghost" className="rounded-lg h-8" onClick={() => openDetail(r)}>
                        詳細
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              {detail ? TYPE_META[detail.type]?.label || detail.type : ''}
            </DialogTitle>
            <DialogDescription>
              受付番号 {detail?.id} ／ {formatDateTime(detail?.createdAt)}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[11px] text-muted-foreground font-bold">利用者</div>
                  <div>{detail.userName || '-'}</div>
                  <div className="text-xs text-muted-foreground">{detail.userEmail || '-'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-bold">対象機器</div>
                  <div>{detail.deviceType || '-'}</div>
                  <div className="text-xs text-muted-foreground">{detail.deviceSerialNumber || detail.deviceId}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-bold">スタッフ通知</div>
                  <div className="text-xs">{detail.adminNotifiedAt ? formatDateTime(detail.adminNotifiedAt) : '未送信'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-bold">利用者への受付通知</div>
                  <div className="text-xs">{detail.userNotifiedAt ? formatDateTime(detail.userNotifiedAt) : '未送信'}</div>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-muted-foreground font-bold mb-1">依頼内容</div>
                <div className="rounded-xl bg-secondary/20 p-4 text-sm whitespace-pre-wrap">{detail.description}</div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground font-bold">担当者</div>
                <Input
                  value={assigneeDraft}
                  onChange={(e) => setAssigneeDraft(e.target.value)}
                  placeholder="担当スタッフ名"
                  className="rounded-xl h-10"
                />
              </div>

              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground font-bold">対応メモ（社内用・利用者には送信されません）</div>
                <Textarea
                  rows={5}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="一次切り分けの結果、返送手配、修理見積など"
                  className="rounded-xl"
                />
              </div>

              {detail.userEmail && (
                <a
                  href={`mailto:${detail.userEmail}?subject=${encodeURIComponent(`【修理・サポート依頼】${detail.deviceType || ''}の件`)}`}
                  className="inline-flex items-center gap-2 text-xs text-primary underline"
                >
                  <Mail className="h-3.5 w-3.5" /> 利用者へメールを作成
                </a>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDetail(null)}>閉じる</Button>
            <Button className="rounded-xl" onClick={handleSaveDetail} disabled={savingDetail}>
              {savingDetail ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
