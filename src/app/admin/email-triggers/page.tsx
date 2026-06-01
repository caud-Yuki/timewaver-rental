'use client';

import { useMemo } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Loader2, Zap, ShieldAlert, Sparkles, ChevronDown, User, ShieldCheck,
} from 'lucide-react';
import { EmailTemplate, UserProfile, GlobalSettings } from '@/types';
import { SYSTEM_TEMPLATES } from '@/lib/email-defaults';
import Link from 'next/link';

/**
 * One row per business EVENT. Each event can target the user, the admin/staff,
 * or both — each audience picks its own template, while channels are shared.
 *
 * `sysUser` / `sysAdmin` provide the default sys_* template ids that the row
 * pre-fills with on first save. Leaving the corresponding slot empty in
 * Firestore means "no notification for that audience".
 */
const EVENT_POINTS: Array<{
  id: string;
  name: string;
  desc: string;
  sysUser?: string;
  sysAdmin?: string;
}> = [
  { id: 'application_submitted',  name: '申込送信時',                desc: 'ユーザーが申込を送信した時',                                              sysUser: 'sys_application_submitted', sysAdmin: 'sys_application_submitted_admin' },
  { id: 'application_approved',   name: '審査承認時',                desc: '管理者が申請を承認した時',                                                sysUser: 'sys_application_approved' },
  { id: 'application_rejected',   name: '審査却下時',                desc: '管理者が申請を却下した時',                                                sysUser: 'sys_application_rejected' },
  { id: 'consent_form_submitted', name: '同意書提出時',              desc: 'ユーザーが同意書を提出した時',                                            sysAdmin: 'sys_consent_form_submitted' },
  { id: 'consent_form_approved',  name: '同意書承認時',              desc: '管理者が同意書を承認した時',                                              sysUser: 'sys_consent_form_approved' },
  { id: 'payment_link_sent',      name: '決済リンク送付時',          desc: '管理者が決済リンクを作成・送信した時',                                    sysUser: 'sys_payment_link_sent' },
  { id: 'payment_completed',      name: '決済完了時',                desc: '支払いが正常に完了した時',                                                sysUser: 'sys_payment_completed' },
  { id: 'payment_failed',         name: '月次決済失敗時',            desc: '月次決済（サブスク）の請求が失敗した時',                                  sysUser: 'sys_payment_failed_user', sysAdmin: 'sys_payment_failed' },
  { id: 'card_expiring',          name: 'カード期限切れ予告',        desc: 'カードの有効期限切れ1ヶ月前',                                            sysUser: 'sys_card_expiring' },
  { id: 'initial_payment_failed', name: '初回決済失敗時',            desc: '初回決済（PaymentIntent）が失敗した時',                                   sysAdmin: 'sys_initial_payment_failed' },
  { id: 'subscription_canceled_payment_failure', name: '決済失敗による自動解約', desc: '決済失敗が14日継続して自動解約した時',                          sysUser: 'sys_subscription_canceled_payment_failure', sysAdmin: 'sys_subscription_canceled_payment_failure_admin' },
  { id: 'device_prep_required',   name: '発送準備依頼',              desc: '決済完了後、スタッフへの発送準備依頼',                                    sysAdmin: 'sys_device_prep_required' },
  { id: 'device_shipped',         name: '発送通知',                  desc: '管理者がデバイスを発送した時',                                            sysUser: 'sys_device_shipped' },
  { id: 'contract_renewal_reminder', name: '契約終了1ヶ月前',        desc: '契約終了1ヶ月前にユーザーへ更新案内',                                    sysUser: 'sys_contract_renewal_reminder', sysAdmin: 'sys_contract_renewal_reminder_admin' },
  { id: 'subscription_canceled',  name: '解約通知',                  desc: '管理者がサブスクリプションを解約した時',                                  sysUser: 'sys_subscription_canceled' },
  { id: 'contract_expired',       name: '契約終了時',                desc: '契約期間が終了した時',                                                    sysUser: 'sys_contract_expired', sysAdmin: 'sys_contract_expired_admin' },
  { id: 'device_return_guide',    name: '返却案内',                  desc: '契約終了・解約時に返却手順を案内',                                        sysUser: 'sys_device_return_guide', sysAdmin: 'sys_device_return_guide_admin' },
  { id: 'device_inspection',      name: '点検依頼',                  desc: 'デバイス到着時にスタッフへ点検を依頼',                                    sysAdmin: 'sys_device_inspection' },
  { id: 'device_returned',        name: '返却完了時',                desc: '点検完了・問題なしの時',                                                  sysUser: 'sys_device_returned' },
  { id: 'device_damaged',         name: '破損・不具合通知',          desc: '点検で破損・不具合が見つかった時',                                        sysUser: 'sys_device_damaged', sysAdmin: 'sys_device_damaged_admin' },
  { id: 'news_published',         name: 'ニュース公開時',            desc: '新しいお知らせを公開した時',                                              sysUser: 'sys_news_published' },
  { id: 'waitlist_device_available', name: '在庫確保時',             desc: 'キャンセル待ち対象に空きが出た時',                                        sysUser: 'sys_waitlist_available', sysAdmin: 'sys_waitlist_available_admin' },
  { id: 'welcome_registration',   name: '会員登録時',                desc: '新規ユーザーが登録した時',                                                sysUser: 'sys_welcome_registration' },
  { id: 'early_booking',          name: '先行予約受付時',            desc: '先行予約フォーム送信時',                                                  sysUser: 'sys_early_booking_confirmation', sysAdmin: 'sys_early_booking_admin_notification' },
  { id: 'early_booking_launch_notice', name: '先行予約者へのローンチ案内', desc: '先行予約モード解除後、申込開始を先行予約者へ一括案内（手動送信）',          sysUser: 'sys_early_booking_launch_notice' },
];

