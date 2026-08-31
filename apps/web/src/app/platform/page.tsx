'use client';

import { useState, type FormEvent } from 'react';
import type { Tenant } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage, useApi } from '@/lib/use-api';
import { StaffShell } from '@/components/staff-shell';
import { Badge, Button, Card, ErrorText, Field, Input, PageTitle } from '@/components/ui';

const BILLING_LABEL: Record<Tenant['billing']['phase'], string> = { trial: 'Em teste', active: 'Ativa', past_due: 'Pendente', blocked: 'Bloqueada' };
const BILLING_TONE: Record<Tenant['billing']['phase'], 'neutral' | 'green' | 'red' | 'amber'> = { trial: 'neutral', active: 'green', past_due: 'amber', blocked: 'red' };

export default function PlatformPage() {
  const tenants = useApi<Tenant[]>('/platform/tenants');
  const [form, setForm] = useState({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/platform/tenants', { method: 'POST', body: form });
      setForm({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' });
      await tenants.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(t: Tenant, status: Tenant['status']) {
    await api(`/platform/tenants/${t.id}/status`, { method: 'PATCH', body: { status } });
    await tenants.reload();
  }

  return (
    <StaffShell title="Messa · Plataforma" platform nav={[{ href: '/platform', label: 'Restaurantes' }]}>
      <PageTitle>Restaurantes</PageTitle>
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <Card>
          {tenants.error && <ErrorText>{tenants.error}</ErrorText>}
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-2">Nome</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Assinatura</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tenants.data?.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="py-2 font-medium">{t.name}</td>
                  <td className="text-neutral-500">{t.slug}</td>
                  <td>
                    <Badge tone={t.status === 'active' ? 'green' : 'red'}>{t.status === 'active' ? 'Ativo' : 'Bloqueado'}</Badge>
                  </td>
                  <td>
                    <Badge tone={BILLING_TONE[t.billing.phase]}>{BILLING_LABEL[t.billing.phase]}</Badge>
                    {t.billing.daysLeft !== null && (t.billing.phase === 'trial' || t.billing.phase === 'past_due') && (
                      <span className="ml-1 text-xs text-neutral-500">{t.billing.daysLeft >= 0 ? `${t.billing.daysLeft}d` : `venceu há ${-t.billing.daysLeft}d`}</span>
                    )}
                  </td>
                  <td className="text-right">
                    {t.status === 'active' ? (
                      <Button variant="danger" onClick={() => setStatus(t, 'blocked')}>
                        Bloquear
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setStatus(t, 'active')}>
                        Desbloquear
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {tenants.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-neutral-500">
                    Nenhum restaurante ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Novo restaurante</h2>
          <form onSubmit={create} className="space-y-3">
            <Field label="Nome">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Slug" hint="letras minúsculas, números e hífen">
              <Input required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </Field>
            <Field label="Nome do administrador">
              <Input required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            </Field>
            <Field label="E-mail do administrador">
              <Input type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
            </Field>
            <Field label="Senha inicial">
              <Input type="password" required minLength={8} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" disabled={busy}>
              Criar restaurante
            </Button>
          </form>
        </Card>
      </div>
    </StaffShell>
  );
}
