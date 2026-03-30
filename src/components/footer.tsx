'use client';

import Link from 'next/link';
import { useServiceName } from '@/hooks/use-service-name';

export function Footer() {
  const serviceName = useServiceName();

  return (
    <footer className="border-t bg-background py-12 mt-auto">
      <div className="container mx-auto px-4 grid gap-8 md:grid-cols-4">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <span className="font-headline text-xl font-bold text-primary tracking-tight">{serviceName}</span>
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
        &copy; {new Date().getFullYear()} {serviceName}. All rights reserved.
      </div>
    </footer>
  );
}
