'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Newspaper, Loader2 } from 'lucide-react';
import { News, newsConverter } from '../../../types';
import { Timestamp } from 'firebase/firestore';

const NewsForm = ({ article, onSave, onCancel }: { article?: Partial<News>, onSave: (n: Partial<News>) => void, onCancel: () => void }) => {
  const [currentArticle, setCurrentArticle] = useState<Partial<News>>(article || { title: '', content: '', status: 'draft' });

  const handleChange = (field: keyof News, value: any) => {
    setCurrentArticle(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!currentArticle.title || !currentArticle.content) return;
    onSave(currentArticle);
  };
  
  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{article?.id ? 'Edit News Article' : 'Create New Article'}</DialogTitle>
        <DialogDescription>Fill in the details for the news article.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={currentArticle.title || ''} onChange={(e) => handleChange('title', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
           <Select value={currentArticle.status} onValueChange={(v: 'draft' | 'published') => handleChange('status', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="content">Content</Label>
          <Textarea id="content" value={currentArticle.content || ''} onChange={(e) => handleChange('content', e.target.value)} className="min-h-[250px]" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default function NewsPage() {
  const db = useFirestore();
  const newsQuery = useMemo(() => query(collection(db, 'news'), orderBy('createdAt', 'desc')).withConverter(newsConverter), [db]);
  const { data: news, loading, error } = useCollection<News>(newsQuery as any);
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<News | undefined>(undefined);

  const handleSave = async (articleData: Partial<News>) => {
    try {
      const dataToSave = {
        ...articleData,
        updatedAt: serverTimestamp(),
        isPublic: articleData.status === 'published',
        publishedAt: articleData.status === 'published' && !articleData.publishedAt ? serverTimestamp() : articleData.publishedAt
      };

      if (articleData.id) {
        const { id, ...updateData } = dataToSave;
        await updateDoc(doc(db, 'news', articleData.id), updateData);
        toast({ title: "Success", description: "News article updated." });
      } else {
        await addDoc(collection(db, 'news'), { ...dataToSave, createdAt: serverTimestamp() });
        toast({ title: "Success", description: "News article created." });
      }
      setIsFormOpen(false);
      setSelectedArticle(undefined);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "An error occurred while saving the article." });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this article?")) {
      try {
        await deleteDoc(doc(db, 'news', id));
        toast({ title: "Success", description: "News article deleted." });
      } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "An error occurred while deleting the article." });
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Newspaper className="h-8 w-8 text-primary" /> News & Announcements
          </h1>
          <p className="text-muted-foreground">Manage public announcements and news articles.</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl" onClick={() => setSelectedArticle(undefined)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Create New Article
            </Button>
          </DialogTrigger>
          <NewsForm onSave={handleSave} onCancel={() => setIsFormOpen(false)} article={selectedArticle} />
        </Dialog>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5">Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published Date</TableHead>
                <TableHead className="text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={4} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>}
              {!loading && news?.map((article) => (
                <TableRow key={article.id}>
                  <TableCell className="pl-8 font-medium">{article.title}</TableCell>
                  <TableCell>
                     <span className={`px-2 py-1 text-xs rounded-full ${article.status === 'published' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                      {article.status}
                    </span>
                  </TableCell>
                  <TableCell>{article.publishedAt?.toDate().toLocaleDateString() || '-'}</TableCell>
                  <TableCell className="text-right pr-8 space-x-1">
                    <Dialog open={isFormOpen && selectedArticle?.id === article.id} onOpenChange={(isOpen) => !isOpen && setSelectedArticle(undefined)}>
                      <DialogTrigger asChild>
                         <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setSelectedArticle(article); setIsFormOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <NewsForm article={selectedArticle} onSave={handleSave} onCancel={() => { setIsFormOpen(false); setSelectedArticle(undefined); }} />
                    </Dialog>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDelete(article.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
