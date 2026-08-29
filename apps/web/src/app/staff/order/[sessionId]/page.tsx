'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ptBR, type Category, type CreateOrderResult, type Product, type ServiceArea, type StaffSession } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { money } from '@/lib/format';
import { newIdempotencyKey, useCart } from '@/lib/cart';
import { StaffShell } from '@/components/staff-shell';
import { Button, ErrorText } from '@/components/ui';

/**
 * F08 — garçom monta e envia pedido para a sessão. Mesmo endpoint/domínio do cliente (princípio 7);
 * a diferença é a credencial e a ausência de confirmação em sessão inativa (PDR-002).
 */
export default function StaffOrderPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const cart = useCart(`messa_staff_cart_${sessionId}`);

  useEffect(() => {
    Promise.all([api<StaffSession>(`/staff/sessions/${sessionId}`), api<Category[]>('/admin/categories'), api<Product[]>('/admin/products'), api<ServiceArea[]>('/admin/service-areas')])
      .then(([s, c, p, a]) => {
        setSession(s);
        setCategories(c.filter((x) => x.isActive));
        setProducts(p);
        setAreas(a);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [sessionId]);

  const openAreas = useMemo(() => new Set(areas.filter((a) => a.isOpen).map((a) => a.id)), [areas]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, search]);

  async function send() {
    if (cart.lines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api<CreateOrderResult>(`/staff/sessions/${sessionId}/orders`, {
        method: 'POST',
        body: { items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, notes: l.notes.trim() || null })) },
        headers: { 'idempotency-key': newIdempotencyKey() },
      });
      cart.clear();
      router.push('/staff');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StaffShell title="Messa · Equipe" nav={[{ href: '/staff', label: 'Mesas' }]} require={['operator', 'waiter']}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link href="/staff" className="text-sm text-neutral-500 underline">
            ← Mesas
          </Link>
          <h1 className="text-xl font-semibold">{session ? `Pedido · ${session.table.displayName}` : 'Pedido'}</h1>
          {session && (
            <p className="text-xs text-neutral-500">
              PIN {session.pin} · {session.participantsCount} pessoas · {session.ordersCount} pedidos ({money(session.totalCents)})
              {session.status === 'inactive' && <span className="ml-1 text-red-700">· sessão inativa (será reativada ao enviar)</span>}
            </p>
          )}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="grid gap-6 md:grid-cols-[1fr_340px]">
        <div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto…" className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          {categories.map((c) => {
            const items = visible.filter((p) => p.categoryId === c.id);
            if (items.length === 0) return null;
            return (
              <section key={c.id} className="mb-4">
                <h2 className="mb-1 text-sm font-semibold uppercase text-neutral-500">{c.name}</h2>
                <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
                  {items.map((p) => {
                    const blocked = !p.isAvailable || !openAreas.has(p.serviceAreaId);
                    const qty = cart.qty(p.id);
                    return (
                      <li key={p.id} className={`flex items-center gap-3 px-3 py-2 ${blocked ? 'opacity-50' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 text-sm text-neutral-500">{money(p.priceCents)}</span>
                          {blocked && <span className="ml-2 text-xs text-red-700">{!p.isAvailable ? ptBR.product.unavailable : ptBR.product.areaClosed[p.serviceAreaKey]}</span>}
                        </div>
                        {!blocked && (
                          <div className="flex items-center gap-1">
                            {qty > 0 && (
                              <>
                                <Button variant="secondary" onClick={() => cart.remove(p.id)}>
                                  −
                                </Button>
                                <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                              </>
                            )}
                            <Button onClick={() => cart.add(p)}>+</Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="h-fit rounded-xl border border-neutral-200 bg-white p-4 md:sticky md:top-6">
          <h2 className="mb-2 font-semibold">{ptBR.order.cart}</h2>
          {cart.lines.length === 0 && <p className="text-sm text-neutral-400">Nenhum item.</p>}
          <ul className="space-y-2">
            {cart.lines.map((l) => (
              <li key={l.productId} className="text-sm">
                <div className="flex justify-between">
                  <span>
                    {l.quantity}× {l.name}
                  </span>
                  <span>{money(l.priceCents * l.quantity)}</span>
                </div>
                <input value={l.notes} onChange={(e) => cart.setNotes(l.productId, e.target.value)} maxLength={200} placeholder={ptBR.order.notesPlaceholder} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-xs" />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-neutral-200 pt-2 font-semibold">
            <span>Total</span>
            <span>{money(cart.totalCents)}</span>
          </div>
          <Button className="mt-3 w-full" disabled={busy || cart.lines.length === 0} onClick={send}>
            {ptBR.order.send}
          </Button>
        </div>
      </div>
    </StaffShell>
  );
}
