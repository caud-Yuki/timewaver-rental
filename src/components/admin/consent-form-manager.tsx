'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useDoc } from '@/firebase';
import { ConsentFormSection, ConsentFormDoc, ConsentSectionType, consentFormConverter } from '@/types';
import { DEFAULT_CONSENT_SECTIONS, generateConsentFormHtml, generateConsentFormText } from '@/lib/consent-form-html';
import { optimizeConsentSection, generateConsentSection, optimizeConsentItem } from '@/ai/flows/consent-form-ai';
import { useServiceName } from '@/hooks/use-service-name';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, FileText, Copy, ExternalLink, Sparkles, Plus, Trash2,
  GripVertical, Pencil, CheckCircle2, ChevronUp, ChevronDown, X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AiModalMode = 'optimize' | 'generate';
interface AiModalState {
  mode: AiModalMode;
  insertAfterIndex?: number; // for generate
  sectionIndex?: number;     // for optimize
}
interface AiSuggestion {
  title?: string;
  type?: ConsentSectionType;
  summary: string;
  content: string;
}

// Dummy application for admin preview
const PREVIEW_APPLICATION = {
  id: 'PREVIEW-001',
  userName: '山田 太郎',
  userEmail: 'example@email.com',
  deviceType: 'TimeWaver Mobile Quantum',
  rentalPeriod: 12,
  payType: 'monthly' as const,
  userId: '',
  status: 'awaiting_consent_form' as const,
  createdAt: { seconds: 0, nanoseconds: 0 } as any,
  updatedAt: { seconds: 0, nanoseconds: 0 } as any,
};

