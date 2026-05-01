'use client';

import { useCallback, useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp } from '@/firebase/provider';
import type { MailAccountProvider, MailAccountStatus } from '@/types';

export interface MailAccountRecord {
  id: string;
  displayName: string;
  email: string;
  provider: MailAccountProvider;
  status: MailAccountStatus;
  isDefault: boolean;
  fromName?: string;
  consecutiveFailures?: number;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateSmtpInput {
  displayName: string;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName?: string;
  setAsDefault?: boolean;
}

export interface UpdateSmtpInput extends Partial<CreateSmtpInput> {
  accountId: string;
}

export interface GmailOAuthStartResult {
  authUrl: string;
  accountId: string;
}

export function useMailAccounts() {
  const app = useFirebaseApp();
  const [accounts, setAccounts] = useState<MailAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable<unknown, { accounts: MailAccountRecord[] }>(
        getFunctions(app),
        'listMailAccounts'
      );
      const res = await fn({});
      setAccounts(res.data.accounts || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load mail accounts.');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createSmtp = useCallback(
    async (input: CreateSmtpInput) => {
      const fn = httpsCallable<CreateSmtpInput, { accountId: string }>(
        getFunctions(app),
        'createSmtpAccount'
      );
      const res = await fn(input);
      await refetch();
      return res.data;
    },
    [app, refetch]
  );

  const updateSmtp = useCallback(
    async (input: UpdateSmtpInput) => {
      const fn = httpsCallable<UpdateSmtpInput, { success: boolean }>(
        getFunctions(app),
        'updateSmtpAccount'
      );
      const res = await fn(input);
      await refetch();
      return res.data;
    },
    [app, refetch]
  );

  const remove = useCallback(
    async (accountId: string) => {
      const fn = httpsCallable<{ accountId: string }, { success: boolean }>(
        getFunctions(app),
        'deleteMailAccount'
      );
      const res = await fn({ accountId });
      await refetch();
      return res.data;
    },
    [app, refetch]
  );

  const setDefault = useCallback(
    async (accountId: string) => {
      const fn = httpsCallable<{ accountId: string }, { success: boolean }>(
        getFunctions(app),
        'setDefaultMailAccount'
      );
      const res = await fn({ accountId });
      await refetch();
      return res.data;
    },
    [app, refetch]
  );

  const test = useCallback(
    async (accountId: string, toEmail: string) => {
      const fn = httpsCallable<
        { accountId: string; toEmail: string },
        { success: boolean; provider: string }
      >(getFunctions(app), 'testMailAccount');
      const res = await fn({ accountId, toEmail });
      return res.data;
    },
    [app]
  );

  const startGmailOAuth = useCallback(
    async (params: { accountId?: string; displayName?: string }) => {
      const fn = httpsCallable<
        { accountId?: string; displayName?: string },
        GmailOAuthStartResult
      >(getFunctions(app), 'gmailOAuthStart');
      const res = await fn(params);
      return res.data;
    },
    [app]
  );

  const revokeGmail = useCallback(
    async (accountId: string) => {
      const fn = httpsCallable<{ accountId: string }, { success: boolean }>(
        getFunctions(app),
        'revokeGmailAuth'
      );
      const res = await fn({ accountId });
      await refetch();
      return res.data;
    },
    [app, refetch]
  );

  return {
    accounts,
    loading,
    error,
    refetch,
    createSmtp,
    updateSmtp,
    remove,
    setDefault,
    test,
    startGmailOAuth,
    revokeGmail,
  };
}
