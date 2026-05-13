'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, ChevronRight } from 'lucide-react';
import type { LandingCtas, LandingCtaButton } from '@/types';

export const DEFAULT_LANDING_CTAS: LandingCtas = {
  preBookingOn: {
    primary: { label: '先行予約に登録する', url: '/early-booking', enabled: true },
    secondary: { label: '', url: '', enabled: false },
  },
  preBookingOff: {
    primary: { label: '機器ラインナップを見る', url: '/devices', enabled: true },
    secondary: { label: '', url: '', enabled: false },
  },
};

function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function isValidButton(b?: LandingCtaButton): b is LandingCtaButton {
  return !!b && b.enabled && !!b.label?.trim() && !!b.url?.trim();
}

function CtaLink({ button, children }: { button: LandingCtaButton; children: React.ReactNode }) {
  if (isExternalUrl(button.url)) {
    return (
      <a href={button.url} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <Link href={button.url}>{children}</Link>;
}

interface Props {
  preBookingMode: boolean;
  landingCtas?: LandingCtas;
  variant?: 'hero' | 'final';
}

export function LandingCtaButtons({ preBookingMode, landingCtas, variant = 'hero' }: Props) {
  const ctas = landingCtas ?? DEFAULT_LANDING_CTAS;
  const config = preBookingMode ? ctas.preBookingOn : ctas.preBookingOff;

  const primaryVisible = isValidButton(config.primary);
  const secondaryVisible = isValidButton(config.secondary);

  if (!primaryVisible && !secondaryVisible) return null;

  const isFinal = variant === 'final';

  const primaryClass = isFinal
    ? 'bg-white text-primary hover:bg-white/90 font-bold h-14 px-10 rounded-2xl text-lg shadow-xl'
    : 'h-14 px-10 rounded-2xl font-bold text-lg shadow-lg';

  const secondaryClass = isFinal
    ? 'bg-transparent text-white border-2 border-white/70 hover:bg-white/10 hover:text-white font-bold h-14 px-10 rounded-2xl text-lg'
    : 'h-14 px-10 rounded-2xl font-bold text-lg border-2';

  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center items-center flex-wrap">
      {primaryVisible && (
        <CtaLink button={config.primary}>
          <Button size="lg" className={primaryClass}>
            {config.primary.label}
            {isFinal ? <ChevronRight className="ml-2 h-6 w-6" /> : <ArrowRight className="ml-2 h-5 w-5" />}
          </Button>
        </CtaLink>
      )}
      {secondaryVisible && (
        <CtaLink button={config.secondary}>
          <Button size="lg" variant={isFinal ? 'outline' : 'outline'} className={secondaryClass}>
            {config.secondary.label}
          </Button>
        </CtaLink>
      )}
    </div>
  );
}
