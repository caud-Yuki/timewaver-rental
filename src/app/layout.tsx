
import type { Metadata } from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';
import { Navbar } from '@/components/navbar';

export const metadata: Metadata = {
  title: 'ChronoRent | TimeWaver Rental Platform',
  description: 'The premier platform for TimeWaver medical device rentals.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground flex flex-col min-h-screen">
        <FirebaseClientProvider>
          <Navbar />
          <main className="flex-1">
            {children}
          </main>
          <Toaster />
          {/* Footer */}
          <footer className="border-t bg-background py-12 mt-auto">
            <div className="container mx-auto px-4 grid gap-8 md:grid-cols-4">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="font-headline text-xl font-bold text-primary tracking-tight">ChronoRent</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  次世代のエネルギー医学を、すべての人へ。
                </p>
              </div>
              <div>
                <h4 className="font-headline font-bold mb-4">プラットフォーム</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/devices" className="hover:text-primary transition-colors">レンタル機器一覧</Link></li>
                  <li><Link href="/guide" className="hover:text-primary transition-colors">ご利用の流れ</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-headline font-bold mb-4">マイページ</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/mypage/devices" className="hover:text-primary transition-colors">マイデバイス</Link></li>
                  <li><Link href="/mypage/support/ai" className="hover:text-primary transition-colors">AIサポート</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-headline font-bold mb-4">サポート</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="/terms" className="hover:text-primary transition-colors">利用規約</Link></li>
                  <li><Link href="/privacy" className="hover:text-primary transition-colors">プライバシーポリシー</Link></li>
                </ul>
              </div>
            </div>
            <div className="container mx-auto px-4 mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} ChronoRent. All rights reserved.
            </div>
          </footer>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}

import Link from 'next/link';
