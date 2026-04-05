
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { useCollection } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User, Send, Loader2, Sparkles } from 'lucide-react';
import { askChatbot } from '@/ai/flows/ai-support-chatbot';
import { useServiceName } from '@/hooks/use-service-name';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'bot';
  content: string;
}

export default function AISupportPage() {
  const { user } = useUser();
  const serviceName = useServiceName();
  const db = useFirestore();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: `こんにちは！${serviceName} AIコンシェルジュです。TimeWaverの操作方法やレンタル手続きについて何でもお尋ねください。` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user's applications client-side (where auth context exists)
  const applicationsQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, 'applications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
  }, [db, user?.uid]);
  const { data: userApps } = useCollection<any>(applicationsQuery);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Pass user's applications from client (server action has no auth context)
      const userApplications = userApps?.map(app => ({
        deviceType: app.deviceType || '',
        status: app.status || '',
        createdAt: app.createdAt?.toDate ? app.createdAt.toDate().toLocaleDateString() : '不明',
      }));

      const response = await askChatbot({
        query: userMessage,
        userId: user?.uid,
        serviceName,
        userApplications,
      });
      setMessages(prev => [...prev, { role: 'bot', content: response.answer }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', content: '申し訳ありません。エラーが発生しました。しばらくしてから再度お試しいただくか、サポート窓口までご連絡ください。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-8 text-center space-y-2">
        <h1 className="text-3xl font-bold font-headline flex items-center justify-center gap-2">
          <Bot className="h-8 w-8 text-primary" /> AIサポートコンシェルジュ
        </h1>
        <p className="text-muted-foreground">TimeWaverの活用方法や手続きについて24時間いつでも相談可能です</p>
      </div>

      <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white flex flex-col h-[600px]">
        <CardHeader className="bg-primary/5 border-b py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center shadow-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{serviceName} AI</CardTitle>
              <CardDescription className="text-[10px] flex items-center gap-1">
                <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" /> オンライン・即時回答
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <Avatar className={`h-8 w-8 ${msg.role === 'bot' ? 'bg-primary shadow-sm' : 'bg-secondary'}`}>
                    <AvatarFallback className="text-[10px] text-white">
                      {msg.role === 'bot' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4 text-primary" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.role === 'bot'
                      ? 'bg-secondary/30 rounded-tl-none'
                      : 'bg-primary text-white rounded-tr-none'
                  }`}>
                    {msg.role === 'bot' ? (
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1">{children}</ol>,
                          li: ({ children }) => <li>{children}</li>,
                          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                          a: ({ href, children }) => <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                          h3: ({ children }) => <h3 className="font-bold text-base mt-2 mb-1">{children}</h3>,
                          h4: ({ children }) => <h4 className="font-bold mt-2 mb-1">{children}</h4>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8 bg-primary shadow-sm">
                    <AvatarFallback className="text-white"><Bot className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <div className="bg-secondary/30 p-4 rounded-2xl rounded-tl-none shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 bg-secondary/10 border-t">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex gap-2"
            >
              <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="TimeWaverの初期設定について教えて..."
                className="rounded-xl border-none shadow-inner bg-white h-12"
                disabled={isLoading}
              />
              <Button type="submit" size="icon" className="h-12 w-12 rounded-xl shadow-lg" disabled={isLoading || !input.trim()}>
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          "レンタルの流れは？",
          "デバイスの選び方",
          "自分の申請状況を確認"
        ].map((q) => (
          <Button 
            key={q} 
            variant="outline" 
            className="rounded-xl text-xs h-10 bg-white/50 hover:bg-white"
            onClick={() => setInput(q)}
          >
            {q}
          </Button>
        ))}
      </div>
    </div>
  );
}
