
"use client";

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { askChatbot } from '@/ai/flows/ai-support-chatbot';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export default function AISupportPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'こんにちは！ChronoRentのAIサポートです。TimeWaverのレンタル手続きやプラットフォームの使い方について何かお手伝いできることはありますか？',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await askChatbot({ query: input });
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '申し訳ありません。エラーが発生しました。しばらくしてから再度お試しいただくか、管理者へお問い合わせください。',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl h-[calc(100vh-120px)] flex flex-col">
      <Card className="flex-1 flex flex-col border-none shadow-xl bg-white/80 backdrop-blur-sm rounded-3xl overflow-hidden">
        <CardHeader className="border-b bg-primary/5 flex flex-row items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="font-headline text-xl">AI コンシェルジュ</CardTitle>
            <CardDescription>レンタル手続きや操作方法を24時間サポートします</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full p-6" ref={scrollRef}>
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar className={`h-8 w-8 ${message.role === 'assistant' ? 'bg-primary' : 'bg-muted'}`}>
                    {message.role === 'assistant' ? (
                      <Bot className="h-5 w-5 text-white" />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                    <AvatarFallback>{message.role === 'assistant' ? 'AI' : 'U'}</AvatarFallback>
                  </Avatar>
                  <div
                    className={`max-w-[80%] rounded-2xl p-4 text-sm shadow-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-white rounded-tr-none'
                        : 'bg-white border text-foreground rounded-tl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    <span className={`text-[10px] mt-2 block opacity-50 ${message.role === 'user' ? 'text-right' : ''}`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 bg-primary">
                    <Bot className="h-5 w-5 text-white" />
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                  <div className="bg-white border rounded-2xl rounded-tl-none p-4 shadow-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="p-4 border-t bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="TimeWaverの返却方法について教えてください..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="rounded-xl border-secondary h-12 bg-secondary/10 focus-visible:ring-primary shadow-inner"
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !input.trim()} className="h-12 w-12 rounded-xl shadow-lg">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </form>
          <p className="text-[10px] text-center text-muted-foreground mt-2">
            AIの回答は常に正確とは限りません。重要な手続きについては公式ガイドも併せてご確認ください。
          </p>
        </div>
      </Card>
    </div>
  );
}
