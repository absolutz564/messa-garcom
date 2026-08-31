'use client';

import { useState, type FormEvent } from 'react';
import type { Member, Role } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage, useApi } from '@/lib/use-api';
import { Badge, Button, Card, ErrorText, Field, Input, ListRow, PageTitle, Select } from '@/components/ui';

const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', operator: 'Operador / Caixa', waiter: 'Garçom' };

export default function TeamPage() {
  const members = useApi<Member[]>('/admin/members');
  const [form, setForm] = useState({ name: '', email: '', role: 'waiter' as Role });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const r = await api<Member & { inviteUrl: string; emailSent: boolean }>('/admin/members/invite', { method: 'POST', body: form });
      setInviteUrl(r.inviteUrl || null);
      setEmailSent(r.emailSent);
      setForm({ name: '', email: '', role: 'waiter' });
      await members.reload();
    });
  }

  return (
    <>
      <PageTitle>Equipe</PageTitle>
      <ErrorText>{error ?? members.error}</ErrorText>
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <Card>
          <ul className="divide-y divide-neutral-100">
            {members.data?.map((m) => (
              <ListRow
                key={m.id}
                actions={
                  <>
                    {/* O seletor de papel ocupa a linha toda no celular; largura fixa só a partir de sm. */}
                    <div className="w-full sm:w-44">
                      <Select value={m.role} onChange={(e) => run(() => api(`/admin/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }).then(members.reload))}>
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button variant="ghost" className="shrink-0" title="Desconecta todos os celulares deste funcionário" onClick={() => run(() => api(`/admin/members/${m.id}/revoke-devices`, { method: 'POST' }))}>
                      Desconectar
                    </Button>
                    <Button variant={m.status === 'disabled' ? 'secondary' : 'danger'} className="shrink-0" onClick={() => run(() => api(`/admin/members/${m.id}`, { method: 'PATCH', body: { status: m.status === 'disabled' ? 'active' : 'disabled' } }).then(members.reload))}>
                      {m.status === 'disabled' ? 'Reativar' : 'Desativar'}
                    </Button>
                  </>
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{m.name}</span>
                    <Badge tone={m.status === 'active' ? 'green' : m.status === 'invited' ? 'amber' : 'red'}>
                      {m.status === 'active' ? 'Ativo' : m.status === 'invited' ? 'Convite pendente' : 'Desativado'}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-neutral-500">{m.email}</p>
                </div>
              </ListRow>
            ))}
          </ul>
        </Card>
        <Card className="h-fit">
          <h2 className="mb-3 font-semibold">Convidar funcionário</h2>
          <form onSubmit={invite} className="space-y-3">
            <Field label="Nome">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Papel">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" className="w-full">
              Convidar
            </Button>
          </form>
          {inviteUrl && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <p className="mb-1 font-medium">{emailSent ? 'Convite enviado por e-mail. Se preferir, envie também este link (válido por 7 dias):' : 'Envie este link ao funcionário (válido por 7 dias):'}</p>
              <p className="break-all select-all">{inviteUrl}</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