/** Map of legacy per-audience trigger doc ids to the new event id + audience. */
const LEGACY_TO_EVENT: Record<string, { eventId: string; audience: 'user' | 'admin' }> = {
  payment_failed: { eventId: 'payment_failed', audience: 'admin' },
  payment_failed_user: { eventId: 'payment_failed', audience: 'user' },
  subscription_canceled_payment_failure: { eventId: 'subscription_canceled_payment_failure', audience: 'user' },
  subscription_canceled_payment_failure_admin: { eventId: 'subscription_canceled_payment_failure', audience: 'admin' },
  early_booking_confirmation: { eventId: 'early_booking', audience: 'user' },
  early_booking_admin_notification: { eventId: 'early_booking', audience: 'admin' },
};

interface EventState {
  enabled: boolean;
  userTemplateId: string;
  adminTemplateId: string;
  channels: {
    email?: boolean;
    chatwork?: boolean;
    googleChat?: boolean;
    googleChatDestinationIds?: string[];
  };
}

export default function EmailTriggersPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const profileRef = useMemoFirebase(() => (db && user ? doc(db, 'users', user.uid) : null), [db, user]);
  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const templatesQuery = useMemoFirebase(() => (db ? collection(db, 'emailTemplates') : null), [db]);
  const { data: dbTemplates } = useCollection<EmailTemplate>(templatesQuery as any);

  const triggersQuery = useMemoFirebase(() => (db ? collection(db, 'emailTriggers') : null), [db]);
  const { data: triggerDocs } = useCollection<any>(triggersQuery as any);

  const settingsRef = useMemoFirebase(() => (db ? doc(db, 'settings', 'global') : null), [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);

  // Build per-event state by merging:
  // - new-format docs (id = eventId, has userTemplateId/adminTemplateId), and
  // - legacy per-audience docs (one or two old-format docs).
  const eventState: Record<string, EventState> = useMemo(() => {
    const result: Record<string, EventState> = {};
    const docs = triggerDocs || [];

    EVENT_POINTS.forEach((evt) => {
      // 1. New-format doc at id = eventId.
      const newDoc = docs.find((d: any) => d.id === evt.id && ('userTemplateId' in d || 'adminTemplateId' in d));
      if (newDoc) {
        result[evt.id] = {
          enabled: !!newDoc.enabled,
          userTemplateId: newDoc.userTemplateId || '',
          adminTemplateId: newDoc.adminTemplateId || '',
          channels: newDoc.channels || {},
        };
        return;
      }

      // 2. Legacy: walk all docs whose triggerPoint maps to this event id.
      const state: EventState = { enabled: false, userTemplateId: '', adminTemplateId: '', channels: {} };
      docs.forEach((d: any) => {
        const legacy = LEGACY_TO_EVENT[d.id];
        const mappedEventId = legacy ? legacy.eventId : d.id;
        if (mappedEventId !== evt.id) return;
        const audience: 'user' | 'admin' = legacy ? legacy.audience : 'user';
        // Treat any legacy doc as enabling the event.
        if (d.enabled) state.enabled = true;
        if (audience === 'user' && !state.userTemplateId) state.userTemplateId = d.templateId || '';
        if (audience === 'admin' && !state.adminTemplateId) state.adminTemplateId = d.templateId || '';
        // Merge channels — last writer wins. Admin doc's channels typically richer.
        if (d.channels) state.channels = { ...state.channels, ...d.channels };
      });
      result[evt.id] = state;
    });

    return result;
  }, [triggerDocs]);

  const availableTemplates = useMemo(() => {
    const list = [...(dbTemplates || [])];
    SYSTEM_TEMPLATES.forEach((sys) => {
      if (!list.some((t) => t.id === sys.id)) {
        list.push({ ...sys, name: `[標準] ${sys.name}` } as any);
      }
    });
    return list;
  }, [dbTemplates]);

  const allDestinations = settings?.googleChatDestinations || [];
  const enabledDestinations = allDestinations.filter((d) => d.enabled !== false);

  const persistEvent = async (eventId: string, patch: Partial<EventState>) => {
    if (!db) return;
    const current = eventState[eventId] || { enabled: false, userTemplateId: '', adminTemplateId: '', channels: {} };
    const next: EventState = {
      enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
      userTemplateId: patch.userTemplateId !== undefined ? patch.userTemplateId : current.userTemplateId,
      adminTemplateId: patch.adminTemplateId !== undefined ? patch.adminTemplateId : current.adminTemplateId,
      channels: patch.channels !== undefined ? patch.channels : current.channels,
    };
    await setDoc(doc(db, 'emailTriggers', eventId), {
      triggerPoint: eventId,
      enabled: next.enabled,
      userTemplateId: next.userTemplateId || '',
      adminTemplateId: next.adminTemplateId || '',
      channels: next.channels,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  };

  const handleUpdateField = async (eventId: string, patch: Partial<EventState>) => {
    try {
      await persistEvent(eventId, patch);
      toast({ title: 'トリガーを更新しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e?.message || '保存に失敗しました' });
    }
  };

  if (authLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  if (profile && profile.role !== 'admin') {
    return <div className="text-center py-20"><ShieldAlert className="mx-auto h-12 w-12 text-destructive mb-4" />管理者権限が必要です</div>;
  }

  return (
    <div className="container mx-auto px-4 py-12 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" /> メール自動トリガー設定
          </h1>
          <p className="text-muted-foreground">イベントごとにユーザー向け／管理者向けテンプレートと通知チャネルを設定します。</p>
        </div>
        <Link href="/admin">
          <Button variant="outline" className="rounded-xl">ダッシュボードに戻る</Button>
        </Link>
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 leading-relaxed">
        <strong>ユーザー向け</strong>テンプレートと<strong>管理者/スタッフ向け</strong>テンプレートを、各イベントで個別に設定できます。
        どちらか片方だけ設定すれば、その対象だけに通知されます。両方とも未選択にすればそのイベントの通知は送信されません。
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary/10">
              <TableRow>
                <TableHead className="pl-8 min-w-[200px]">イベント</TableHead>
                <TableHead className="min-w-[240px]">
                  <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />ユーザー向けテンプレート</div>
                </TableHead>
                <TableHead className="min-w-[240px]">
                  <div className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />管理/スタッフ向けテンプレート</div>
                </TableHead>
                <TableHead className="text-center">有効</TableHead>
                <TableHead className="text-center">CW</TableHead>
                <TableHead className="text-center pr-8">GC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EVENT_POINTS.map((evt) => {
                const state = eventState[evt.id] || { enabled: false, userTemplateId: '', adminTemplateId: '', channels: {} };
                const hasAnyTemplate = !!(state.userTemplateId || state.adminTemplateId);
                return (
                  <TableRow key={evt.id} className={!hasAnyTemplate ? 'opacity-70' : ''}>
                    <TableCell className="pl-8">
                      <div className="font-bold text-sm">{evt.name}</div>
                      <div className="text-[11px] text-muted-foreground">{evt.desc}</div>
                    </TableCell>

                    {/* User template */}
                    <TableCell>
                      <Select
                        value={state.userTemplateId || ''}
                        onValueChange={(v) => handleUpdateField(evt.id, { userTemplateId: v === '__none__' ? '' : v })}
                      >
                        <SelectTrigger className="w-full rounded-lg h-9 text-xs">
                          <SelectValue placeholder={evt.sysUser ? '未設定（通知しない）' : '— このイベントには未対応 —'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__"><span className="text-muted-foreground">通知しない</span></SelectItem>
                          {availableTemplates.filter((t) => !t.isAdmin).map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <div className="flex items-center gap-2">
                                {t.id.startsWith('sys_') && <Sparkles className="h-3 w-3 text-primary" />}
                                {t.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Admin template */}
                    <TableCell>
                      <Select
                        value={state.adminTemplateId || ''}
                        onValueChange={(v) => handleUpdateField(evt.id, { adminTemplateId: v === '__none__' ? '' : v })}
                      >
                        <SelectTrigger className="w-full rounded-lg h-9 text-xs">
                          <SelectValue placeholder={evt.sysAdmin ? '未設定（通知しない）' : '— このイベントには未対応 —'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__"><span className="text-muted-foreground">通知しない</span></SelectItem>
                          {availableTemplates.filter((t) => t.isAdmin).map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <div className="flex items-center gap-2">
                                {t.id.startsWith('sys_') && <Sparkles className="h-3 w-3 text-primary" />}
                                {t.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell className="text-center">
                      <Switch
                        checked={state.enabled}
                        onCheckedChange={(checked) => handleUpdateField(evt.id, { enabled: checked })}
                        disabled={!hasAnyTemplate}
                      />
                    </TableCell>

                    <TableCell className="text-center">
                      <Switch
                        checked={!!state.channels?.chatwork}
                        onCheckedChange={(checked) => handleUpdateField(evt.id, { channels: { ...state.channels, chatwork: checked } })}
                        disabled={!hasAnyTemplate}
                      />
                    </TableCell>

                    <TableCell className="text-center pr-8">
                      <div className="flex items-center justify-center gap-2">
                        <Switch
                          checked={!!state.channels?.googleChat}
                          onCheckedChange={(checked) => handleUpdateField(evt.id, { channels: { ...state.channels, googleChat: checked } })}
                          disabled={!hasAnyTemplate}
                        />
                        {state.channels?.googleChat && (
                          (() => {
                            const selectedIds: string[] = Array.isArray(state.channels?.googleChatDestinationIds)
                              ? state.channels.googleChatDestinationIds
                              : [];
                            const isAll = selectedIds.length === 0;
                            const label = isAll
                              ? `全宛先 (${enabledDestinations.length})`
                              : `${selectedIds.length} / ${enabledDestinations.length}`;
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] gap-1 rounded-lg">
                                    {label}
                                    <ChevronDown className="h-3 w-3" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-3" align="end">
                                  <div className="space-y-2">
                                    <div className="text-xs font-bold mb-2">配信先 Google Chat</div>
                                    {enabledDestinations.length === 0 ? (
                                      <p className="text-[11px] text-muted-foreground">
                                        通知先が未登録です。<Link href="/admin/settings" className="text-primary underline">基本設定</Link>から追加してください。
                                      </p>
                                    ) : (
                                      <>
                                        <label className="flex items-center gap-2 cursor-pointer rounded-md p-2 hover:bg-secondary/40">
                                          <Checkbox
                                            checked={isAll}
                                            onCheckedChange={(checked) => {
                                              const nextChannels = { ...state.channels };
                                              if (checked) {
                                                delete nextChannels.googleChatDestinationIds;
                                              } else {
                                                nextChannels.googleChatDestinationIds = enabledDestinations.map((d) => d.id);
                                              }
                                              handleUpdateField(evt.id, { channels: nextChannels });
                                            }}
                                          />
                                          <span className="text-xs font-semibold">すべての有効な宛先に配信</span>
                                        </label>
                                        <div className="border-t my-2" />
                                        {enabledDestinations.map((d) => {
                                          const checked = isAll || selectedIds.includes(d.id);
                                          return (
                                            <label key={d.id} className="flex items-center gap-2 cursor-pointer rounded-md p-2 hover:bg-secondary/40">
                                              <Checkbox
                                                checked={checked}
                                                disabled={isAll}
                                                onCheckedChange={(c) => {
                                                  const next = c
                                                    ? [...selectedIds, d.id]
                                                    : selectedIds.filter((id) => id !== d.id);
                                                  handleUpdateField(evt.id, { channels: { ...state.channels, googleChatDestinationIds: next } });
                                                }}
                                              />
                                              <div className="flex-1">
                                                <div className="text-xs font-medium">{d.label}</div>
                                                {!d.hasUrl && (
                                                  <div className="text-[10px] text-amber-600">URL未設定</div>
                                                )}
                                              </div>
                                            </label>
                                          );
                                        })}
                                      </>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })()
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
