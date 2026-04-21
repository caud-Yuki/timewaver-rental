'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Newspaper, Loader2, Link2, ExternalLink } from 'lucide-react';
import { News, newsConverter } from '@/types';

const emptyForm: Partial<News> = {
  title: '',
  content: '',
  status: 'draft',
  linkUrl: '',
  linkLabel: '',
};

/**
 * Converts a plain-text content string into minimal HTML for the `body` field:
 *   - escapes HTML special characters
 *   - converts URLs into anchor tags
 *   - preserves paragraphs (double newline) and line breaks (single newline)
 */
function contentToBody(content: string): string {
  if (!content) return '';
  const urls: string[] = [];
  let processed = content.replace(/(https?:\/\/[^\s]+)/g, (m) => {
    urls.push(m);
    return `__URL_${urls.length - 1}__`;
  });
  processed = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  urls.forEach((u, i) => {
    processed = processed.replace(
      `__URL_${i}__`,
      `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`
    );
  });
  // Paragraphs: split on blank lines, wrap each in <p>, keep single newlines as <br>.
  return processed
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const NewsForm = ({
  article,
  onSave,
  onCancel,
  saving,
}: {
  article?: Partial<News>;
  onSave: (n: Partial<News>) => void;
  onCancel: () => void;
  saving: boolean;
}) => {
  const [current, setCurrent] = useState<Partial<News>>(article || emptyForm);

  // Keep form state in sync when a different article is opened for editing
  useEffect(() => {
    setCurrent(article || emptyForm);
  }, [article?.id]);

  const handleChange = (field: keyof News, value: any) => {
    setCurrent(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!current.title?.trim() || !current.content?.trim()) return;
    // Basic URL validation: if linkUrl provided, it must look like an http(s) URL.
    if (current.linkUrl && !/^https?:\/\//i.test(current.linkUrl.trim())) {
      alert('リンクURLは http:// または https:// で始めてください。');
      return;
    }
    onSave(current);
  };

  return (
    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{article?.id ? 'ニュース記事を編集' : 'ニュース記事を新規作成'}</DialogTitle>
        <DialogDescription>タイトル・本文・公開ステータス、および外部リンク（任意）を入力してください。</DialogDescription>
      </DialogHeader>
      <div className="space-y-5 py-4">
        <div className="space-y-2">
          <Label htmlFor="title">タイトル <span className="text-destructive">*</span></Label>
          <Input
            id="title"
            value={current.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="新サービススタート間近！"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">ステータス</Label>
          <Select value={current.status || 'draft'} onValueChange={(v: 'draft' | 'published') => handleChange('status', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">下書き (Draft)</SelectItem>
              <SelectItem value="published">公開 (Published)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">本文 <span className="text-destructive">*</span></Label>
          <Textarea
            id="content"
            value={current.content || ''}
            onChange={(e) => handleChange('content', e.target.value)}
            className="min-h-[200px]"
            placeholder="お知らせの本文を入力してください。URLは自動的にリンク化されます。"
          />
          <p className="text-xs text-muted-foreground">
            改行はそのまま反映されます。段落は空行で区切ってください。URLは自動的にクリック可能なリンクになります。
          </p>
        </div>

        <div className="p-4 rounded-xl bg-gray-50/80 border space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <Label className="text-sm font-semibold">外部リンク（任意）</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkUrl" className="text-xs">リンクURL</Label>
            <Input
              id="linkUrl"
              type="url"
              value={current.linkUrl || ''}
              onChange={(e) => handleChange('linkUrl', e.target.value)}
              placeholder="https://example.com/campaign"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkLabel" className="text-xs">ボタンラベル（空なら「詳細を見る」）</Label>
            <Input
              id="linkLabel"
              value={current.linkLabel || ''}
              onChange={(e) => handleChange('linkLabel', e.target.value)}
              placeholder="詳細を見る"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            URLを設定すると、/news ページの記事カードおよび詳細ページにリンクボタンが表示されます。
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>キャンセル</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          保存
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default function NewsPage() {
  const db = useFirestore();
  const newsQuery = useMemo(
    () => query(collection(db, 'news'), orderBy('createdAt', 'desc')).withConverter(newsConverter),
    [db]
  );
  const { data: news, loading } = useCollection<News>(newsQuery as any);
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Partial<News> | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setSelectedArticle(undefined);
    setIsFormOpen(true);
  };
  const openEdit = (article: News) => {
    setSelectedArticle(article);
    setIsFormOpen(true);
  };

  const handleSave = async (articleData: Partial<News>) => {
    setSaving(true);
    try {
      const now = new Date();
      const body = contentToBody(articleData.content || '');
      const linkUrl = (articleData.linkUrl || '').trim();
      const linkLabel = (articleData.linkLabel || '').trim();

      // Build the write payload explicitly — DO NOT spread `articleData`
      // (that would forward undefined fields which Firestore rejects).
      const basePayload: Record<string, any> = {
        title: articleData.title?.trim() || '',
        content: articleData.content || '',
        body,
        status: articleData.status || 'draft',
        isPublic: articleData.status === 'published',
        linkUrl: linkUrl || null,
        linkLabel: linkLabel || null,
        updatedAt: serverTimestamp(),
      };

      if (articleData.id) {
        // Update: preserve existing publishedAt unless we're publishing for the first time.
        const existingPublishedAt = (articleData as News).publishedAt;
        const updatePayload: Record<string, any> = { ...basePayload };
        if (articleData.status === 'published' && !existingPublishedAt) {
          updatePayload.publishedAt = serverTimestamp();
        } else if (articleData.status !== 'published' && !existingPublishedAt) {
          // keep publishedAt unset rather than writing null so previously scheduled timestamps
          // aren't clobbered; do nothing.
        }
        await updateDoc(doc(db, 'news', articleData.id), updatePayload);
        toast({ title: '更新しました', description: articleData.title });
      } else {
        // New article
        const createPayload: Record<string, any> = {
          ...basePayload,
          createdAt: serverTimestamp(),
        };
        if (articleData.status === 'published') {
          createPayload.publishedAt = serverTimestamp();
        }
        await addDoc(collection(db, 'news'), createPayload);
        toast({ title: '作成しました', description: articleData.title });
      }
      setIsFormOpen(false);
      setSelectedArticle(undefined);
    } catch (e: any) {
      console.error('[News] Save failed:', e);
      toast({
        variant: 'destructive',
        title: '保存に失敗しました',
        description: e?.message || 'An error occurred while saving the article.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('この記事を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'news', id));
      toast({ title: '削除しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e?.message || '削除に失敗しました。' });
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Newspaper className="h-8 w-8 text-primary" /> お知らせ管理
          </h1>
          <p className="text-muted-foreground">一般公開するお知らせ・ニュース記事を管理します。</p>
        </div>
        <Button className="rounded-xl" onClick={openNew}>
          <PlusCircle className="h-4 w-4 mr-2" />
          新規記事を作成
        </Button>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5">タイトル</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>リンク</TableHead>
                <TableHead>公開日</TableHead>
                <TableHead className="text-right pr-8">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && (!news || news.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    まだ記事がありません。「新規記事を作成」から追加してください。
                  </TableCell>
                </TableRow>
              )}
              {!loading && news?.map((article) => (
                <TableRow key={article.id}>
                  <TableCell className="pl-8 font-medium max-w-md">
                    <div className="line-clamp-1">{article.title}</div>
                  </TableCell>
                  <TableCell>
                    {article.status === 'published' ? (
                      <Badge className="bg-blue-500 text-white">公開中</Badge>
                    ) : (
                      <Badge variant="outline">下書き</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {article.linkUrl ? (
                      <a
                        href={article.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline max-w-[200px]"
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{article.linkLabel || article.linkUrl}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {article.publishedAt?.toDate
                      ? article.publishedAt.toDate().toLocaleDateString('ja-JP')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right pr-8 space-x-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(article)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-destructive"
                      onClick={() => handleDelete(article.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) setSelectedArticle(undefined); }}>
        <NewsForm
          article={selectedArticle}
          onSave={handleSave}
          onCancel={() => { setIsFormOpen(false); setSelectedArticle(undefined); }}
          saving={saving}
        />
      </Dialog>
    </div>
  );
}
