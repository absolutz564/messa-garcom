'use client';

import { useState, type FormEvent } from 'react';
import type { Table } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage, useApi } from '@/lib/use-api';
import { Badge, Button, Card, ErrorText, Input, PageTitle } from '@/components/ui';

export default function TablesPage() {
  const tables = useApi<Table[]>('/admin/tables');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ table: Table; svg: string } | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('/admin/tables', { method: 'POST', body: { displayName: name } });
      setName('');
      await tables.reload();
    });
  }

  async function showQr(t: Table) {
    await run(async () => {
      const blob = await api<Blob>(`/admin/tables/${t.id}/qr.svg`, { raw: true });
      setQr({ table: t, svg: await blob.text() });
    });
  }

  async function download(t: Table, ext: 'svg' | 'png') {
    await run(async () => {
      const blob = await api<Blob>(`/admin/tables/${t.id}/qr.${ext}`, { raw: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${t.displayName.replace(/\s+/g, '-').toLowerCase()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <>
      <PageTitle>Mesas</PageTitle>
      <ErrorText>{error ?? tables.error}</ErrorText>
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <Card>
          <form onSubmit={create} className="mb-4 flex gap-2">
            <Input placeholder="Identificação (ex.: Mesa 38, VIP 01, Varanda 03)" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit">Criar mesa</Button>
          </form>
          <ul className="divide-y divide-neutral-100">
            {tables.data?.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.displayName}</span>
                    {!t.isActive && <Badge tone="red">Desativada</Badge>}
                  </div>
                  <p className="truncate text-xs text-neutral-500">{t.qrUrl}</p>
                </div>
                <Button variant="ghost" onClick={() => showQr(t)}>
                  QR
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const displayName = window.prompt('Nova identificação da mesa (o QR continua o mesmo)', t.displayName);
                    if (displayName && displayName !== t.displayName) void run(() => api(`/admin/tables/${t.id}`, { method: 'PATCH', body: { displayName } }).then(tables.reload));
                  }}
                >
                  Renomear
                </Button>
                <Button variant="ghost" onClick={() => run(() => api(`/admin/tables/${t.id}`, { method: 'PATCH', body: { isActive: !t.isActive } }).then(tables.reload))}>
                  {t.isActive ? 'Desativar' : 'Ativar'}
                </Button>
              </li>
            ))}
            {tables.data?.length === 0 && <li className="py-6 text-center text-sm text-neutral-400">Nenhuma mesa cadastrada.</li>}
          </ul>
        </Card>

        {qr && (
          <Card className="h-fit text-center md:sticky md:top-6">
            <h2 className="text-lg font-semibold">{qr.table.displayName}</h2>
            <div className="mx-auto my-3 w-56 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p className="mb-3 break-all text-xs text-neutral-500">{qr.table.qrUrl}</p>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" onClick={() => download(qr.table, 'png')}>
                Baixar PNG
              </Button>
              <Button variant="secondary" onClick={() => download(qr.table, 'svg')}>
                Baixar SVG
              </Button>
            </div>
            <button
              className="mt-4 text-xs text-neutral-500 underline"
              onClick={() =>
                window.confirm('Gerar um novo QR Code? O QR atual deixará de funcionar imediatamente.') &&
                run(async () => {
                  const t = await api<Table>(`/admin/tables/${qr.table.id}/rotate-token`, { method: 'POST' });
                  await tables.reload();
                  await showQr(t);
                })
              }
            >
              QR extraviado? Gerar novo e invalidar o atual
            </button>
          </Card>
        )}
      </div>
    </>
  );
}
