'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, getDocs, where } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Loader2, ShieldAlert, BookOpen, FolderPlus, HelpCircle, EyeOff } from 'lucide-react';
import { QaCategory, qaCategoryConverter, QaItem, qaItemConverter, UserProfile, userProfileConverter } from '@/types';

export default function QaListPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  // Admin guard
  const profileRef = useMemo(() => (user ? doc(db, 'users', user.uid).withConverter(userProfileConverter) : null), [db, user]);
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(profileRef as any);

  // Data
  const categoriesQuery = useMemo(
    () => (profile?.role === 'admin' ? collection(db, 'qaCategories').withConverter(qaCategoryConverter) : null),
    [db, profile?.role]
  );
  const { data: categories, loading: catLoading } = useCollection<QaCategory>(categoriesQuery as any);

  const itemsQuery = useMemo(
    () => (profile?.role === 'admin' ? collection(db, 'qaItems').withConverter(qaItemConverter) : null),
    [db, profile?.role]
  );
  const { data: items, loading: itemsLoading } = useCollection<QaItem>(itemsQuery as any);

  const sortedCategories = useMemo(
    () => [...(categories || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [categories]
  );
  const itemsByCategory = useMemo(() => {
    const map: Record<string, QaItem[]> = {};
    for (const it of items || []) {
      (map[it.categoryId] ||= []).push(it);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return map;
  }, [items]);

  // Category form state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<QaCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catOrder, setCatOrder] = useState('0');

  // QA form state
  const [qaDialogOpen, setQaDialogOpen] = useState(false);
  const [editingQa, setEditingQa] = useState<QaItem | null>(null);
  const [qaCategoryId, setQaCategoryId] = useState('');
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [qaOrder, setQaOrder] = useState('0');
  const [qaIsPublic, setQaIsPublic] = useState(true);

  const openCreateCat = () => {
    setEditingCat(null);
    setCatName('');
    setCatDescription('');
    setCatOrder(String(sortedCategories.length));
    setCatDialogOpen(true);
  };
  const openEditCat = (c: QaCategory) => {
    setEditingCat(c);
    setCatName(c.name || '');
    setCatDescription(c.description || '');
    setCatOrder(String(c.order ?? 0));
    setCatDialogOpen(true);
  };

  const handleSaveCat = async () => {
    if (!catName.trim()) {
      toast({ variant: 'destructive', title: 'カテゴリー名を入力してください' });
      return;
    }
    try {
      const data: any = {
        name: catName.trim(),
        description: catDescription.trim(),
        order: Number(catOrder) || 0,
        updatedAt: serverTimestamp(),
      };
      if (editingCat) {
        await updateDoc(doc(db, 'qaCategories', editingCat.id), data);
        toast({ title: 'カテゴリーを更新しました' });
      } else {
        await addDoc(collection(db, 'qaCategories'), { ...data, createdAt: serverTimestamp() });
        toast({ title: 'カテゴリーを追加しました' });
      }
      setCatDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e?.message || '保存に失敗しました' });
    }
  };

  const handleDeleteCat = async (c: QaCategory) => {
    const count = (itemsByCategory[c.id] || []).length;
    const msg = count > 0
      ? `カテゴリー「${c.name}」には ${count} 件のQ&Aがあります。カテゴリーと、その中のQ&Aをすべて削除しますか？`
      : `カテゴリー「${c.name}」を削除しますか？`;
    if (!window.confirm(msg)) return;
    try {
      // Cascade-delete the QA items in this category.
      const snap = await getDocs(query(collection(db, 'qaItems'), where('categoryId', '==', c.id)));
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'qaItems', d.id))));
      await deleteDoc(doc(db, 'qaCategories', c.id));
      toast({ title: 'カテゴリーを削除しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: '削除に失敗しました', description: e?.message });
    }
  };

  const openCreateQa = (categoryId?: string) => {
    setEditingQa(null);
    setQaCategoryId(categoryId || sortedCategories[0]?.id || '');
    setQaQuestion('');
    setQaAnswer('');
    setQaOrder('0');
    setQaIsPublic(true);
    setQaDialogOpen(true);
  };
  const openEditQa = (it: QaItem) => {
    setEditingQa(it);
    setQaCategoryId(it.categoryId || '');
    setQaQuestion(it.question || '');
    setQaAnswer(it.answer || '');
    setQaOrder(String(it.order ?? 0));
    setQaIsPublic(it.isPublic !== false);
    setQaDialogOpen(true);
  };

  const handleSaveQa = async () => {
    const missing: string[] = [];
    if (!qaCategoryId) missing.push('カテゴリー');
    if (!qaQuestion.trim()) missing.push('質問');
    if (!qaAnswer.trim()) missing.push('答え');
    if (missing.length) {
      toast({ variant: 'destructive', title: '必須項目が未入力です', description: missing.join(' / ') });
      return;
    }
    try {
      const data: any = {
        categoryId: qaCategoryId,
        question: qaQuestion.trim(),
        answer: qaAnswer.trim(),
        order: Number(qaOrder) || 0,
        isPublic: qaIsPublic,
        updatedAt: serverTimestamp(),
      };
      if (editingQa) {
        await updateDoc(doc(db, 'qaItems', editingQa.id), data);
        toast({ title: 'Q&Aを更新しました' });
      } else {
        await addDoc(collection(db, 'qaItems'), { ...data, createdAt: serverTimestamp() });
        toast({ title: 'Q&Aを追加しました' });
      }
      setQaDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e?.message || '保存に失敗しました' });
    }
  };

  const handleDeleteQa = async (it: QaItem) => {
    if (!window.confirm('このQ&Aを削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'qaItems', it.id));
      toast({ title: '削除しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: '削除に失敗しました', description: e?.message });
    }
  };

  const catName_ = (id: string) => sortedCategories.find(c => c.id === id)?.name || '(未分類)';

  if (authLoading || (profileLoading && !profile)) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  if (!user || profile?.role !== 'admin') {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">アクセス制限</h1>
        <p className="text-muted-foreground">管理者権限が必要です。</p>
      </div>
    );
  }

  const totalItems = (items || []).length;
  const loading = catLoading || itemsLoading;

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" /> AIナレッジ（Q&Aリスト）
          </h1>
          <p className="text-muted-foreground">
            AIサポートが自由記述の質問に答えるために参照するQ&Aを管理します。
            カテゴリー {sortedCategories.length} 件 / Q&A {totalItems} 件
          </p>
        </div>
      </div>

      <Tabs defaultValue="qa">
        <TabsList className="bg-white border rounded-xl h-11 p-1">
          <TabsTrigger value="qa" className="rounded-lg px-4 flex items-center gap-2"><HelpCircle className="h-4 w-4" /> Q&A一覧</TabsTrigger>
          <TabsTrigger value="categories" className="rounded-lg px-4 flex items-center gap-2"><FolderPlus className="h-4 w-4" /> カテゴリー管理</TabsTrigger>
        </TabsList>

        {/* Q&A Tab */}
        <TabsContent value="qa" className="mt-6 space-y-6">
          <div className="flex justify-end">
            <Button className="rounded-xl" onClick={() => openCreateQa()} disabled={sortedCategories.length === 0}>
              <PlusCircle className="h-4 w-4 mr-2" /> Q&Aを追加
            </Button>
          </div>

          {sortedCategories.length === 0 && !loading && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                まず「カテゴリー管理」タブでカテゴリーを追加してください。
              </CardContent>
            </Card>
          )}

          {loading && <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}

          {!loading && sortedCategories.map(cat => {
            const list = itemsByCategory[cat.id] || [];
            return (
              <Card key={cat.id} className="border-none shadow-md rounded-2xl bg-white overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 bg-secondary/10 border-b">
                  <div>
                    <h3 className="font-bold flex items-center gap-2">
                      {cat.name}
                      <Badge variant="outline" className="text-[10px]">{list.length} 件</Badge>
                    </h3>
                    {cat.description && <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>}
                  </div>
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openCreateQa(cat.id)}>
                    <PlusCircle className="h-3.5 w-3.5 mr-1" /> 追加
                  </Button>
                </div>
                <CardContent className="p-0 divide-y">
                  {list.length === 0 && <div className="px-6 py-6 text-sm text-muted-foreground">Q&Aがまだありません。</div>}
                  {list.map(it => (
                    <div key={it.id} className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-muted/30">
                      <div className="min-w-0">
                        <p className="font-medium flex items-center gap-2">
                          <span className="text-primary">Q.</span> {it.question}
                          {it.isPublic === false && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground flex items-center gap-0.5"><EyeOff className="h-2.5 w-2.5" /> 非公開</Badge>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap"><span className="text-emerald-600 font-medium">A.</span> {it.answer}</p>
                      </div>
                      <div className="shrink-0 space-x-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEditQa(it)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDeleteQa(it)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="mt-6 space-y-6">
          <div className="flex justify-end">
            <Button className="rounded-xl" onClick={openCreateCat}>
              <FolderPlus className="h-4 w-4 mr-2" /> カテゴリーを追加
            </Button>
          </div>
          {loading && <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
          {!loading && sortedCategories.length === 0 && (
            <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">カテゴリーがありません。</CardContent></Card>
          )}
          <div className="grid gap-3">
            {sortedCategories.map(cat => (
              <Card key={cat.id} className="border-none shadow-sm rounded-xl bg-white">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold flex items-center gap-2">
                      {cat.name}
                      <Badge variant="outline" className="text-[10px]">{(itemsByCategory[cat.id] || []).length} 件</Badge>
                      <code className="text-[10px] text-muted-foreground">#{cat.order ?? 0}</code>
                    </p>
                    {cat.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{cat.description}</p>}
                  </div>
                  <div className="shrink-0 space-x-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEditCat(cat)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDeleteCat(cat)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Category dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCat ? 'カテゴリーを編集' : 'カテゴリーを追加'}</DialogTitle>
            <DialogDescription>AIが質問を振り分ける単位です。説明はAIがカテゴリーを選ぶ手がかりになります。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>カテゴリー名 <span className="text-destructive">*</span></Label>
              <Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="例: 料金・お支払い" />
            </div>
            <div className="space-y-1.5">
              <Label>説明（AI向けヒント）</Label>
              <Textarea value={catDescription} onChange={e => setCatDescription(e.target.value)} rows={2} placeholder="例: 月額料金、支払い方法、解約や返金に関する質問" />
            </div>
            <div className="space-y-1.5">
              <Label>表示順</Label>
              <Input type="number" value={catOrder} onChange={e => setCatOrder(e.target.value)} className="w-28" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSaveCat}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QA dialog */}
      <Dialog open={qaDialogOpen} onOpenChange={setQaDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQa ? 'Q&Aを編集' : 'Q&Aを追加'}</DialogTitle>
            <DialogDescription>質問（Q）と答え（A）を一対で登録します。AIがこの内容を参照して回答します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>カテゴリー <span className="text-destructive">*</span></Label>
              <select
                value={qaCategoryId}
                onChange={e => setQaCategoryId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">カテゴリーを選択...</option>
                {sortedCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>質問（Q） <span className="text-destructive">*</span></Label>
              <Textarea value={qaQuestion} onChange={e => setQaQuestion(e.target.value)} rows={2} placeholder="例: レンタル期間はどのくらいですか？" />
            </div>
            <div className="space-y-1.5">
              <Label>答え（A） <span className="text-destructive">*</span></Label>
              <Textarea value={qaAnswer} onChange={e => setQaAnswer(e.target.value)} rows={6} placeholder="例: 3ヶ月・6ヶ月・12ヶ月からお選びいただけます。..." />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1.5">
                <Label>表示順</Label>
                <Input type="number" value={qaOrder} onChange={e => setQaOrder(e.target.value)} className="w-28" />
              </div>
              <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
                <div className="space-y-0.5">
                  <Label className="font-semibold">AIが参照する</Label>
                  <p className="text-[11px] text-muted-foreground">OFFにするとAIはこのQ&Aを使いません。</p>
                </div>
                <Switch checked={qaIsPublic} onCheckedChange={setQaIsPublic} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQaDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSaveQa}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
