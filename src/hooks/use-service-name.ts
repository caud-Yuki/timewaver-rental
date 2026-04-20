'use client';

import { useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { useFirestore, useDoc } from '@/firebase';
import { GlobalSettings } from '@/types';

const DEFAULT_SERVICE_NAME = 'TimeWaverHub';

export function useServiceName(): string {
  const db = useFirestore();
  const settingsRef = useMemo(() => doc(db, 'settings', 'global'), [db]);
  const { data: settings } = useDoc<GlobalSettings>(settingsRef as any);
  return settings?.serviceName || DEFAULT_SERVICE_NAME;
}
