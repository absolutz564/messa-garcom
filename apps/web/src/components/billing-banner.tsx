'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ptBR, type BillingStatus, type LoginResponse } from '@messa/contracts';
import { api } from '@/lib/api';

/** Espelha RULES.BILLING_GRACE_DAYS (@messa/domain) — só para o texto do aviso; o bloqueio de verdade é sempre no backend. */
const BILLING_GRACE_DAYS = 3;

const TONE: Record<'trial' | 'past_due' | 'blocked', string> = {
  trial: 'bg-neutral-100 text-neutral-700',
  past_due: 'bg-amber-50 text-amber-900',
  blocked: 'bg-red-50 text-red-900',
};

/** BR-20 — aviso de assinatura no painel de staff. Silencioso enquanto `active`. */
export function BillingBanner({ session }: { session: LoginResponse }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    if (!session.activeTenant) return;
    let cancelled = false;
    api<BillingStatus>('/admin/billing')
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.activeTenant]);

  if (!status || status.phase === 'active') return null;
  // Trial só vira aviso perto do fim, para não incomodar os 14 dias inteiros.
  if (status.phase === 'trial' && (status.daysLeft === null || status.daysLeft > 5)) return null;

  const text =
    status.phase === 'trial'
      ? ptBR.staff.billing.trialBanner.replace('{days}', String(Math.max(0, status.daysLeft ?? 0)))
      : status.phase === 'past_due'
        ? ptBR.staff.billing.pastDueBanner.replace('{days}', String(Math.max(0, BILLING_GRACE_DAYS + (status.daysLeft ?? 0))))
        : ptBR.staff.billing.blockedBanner;

  return (
    <div className={`border-b px-4 py-2 text-center text-sm ${TONE[status.phase as 'trial' | 'past_due' | 'blocked']}`}>
      {text}
      {session.activeTenant?.role === 'admin' && (
        <Link href="/admin/assinatura" className="ml-2 font-medium underline">
          {ptBR.staff.billing.cta}
        </Link>
      )}
    </div>
  );
}
