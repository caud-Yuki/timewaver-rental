
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth, useFirestore } from '@/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Activity, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const auth = useAuth();
  const db = useFirestore();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'ログインエラー',
        description: 'メールアドレスまたはパスワードが正しくありません。',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth || !db) {
      toast({
        variant: 'destructive',
        title: '初期化エラー',
        description: 'Firebaseの接続を待機しています。数秒後に再度お試しください。',
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection to avoid auto-login issues during testing
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if profile exists, create if not
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        const names = user.displayName?.split(' ') || ['User', ''];
        const profileData = {
          uid: user.uid,
          familyName: names[names.length - 1] || '',
          givenName: names[0] || 'User',
          email: user.email || '',
          role: 'user',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(userDocRef, profileData);
      }

      toast({
        title: "ログイン成功",
        description: `${user.displayName || user.email} としてログインしました。`,
      });
      
      router.push('/');
    } catch (error: any) {
      console.error("Google Auth Error:", error);
      
      let errorMessage = 'Googleアカウントでのログインに失敗しました。';
      
      if (error.code === 'auth/popup-blocked') {
        errorMessage = 'ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。';
      } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'ログインがキャンセルされました。';
      } else if (error.code === 'auth/unauthorized-domain') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : '現在のドメイン';
        errorMessage = `このドメイン（${domain}）は承認されていません。FirebaseコンソールのAuthentication設定で「承認済みドメイン」にこのドメインを追加してください。`;
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Googleログインが有効になっていません。FirebaseコンソールでGoogleプロバイダーを有効にしてください。';
      }

      toast({
        variant: 'destructive',
        title: 'Googleログインエラー',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-20 flex justify-center items-center min-h-[calc(100vh-160px)]">
      <Card className="w-full max-w-md border-none shadow-2xl rounded-3xl overflow-hidden">
        <CardHeader className="space-y-1 bg-primary/5 text-center pb-8 pt-10">
          <div className="flex justify-center mb-4">
            <Activity className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-3xl font-headline font-bold">おかえりなさい</CardTitle>
          <CardDescription>
            メールアドレスとパスワードでログインしてください
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 pt-10">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  className="pl-10 h-11 rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">パスワード</Label>
                <Link href="#" className="text-xs text-primary hover:underline">
                  パスワードを忘れた場合
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  className="pl-10 h-11 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl text-lg font-bold shadow-lg" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ログイン'}
            </Button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">または</span>
            </div>
          </div>

          <Button variant="outline" className="w-full h-12 rounded-xl border-secondary" onClick={handleGoogleLogin} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            Googleでログイン
          </Button>

          {typeof window !== 'undefined' && (
            <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[10px] text-amber-800 leading-normal">
                Googleログインに失敗する場合は、Firebaseコンソールの「承認済みドメイン」に以下を追加してください：<br/>
                <code className="font-bold bg-amber-100 px-1 rounded">{window.location.hostname}</code>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="bg-secondary/20 p-6 flex justify-center">
          <p className="text-sm text-muted-foreground">
            アカウントをお持ちでないですか？{' '}
            <Link href="/auth/register" className="text-primary font-bold hover:underline">
              新規登録
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
