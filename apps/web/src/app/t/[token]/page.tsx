import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Menu, PublicTable } from '@messa/contracts';
import { hexToRgbTriplet } from '@/lib/format';
import { MenuView } from './menu-view';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function load(token: string): Promise<{ table: PublicTable; menu: Menu } | { gone: true } | null> {
  const res = await fetch(`${API}/public/tables/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (res.status === 410) return { gone: true };
  if (!res.ok) return null;
  const table = (await res.json()) as PublicTable;
  const menuRes = await fetch(`${API}/public/tables/${encodeURIComponent(token)}/menu`, { cache: 'no-store' });
  if (!menuRes.ok) return null;
  return { table, menu: (await menuRes.json()) as Menu };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await load(token);
  const name = data && 'table' in data ? data.table.tenant.name : 'Messa';
  return { title: `${name} · Cardápio`, robots: { index: false } };
}

/** F01 — cardápio SSR com branding do restaurante (RF-14). Solicitação/sessão entram na fase 2. */
export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();
  if ('gone' in data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">QR Code substituído</h1>
        <p className="text-sm text-neutral-500">Este QR Code não é mais válido. Peça o novo ao restaurante.</p>
      </main>
    );
  }
  const { table, menu } = data;
  return (
    <div style={{ '--brand': hexToRgbTriplet(table.tenant.primaryColor) } as React.CSSProperties}>
      <MenuView table={table} menu={menu} token={token} />
    </div>
  );
}
