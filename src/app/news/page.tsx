'use client';

import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Newspaper, ChevronRight, Calendar, ExternalLink } from 'lucide-react';
import { News } from '@/types';
import Link from 'next/link';
import { useServiceName } from '@/hooks/use-service-name';

export default function NewsListPage() {
  const db = useFirestore();
  const serviceName = useServiceName();

  const newsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(
      collection(db, 'news'),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc')
    );
  }, [db]);

  const { data: newsItems, loading } = useCollection<News>(newsQuery as any);

  return (
    <div className="container mx-auto px-4 py-16 space-y-12">
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold font-headline flex items-center justify-center gap-3">
          <Newspaper className="h-10 w-10 text-primary" /> お知らせ
        </h1>
        <p className="text-muted-foreground text-lg">
          {serviceName}からの最新情報、新機種の入荷、メンテナンス情報などをお届けします。
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 max-w-4xl mx-auto">
          {newsItems.length === 0 ? (
            <div className="text-center py-20 bg-secondary/10 rounded-[2rem] text-muted-foreground">
              現在、公開されているお知らせはありません。
            </div>
          ) : (
            newsItems.map((item) => {
              // Prefer body (HTML) for the preview snippet; fall back to content (plain text)
              // so older records saved before body was populated still read cleanly.
              const preview = ((item.body || '').replace(/<[^>]*>/g, '') || item.content || '').trim();
              const hasLink = !!item.linkUrl;
              return (
                <div key={item.id} className="relative">
                  <Link href={`/news/${item.id}`}>
                    <Card className="border-none shadow-lg hover:shadow-2xl transition-all duration-300 rounded-[2rem] overflow-hidden group cursor-pointer bg-white">
                      <CardHeader className="flex flex-row items-center gap-6 p-8">
                        <div className="hidden sm:flex flex-col items-center justify-center h-16 w-16 bg-primary/5 text-primary rounded-2xl shrink-0">
                          <Calendar className="h-5 w-5 mb-1" />
                          <span className="text-[10px] font-bold">
                            {item.publishedAt?.seconds ? new Date(item.publishedAt.seconds * 1000).getMonth() + 1 : '-'} /
                            {item.publishedAt?.seconds ? new Date(item.publishedAt.seconds * 1000).getDate() : '-'}
                          </span>
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">News</Badge>
                            {hasLink && (
                              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-300 bg-emerald-50">
                                <ExternalLink className="h-2.5 w-2.5" /> 関連リンク
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground sm:hidden">
                              {item.publishedAt?.seconds ? new Date(item.publishedAt.seconds * 1000).toLocaleDateString() : ''}
                            </span>
                          </div>
                          <CardTitle className="text-xl font-headline group-hover:text-primary transition-colors line-clamp-1">
                            {item.title}
                          </CardTitle>
                          <CardDescription className="line-clamp-2 text-sm leading-relaxed">
                            {preview || '—'}
                          </CardDescription>
                          {hasLink && (
                            <a
                              href={item.linkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-primary hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {item.linkLabel || '詳細を見る'}
                            </a>
                          )}
                        </div>
                        <ChevronRight className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </CardHeader>
                    </Card>
                  </Link>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