// ---------------------------------------------------------------------------
// HoverGap — animated "add section" zone between sections
// ---------------------------------------------------------------------------
function HoverGap({
  insertAfterIndex,
  onAddBlank,
  onAddAi,
}: {
  insertAfterIndex: number;
  onAddBlank: () => void;
  onAddAi: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => setVisible(true), 1500);
  };
  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* always-present thin hit area */}
      <div className="h-3" />
      <AnimatePresence>
        {visible && (
          <motion.div
            key={`gap-${insertAfterIndex}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 56 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="flex-1 h-px bg-primary/30" />
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-8 text-xs border-dashed border-primary/50 text-primary hover:bg-primary/5"
                onClick={onAddBlank}
              >
                <Plus className="h-3 w-3 mr-1" />
                ブランク追加
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-8 text-xs border-dashed border-violet-400 text-violet-600 hover:bg-violet-50"
                onClick={onAddAi}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                AI生成
              </Button>
              <div className="flex-1 h-px bg-primary/30" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionCard — displays one editable section
// ---------------------------------------------------------------------------
// Per-item AI popover state
interface ItemAiState {
  itemIndex: number;
  prompt: string;
  loading: boolean;
  suggestions: Array<{ summary: string; text: string }>;
}

function SectionCard({
  section,
  index,
  total,
  serviceName,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAiOptimize,
}: {
  section: ConsentFormSection;
  index: number;
  total: number;
  serviceName: string;
  onUpdate: (updated: ConsentFormSection) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAiOptimize: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(section.title);
  const [draftContent, setDraftContent] = useState(section.content || '');
  const [draftItems, setDraftItems] = useState<string[]>(section.items || []);
  const [itemAi, setItemAi] = useState<ItemAiState | null>(null);
  const { toast } = useToast();

  const handleSave = () => {
    const updated: ConsentFormSection = { ...section, title: draftTitle };
    if (section.type === 'paragraph') updated.content = draftContent;
    else updated.items = draftItems;
    onUpdate(updated);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraftTitle(section.title);
    setDraftContent(section.content || '');
    setDraftItems(section.items || []);
    setEditing(false);
  };

  const typeLabel: Record<ConsentSectionType, string> = {
    paragraph: '本文',
    terms_list: '条項リスト',
    consent_items: '同意チェック',
    signature: '署名欄',
  };
  const typeBadgeColor: Record<ConsentSectionType, string> = {
    paragraph: 'bg-sky-100 text-sky-700',
    terms_list: 'bg-amber-100 text-amber-700',
    consent_items: 'bg-emerald-100 text-emerald-700',
    signature: 'bg-gray-100 text-gray-600',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeBadgeColor[section.type]}`}>
            {typeLabel[section.type]}
          </span>
          <span className="font-semibold text-sm flex-1 truncate">{section.title}</span>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === 0}
              onClick={onMoveUp}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === total - 1}
              onClick={onMoveDown}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {section.type !== 'signature' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  編集
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                  onClick={onAiOptimize}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI最適化
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content preview / editor */}
        <CardContent className="p-4">
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">セクション名</Label>
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              {section.type === 'paragraph' && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">本文</Label>
                  <Textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    rows={5}
                    className="text-sm resize-y"
                  />
                </div>
              )}

              {(section.type === 'terms_list' || section.type === 'consent_items') && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">項目（1行1項目）</Label>
                  {draftItems.map((item, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex gap-2">
                        {/* Number + move buttons */}
                        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-1">
                          <Button
                            variant="ghost" size="icon"
                            className="h-5 w-5 text-gray-400 hover:text-gray-600"
                            disabled={i === 0}
                            onClick={() => {
                              const next = [...draftItems];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              setDraftItems(next);
                            }}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <span className="text-xs text-muted-foreground w-5 text-center leading-none">
                            {i + 1}
                          </span>
                          <Button
                            variant="ghost" size="icon"
                            className="h-5 w-5 text-gray-400 hover:text-gray-600"
                            disabled={i === draftItems.length - 1}
                            onClick={() => {
                              const next = [...draftItems];
                              [next[i], next[i + 1]] = [next[i + 1], next[i]];
                              setDraftItems(next);
                            }}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>

                        <Textarea
                          value={item}
                          onChange={(e) => {
                            const next = [...draftItems];
                            next[i] = e.target.value;
                            setDraftItems(next);
                          }}
                          rows={2}
                          className="text-sm flex-1 resize-y"
                        />

                        {/* Per-item actions */}
                        <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-violet-500 hover:text-violet-700 hover:bg-violet-50"
                            title="AI最適化"
                            onClick={() => setItemAi({ itemIndex: i, prompt: '', loading: false, suggestions: [] })}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDraftItems(draftItems.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Per-item AI panel */}
                      <AnimatePresence>
                        {itemAi?.itemIndex === i && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="ml-9 overflow-hidden"
                          >
                            <div className="border border-violet-200 bg-violet-50/60 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-violet-700 flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" /> AI最適化 — 項目 {i + 1}
                                </span>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setItemAi(null)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                              <Textarea
                                placeholder="例：より簡潔に / 法的に強化 / やさしい言葉で"
                                value={itemAi.prompt}
                                onChange={(e) => setItemAi({ ...itemAi, prompt: e.target.value })}
                                rows={2}
                                className="text-xs resize-none"
                              />
                              <Button
                                size="sm"
                                className="w-full rounded-lg text-xs h-7"
                                disabled={itemAi.loading || !itemAi.prompt.trim()}
                                onClick={async () => {
                                  setItemAi({ ...itemAi, loading: true, suggestions: [] });
                                  try {
                                    const result = await optimizeConsentItem({
                                      sectionTitle: draftTitle,
                                      itemText: item,
                                      siblingItems: draftItems.filter((_, idx) => idx !== i),
                                      userPrompt: itemAi.prompt,
                                      serviceName,
                                    });
                                    setItemAi({ ...itemAi, loading: false, suggestions: result.suggestions });
                                  } catch {
                                    toast({ variant: 'destructive', title: 'AI生成に失敗しました' });
                                    setItemAi({ ...itemAi, loading: false });
                                  }
                                }}
                              >
                                {itemAi.loading
                                  ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />生成中...</>
                                  : <><Sparkles className="h-3 w-3 mr-1" />生成</>}
                              </Button>
                              {itemAi.suggestions.length > 0 && (
                                <div className="space-y-1.5">
                                  {itemAi.suggestions.map((s, si) => (
                                    <button
                                      key={si}
                                      type="button"
                                      className="w-full text-left border border-violet-200 rounded-lg p-2 hover:bg-white hover:border-violet-400 transition-colors"
                                      onClick={() => {
                                        const next = [...draftItems];
                                        next[i] = s.text;
                                        setDraftItems(next);
                                        setItemAi(null);
                                      }}
                                    >
                                      <span className="text-[10px] text-violet-500 font-medium block">案 {si + 1} — {s.summary}</span>
                                      <span className="text-xs text-gray-700 line-clamp-2">{s.text}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs rounded-lg border-dashed"
                    onClick={() => setDraftItems([...draftItems, ''])}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    項目を追加
                  </Button>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={handleCancel}>
                  キャンセル
                </Button>
                <Button size="sm" className="rounded-lg text-xs" onClick={handleSave}>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  適用
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {section.type === 'paragraph' && (
                <p className="line-clamp-3">{section.content || '（空のセクション）'}</p>
              )}
              {(section.type === 'terms_list' || section.type === 'consent_items') && (
                <p>
                  {section.items?.length ?? 0}件の項目
                  {section.items && section.items.length > 0 && (
                    <span className="ml-2 text-xs">
                      — 例: {section.items[0].slice(0, 40)}…
                    </span>
                  )}
                </p>
              )}
              {section.type === 'signature' && (
                <p>同意日 / お名前 / ご住所 / 電話番号</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AiModal — shared for both optimize and generate
// ---------------------------------------------------------------------------
function AiModal({
  open,
  mode,
  section,
  serviceName,
  existingSectionTitles,
  onApply,
  onClose,
}: {
  open: boolean;
  mode: AiModalMode;
  section?: ConsentFormSection;
  serviceName: string;
  existingSectionTitles: string[];
  onApply: (suggestion: AiSuggestion) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setPrompt('');
      setSuggestions([]);
      setLoading(false);
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setSuggestions([]);
    try {
      if (mode === 'optimize' && section) {
        const currentContent =
          section.type === 'paragraph'
            ? section.content || ''
            : JSON.stringify(section.items || []);
        const result = await optimizeConsentSection({
          sectionTitle: section.title,
          sectionType: section.type,
          currentContent,
          userPrompt: prompt,
          serviceName,
        });
        setSuggestions(
          result.suggestions.map((s) => ({ summary: s.summary, content: s.content }))
        );
      } else {
        const result = await generateConsentSection({
          prompt,
          existingSectionTitles,
          serviceName,
        });
        setSuggestions(
          result.suggestions.map((s) => ({
            title: s.title,
            type: s.type as ConsentSectionType,
            summary: s.summary,
            content: s.content,
          }))
        );
      }
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'AI生成に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            {mode === 'optimize' ? `AI最適化 — ${section?.title}` : 'AIセクション生成'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'optimize'
              ? '最適化の指示を入力してください。AIが3つの改善案を提案します。'
              : '追加したいセクションの内容を説明してください。AIが3つの提案を生成します。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            placeholder={
              mode === 'optimize'
                ? '例：より簡潔にしてください / 法的に強化してください / やさしい言葉で書き直してください'
                : '例：キャンセルポリシーに関するセクション / 個人情報の利用目的を詳しく説明するセクション'
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full rounded-xl"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />生成中...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />生成する</>
            )}
          </Button>
        </div>

        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 pt-2"
            >
              <p className="text-sm font-semibold text-muted-foreground">
                提案（クリックして採用）
              </p>
              {suggestions.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card
                    className="cursor-pointer border-2 border-transparent hover:border-violet-400 hover:shadow-md transition-all rounded-xl"
                    onClick={() => { onApply(s); onClose(); }}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs rounded-full">
                          案 {i + 1}
                        </Badge>
                        {s.title && (
                          <span className="text-xs font-semibold">{s.title}</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">{s.summary}</span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-4 whitespace-pre-wrap">
                        {(() => {
                          try {
                            const arr = JSON.parse(s.content);
                            if (Array.isArray(arr)) return arr.slice(0, 3).join('\n');
                          } catch {}
                          return s.content;
                        })()}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="rounded-xl" onClick={onClose}>閉じる</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ConsentFormManager() {
  const db = useFirestore();
  const serviceName = useServiceName();
  const { toast } = useToast();

  const consentFormRef = useMemo(
    () => doc(db, 'consentForm', 'current').withConverter(consentFormConverter),
    [db]
  );
  const { data: consentFormData, loading } = useDoc<ConsentFormDoc>(consentFormRef as any);

  // Local editable sections state
  const [sections, setSections] = useState<ConsentFormSection[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [aiModal, setAiModal] = useState<AiModalState | null>(null);

  // Seed / hydrate sections from Firestore
  useEffect(() => {
    if (!loading) {
      if (consentFormData?.sections && consentFormData.sections.length > 0) {
        setSections([...consentFormData.sections].sort((a, b) => a.order - b.order));
      } else {
        setSections(DEFAULT_CONSENT_SECTIONS);
      }
    }
  }, [loading, consentFormData]);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const reordered = sections.map((s, i) => ({ ...s, order: i }));
      await setDoc(
        doc(db, 'consentForm', 'current'),
        { sections: reordered, updatedAt: serverTimestamp() },
        { merge: true }
      );
      toast({ title: '同意書を保存しました' });
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: '保存に失敗しました' });
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Section mutations
  // ---------------------------------------------------------------------------
  const updateSection = useCallback((index: number, updated: ConsentFormSection) => {
    setSections((prev) => prev.map((s, i) => (i === index ? updated : s)));
  }, []);

  const deleteSection = useCallback((index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveSection = useCallback((index: number, direction: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const addBlankSection = useCallback((insertAfterIndex: number) => {
    const newSection: ConsentFormSection = {
      id: `section_${Date.now()}`,
      order: insertAfterIndex + 1,
      title: '新しいセクション',
      type: 'paragraph',
      content: '',
    };
    setSections((prev) => {
      const next = [...prev];
      next.splice(insertAfterIndex + 1, 0, newSection);
      return next;
    });
  }, []);

  // Apply AI suggestion (optimize → replace content/items of existing section)
  const applyOptimize = useCallback(
    (sectionIndex: number, suggestion: AiSuggestion) => {
      setSections((prev) => {
        const next = [...prev];
        const section = { ...next[sectionIndex] };
        if (section.type === 'paragraph') {
          section.content = suggestion.content;
        } else {
          try {
            const arr = JSON.parse(suggestion.content);
            section.items = Array.isArray(arr) ? arr : [suggestion.content];
          } catch {
            section.items = [suggestion.content];
          }
        }
        next[sectionIndex] = section;
        return next;
      });
      toast({ title: 'AI提案を適用しました' });
    },
    [toast]
  );

  // Apply AI suggestion (generate → insert new section)
  const applyGenerate = useCallback(
    (insertAfterIndex: number, suggestion: AiSuggestion) => {
      const type = (suggestion.type as ConsentSectionType) || 'paragraph';
      let content: string | undefined;
      let items: string[] | undefined;

      if (type === 'paragraph') {
        content = suggestion.content;
      } else {
        try {
          const arr = JSON.parse(suggestion.content);
          items = Array.isArray(arr) ? arr : [suggestion.content];
        } catch {
          items = [suggestion.content];
        }
      }

      const newSection: ConsentFormSection = {
        id: `section_${Date.now()}`,
        order: insertAfterIndex + 1,
        title: suggestion.title || '新しいセクション',
        type,
        content,
        items,
      };

      setSections((prev) => {
        const next = [...prev];
        next.splice(insertAfterIndex + 1, 0, newSection);
        return next;
      });
      toast({ title: 'AIセクションを追加しました' });
    },
    [toast]
  );

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------
  const previewHtml = useMemo(
    () =>
      generateConsentFormHtml({
        application: PREVIEW_APPLICATION as any,
        serviceName,
        sections,
      }),
    [sections, serviceName]
  );

  const handleOpenPdf = () => {
    const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleCopyText = async () => {
    const text = generateConsentFormText(sections, serviceName);
    await navigator.clipboard.writeText(text);
    toast({ title: 'テキストをコピーしました' });
  };

  // Current AI modal section
  const aiSection =
    aiModal?.mode === 'optimize' && aiModal.sectionIndex !== undefined
      ? sections[aiModal.sectionIndex]
      : undefined;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="preview">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="rounded-xl">
            <TabsTrigger value="preview" className="rounded-lg">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              プレビュー
            </TabsTrigger>
            <TabsTrigger value="edit" className="rounded-lg">
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              編集
            </TabsTrigger>
          </TabsList>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="rounded-xl px-5"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            保存
          </Button>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* PREVIEW TAB                                                        */}
        {/* ----------------------------------------------------------------- */}
        <TabsContent value="preview" className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={handleOpenPdf}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              PDF出力（印刷画面で開く）
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={handleCopyText}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              テキストをコピー
            </Button>
          </div>

          {/* Inline preview iframe */}
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-inner bg-gray-100">
            <iframe
              srcDoc={previewHtml}
              title="同意書プレビュー"
              className="w-full"
              style={{ height: '75vh', border: 'none' }}
              sandbox="allow-same-origin"
            />
          </div>
        </TabsContent>

        {/* ----------------------------------------------------------------- */}
        {/* EDIT TAB                                                           */}
        {/* ----------------------------------------------------------------- */}
        <TabsContent value="edit">
          <div className="space-y-0">
            {/* Gap before first section */}
            <HoverGap
              insertAfterIndex={-1}
              onAddBlank={() => addBlankSection(-1)}
              onAddAi={() => setAiModal({ mode: 'generate', insertAfterIndex: -1 })}
            />

            <AnimatePresence mode="popLayout">
              {sections.map((section, index) => (
                <div key={section.id}>
                  <SectionCard
                    section={section}
                    index={index}
                    total={sections.length}
                    serviceName={serviceName}
                    onUpdate={(updated) => updateSection(index, updated)}
                    onDelete={() => deleteSection(index)}
                    onMoveUp={() => moveSection(index, -1)}
                    onMoveDown={() => moveSection(index, 1)}
                    onAiOptimize={() =>
                      setAiModal({ mode: 'optimize', sectionIndex: index })
                    }
                  />
                  <HoverGap
                    insertAfterIndex={index}
                    onAddBlank={() => addBlankSection(index)}
                    onAddAi={() =>
                      setAiModal({ mode: 'generate', insertAfterIndex: index })
                    }
                  />
                </div>
              ))}
            </AnimatePresence>

            {sections.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                セクションがありません。上の「ブランク追加」または「AI生成」で追加してください。
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------------------- */}
      {/* AI Modal                                                             */}
      {/* ------------------------------------------------------------------- */}
      <AiModal
        open={!!aiModal}
        mode={aiModal?.mode ?? 'generate'}
        section={aiSection}
        serviceName={serviceName}
        existingSectionTitles={sections.map((s) => s.title)}
        onApply={(suggestion) => {
          if (aiModal?.mode === 'optimize' && aiModal.sectionIndex !== undefined) {
            applyOptimize(aiModal.sectionIndex, suggestion);
          } else if (
            aiModal?.mode === 'generate' &&
            aiModal.insertAfterIndex !== undefined
          ) {
            applyGenerate(aiModal.insertAfterIndex, suggestion);
          }
        }}
        onClose={() => setAiModal(null)}
      />
    </div>
  );
}
