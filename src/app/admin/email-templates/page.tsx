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
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Mail, Loader2 } from 'lucide-react';
import { EmailTemplate } from '@/types';

const EmailTemplateForm = ({ template, onSave, onCancel }: { template?: Partial<EmailTemplate>, onSave: (t: Partial<EmailTemplate>) => void, onCancel: () => void }) => {
  const [currentTemplate, setCurrentTemplate] = useState<Partial<EmailTemplate>>(template || { name: '', subject: '', body: '', type: '' });

  const handleChange = (field: keyof EmailTemplate, value: string) => {
    setCurrentTemplate(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!currentTemplate.name || !currentTemplate.subject || !currentTemplate.body || !currentTemplate.type) return;
    onSave(currentTemplate);
  };
  
  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{template?.id ? 'Edit Email Template' : 'Create New Email Template'}</DialogTitle>
        <DialogDescription>Fill in the details for the email template. You can use placeholders like {{userName}}.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="type" className="text-right">Template Type</Label>
          <Input id="type" value={currentTemplate.type || ''} onChange={(e) => handleChange('type', e.target.value)} className="col-span-3" placeholder="e.g., application-approved" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="name" className="text-right">Template Name</Label>
          <Input id="name" value={currentTemplate.name || ''} onChange={(e) => handleChange('name', e.target.value)} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="subject" className="text-right">Subject</Label>
          <Input id="subject" value={currentTemplate.subject || ''} onChange={(e) => handleChange('subject', e.target.value)} className="col-span-3" />
        </div>
        <div className="grid grid-cols-1 gap-4">
          <Label htmlFor="body">Body</Label>
          <Textarea id="body" value={currentTemplate.body || ''} onChange={(e) => handleChange('body', e.target.value)} className="min-h-[200px]" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default function EmailTemplatesPage() {
  const db = useFirestore();
  const templatesQuery = useMemo(() => query(collection(db, 'emailTemplates'), orderBy('createdAt', 'desc')), [db]);
  const { data: templates, loading, error } = useCollection<EmailTemplate>(templatesQuery);
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | undefined>(undefined);

  const handleSave = async (templateData: Partial<EmailTemplate>) => {
    try {
      if (templateData.id) {
        const { id, ...dataToUpdate } = templateData;
        await updateDoc(doc(db, 'emailTemplates', id), { ...dataToUpdate, updatedAt: serverTimestamp() });
        toast({ title: "Success", description: "Email template updated." });
      } else {
        await addDoc(collection(db, 'emailTemplates'), { ...templateData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast({ title: "Success", description: "Email template created." });
      }
      setIsFormOpen(false);
      setSelectedTemplate(undefined);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "An error occurred while saving the template." });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this template?")) {
      try {
        await deleteDoc(doc(db, 'emailTemplates', id));
        toast({ title: "Success", description: "Email template deleted." });
      } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "An error occurred while deleting the template." });
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
            <Mail className="h-8 w-8 text-primary" /> Email Template Management
          </h1>
          <p className="text-muted-foreground">Create and manage automated email templates.</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl" onClick={() => setSelectedTemplate(undefined)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Create New Template
            </Button>
          </DialogTrigger>
          <EmailTemplateForm onSave={handleSave} onCancel={() => setIsFormOpen(false)} template={selectedTemplate} />
        </Dialog>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="pl-8 py-5">Template Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>}
              {!loading && templates?.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="pl-8 font-medium">{template.name}</TableCell>
                  <TableCell><code className="bg-muted px-2 py-1 rounded-md text-sm">{template.type}</code></TableCell>
                  <TableCell>{template.subject}</TableCell>
                  <TableCell>{template.updatedAt?.toDate().toLocaleDateString()}</TableCell>
                  <TableCell className="text-right pr-8 space-x-1">
                    <Dialog open={isFormOpen && selectedTemplate?.id === template.id} onOpenChange={(isOpen) => !isOpen && setSelectedTemplate(undefined)}>
                      <DialogTrigger asChild>
                         <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setSelectedTemplate(template); setIsFormOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <EmailTemplateForm template={selectedTemplate} onSave={handleSave} onCancel={() => { setIsFormOpen(false); setSelectedTemplate(undefined); }} />
                    </Dialog>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => handleDelete(template.id)}>
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
