
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Activity, User, LogOut, Menu, ShieldCheck, LayoutDashboard, Package } from 'lucide-react';
import { useUser, useAuth, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { signOut } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserProfile } from '@/types';

export function Navbar() {
  const pathname = usePathname();
  const { user } = useUser();
  const auth = useAuth();
  const db = useFirestore();

  const profileRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile } = useDoc<UserProfile>(profileRef as any);

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Activity className="h-8 w-8 text-primary" />
          <span className="font-headline text-2xl font-bold tracking-tight text-primary">ChronoRent</span>
        </Link>
        
        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium">
          <Link href="/devices" className={`transition-colors hover:text-primary ${pathname === '/devices' ? 'text-primary' : ''}`}>機器一覧</Link>
          <Link href="/guide" className={`transition-colors hover:text-primary ${pathname === '/guide' ? 'text-primary' : ''}`}>ご利用の流れ</Link>
          <Link href="/introduction" className={`transition-colors hover:text-primary ${pathname === '/introduction' ? 'text-primary' : ''}`}>導入説明</Link>
        </nav>

        <div className="flex items-center space-x-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profile?.familyName} {profile?.givenName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {profile?.role === 'admin' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-bold">管理者ダッシュボード</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/mypage">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>マイページ</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/mypage/devices">
                    <Package className="mr-2 h-4 w-4" />
                    <span>マイデバイス</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>ログアウト</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/auth/login" className="hidden sm:inline-block">
                <Button variant="ghost">ログイン</Button>
              </Link>
              <Link href="/auth/register">
                <Button>新規登録</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
