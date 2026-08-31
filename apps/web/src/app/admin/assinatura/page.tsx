'use client';

import { useEffect, useRef, useState } from 'react';
import { ptBR, type BillingPlanKey, type BillingStatus, type PixCharge } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage, useApi } from '@/lib/use-api';
import { money } from '@/lib/format';
import { Badge, Button, Card, ErrorText, PageTitle } from '@/components/ui';

const PLAN_KEYS: BillingPlanKey[] = ['monthly', 'semiannual', 'annual'];
const STATUS_TONE: Record<BillingStatus['phase'], 'neutral' | 'green' | 'red' | 'amber'> = { trial: 'neutral', active: 'green', past_due: 'amber', blocked: 'red' };

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}

export default function AssinaturaPage() {
  const status = useApi<BillingStatus>('/admin/billing');
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status.data?.pendingCharge) setCharge(status.data.pendingCharge);
  }, [status.data]);

  // Confirmação por polling (BR-20/ADR-006) enquanto a cobrança está pendente.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!charge || charge.status !== 'pending') return;
    pollRef.current = setInterval(async () => {
      try {
        const updated = await api<PixCharge>(`/admin/billing/pix/${charge.id}`);
        setCharge(updated);
        if (updated.status === 'paid') await status.reload();
      } catch {
        // tenta de novo no próximo tick
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge?.id, charge?.status]);

  async function choosePlan(plan: BillingPlanKey) {
    setBusy(true);
    setError(null);
    try {
      await api('/admin/billing/plan', { method: 'POST', body: { plan } });
      await status.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateCharge() {
    setBusy(true);
    setError(null);
    try {
      setCharge(await api<PixCharge>('/admin/billing/pix', { method: 'POST' }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!charge) return;
    await navigator.clipboard.writeText(charge.qrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (!status.data) {
    return (
      <>
        <PageTitle>{ptBR.billing.title}</PageTitle>
        {status.error && <ErrorText>{status.error}</ErrorText>}
      </>
    );
  }

  const s = status.data;
  const statusLabel =
    s.phase === 'trial'
      ? ptBR.billing.status.trial.replace('{days}', String(s.daysLeft ?? 0))
      : s.phase === 'past_due'
        ? ptBR.billing.status.pastDue.replace('{date}', fmtDate(s.subscriptionEndsAt))
        : s.phase === 'blocked'
          ? ptBR.billing.status.blocked
          : ptBR.billing.status.active.replace('{date}', fmtDate(s.subscriptionEndsAt));

  return (
    <>
      <PageTitle>{ptBR.billing.title}</PageTitle>
      <div className="max-w-lg space-y-4">
        <Card>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[s.phase]}>{{ trial: 'Em teste', active: 'Ativa', past_due: 'Pendente', blocked: 'Bloqueada' }[s.phase]}</Badge>
            <p className="text-sm text-neutral-700">{statusLabel}</p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">{ptBR.billing.choosePlan}</h2>
          <div className="space-y-2">
            {PLAN_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => choosePlan(key)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${s.plan === key ? 'border-brand bg-brand/5 font-medium' : 'border-neutral-200 hover:bg-neutral-50'}`}
              >
                {ptBR.billing.plan[key]}
                {s.plan === key && <span className="ml-2 text-xs text-brand">(atual)</span>}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Pagar por Pix</h2>
          {charge?.status === 'paid' ? (
            <p className="text-sm text-green-700">{ptBR.billing.pix.confirmed.replace('{date}', fmtDate(s.subscriptionEndsAt))}</p>
          ) : charge?.status === 'pending' ? (
            <div className="space-y-3">
              {charge.qrCodeBase64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:image/png;base64,${charge.qrCodeBase64}`} alt="QR Code Pix" className="mx-auto h-48 w-48" />
              )}
              <p className="text-center text-sm font-medium">{money(charge.amountCents)}</p>
              <Button variant="secondary" className="w-full" onClick={copyCode}>
                {copied ? ptBR.billing.pix.copied : ptBR.billing.pix.copy}
              </Button>
              <p className="text-center text-xs text-neutral-500">{ptBR.billing.pix.waiting}</p>
            </div>
          ) : (
            <>
              {charge?.status === 'expired' && <p className="mb-2 text-sm text-amber-700">{ptBR.billing.pix.expired}</p>}
              <Button onClick={generateCharge} disabled={busy}>
                {ptBR.billing.pix.generate}
              </Button>
            </>
          )}
          <ErrorText>{error}</ErrorText>
          <p className="mt-3 text-xs text-neutral-500">{ptBR.billing.pix.disclaimer}</p>
        </Card>
      </div>
    </>
  );
}
