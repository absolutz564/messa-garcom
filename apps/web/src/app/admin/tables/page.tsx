'use client';

import { useState, type FormEvent } from 'react';
import type { Table } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage, useApi } from '@/lib/use-api';
import { Badge, Button, Card, ErrorText, Input, PageTitle } from '@/components/ui';
import { useDialog } from '@/components/dialog';

export default function TablesPage() {
  const dialog = useDialog();
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

  function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  const slug = (t: Table) => t.displayName.replace(/\s+/g, '-').toLowerCase();
  async function download(t: Table, kind: 'card.png' | 'card.svg' | 'qr.png' | 'qr.svg') {
    await run(async () => saveBlob(await api<Blob>(`/admin/tables/${t.id}/${kind}`, { raw: true }), `${kind.startsWith('card') ? 'cartaz' : 'qr'}-${slug(t)}.${kind.split('.')[1]}`));
  }
  async function downloadAll() {
    await run(async () => saveBlob(await api<Blob>('/admin/tables/cards.pdf', { raw: true }), 'messa-qrcodes.pdf'));
  }

  return (
    <>
      <PageTitle actions={<Button variant="secondary" onClick={downloadAll} disabled={!tables.data?.some((t) => t.isActive)}>Baixar todos os cartazes (PDF)</Button>}>Mesas</PageTitle>
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
                  onClick={async () => {
                    const displayName = await dialog.prompt({ title: 'Renomear mesa', label: 'Identificação (o QR continua o mesmo)', initial: t.displayName, maxLength: 40, confirmLabel: 'Salvar' });
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
            <div className="space-y-2">
              <Button className="w-full" onClick={() => download(qr.table, 'card.png')}>
                Baixar cartaz para imprimir (PNG)
              </Button>
              <p className="text-xs text-neutral-500">Cartaz com o nome do restaurante, a mesa em destaque, o QR e o slogan — pronto para colar na mesa.</p>
              <div className="flex justify-center gap-2 text-xs">
                <button type="button" className="text-neutral-500 underline" onClick={() => download(qr.table, 'card.svg')}>
                  cartaz SVG
                </button>
                <button type="button" className="text-neutral-500 underline" onClick={() => download(qr.table, 'qr.png')}>
                  só o QR (PNG)
                </button>
                <button type="button" className="text-neutral-500 underline" onClick={() => download(qr.table, 'qr.svg')}>
                  só o QR (SVG)
                </button>
              </div>
            </div>
            <button
              className="mt-4 text-xs text-neutral-500 underline"
              onClick={async () =>
                (await dialog.confirm({ title: 'Gerar um novo QR Code?', body: 'O QR atual deixa de funcionar imediatamente. Use quando o adesivo foi extraviado ou fotografado por terceiros.', confirmLabel: 'Gerar novo QR', danger: true })) &&
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
