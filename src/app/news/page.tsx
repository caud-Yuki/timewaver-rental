'use client';

import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Newspaper, ChevronRight, Calendar } from 'lucide-react';
import { News } from '@/types';
import Link from 'next/link';

export default function NewsListPage() {
  const db = useFirestore();

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
          ChronoRentからの最新情報、新機種の入荷、メンテナンス情報などをお届けします。
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
            newsItems.map((item) => (
              <Link key={item.id} href={`/news/${item.id}`}>
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
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">News</Badge>
                        <span className="text-xs text-muted-foreground sm:hidden">
                          {item.publishedAt?.seconds ? new Date(item.publishedAt.seconds * 1000).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <CardTitle className="text-xl font-headline group-hover:text-primary transition-colors line-clamp-1">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-sm leading-relaxed">
                        {item.body}
                      </CardDescription>
                    </div>
                    <ChevronRight className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </CardHeader>
                </Card>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
