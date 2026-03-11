'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, ChevronLeft, Calendar, Share2 } from 'lucide-react';
import { News } from '@/types';

export default function NewsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const db = useFirestore();
  const id = params.id as string;

  const newsRef = useMemoFirebase(() => {
    if (!db || !id) return null;
    return doc(db, 'news', id);
  }, [db, id]);

  const { data: news, loading } = useDoc<News>(newsRef as any);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!news) {
    return (
      <div className="container mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold">記事が見つかりませんでした</h1>
        <Button onClick={() => router.push('/news')} variant="outline" className="rounded-xl">
          一覧に戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <Button variant="ghost" onClick={() => router.push('/news')} className="mb-8 rounded-xl text-muted-foreground hover:text-primary">
        <ChevronLeft className="mr-2 h-4 w-4" /> お知らせ一覧へ戻る
      </Button>

      <Card className="border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white">
        <CardHeader className="p-10 md:p-16 bg-primary/5 space-y-6">
          <div className="flex items-center gap-3">
            <Badge className="bg-primary hover:bg-primary font-bold px-4 py-1">NEWS</Badge>
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <Calendar className="h-4 w-4" />
              {news.publishedAt?.seconds ? new Date(news.publishedAt.seconds * 1000).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }) : 'New'}
            </div>
          </div>
          <CardTitle className="text-3xl md:text-5xl font-bold font-headline leading-tight">
            {news.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-10 md:p-16 space-y-8">
          <div className="prose prose-lg max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
            {news.body}
          </div>

          <Separator className="my-12" />

          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-full h-10 px-6 gap-2" onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: news.title, url: window.location.href });
                }
              }}>
                <Share2 className="h-4 w-4" /> 共有する
              </Button>
            </div>
            <Button variant="ghost" className="rounded-xl" onClick={() => router.push('/news')}>
              一覧に戻る
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
