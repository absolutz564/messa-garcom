'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ptBR, type CustomerRequest, type CustomerSession, type Menu, type MenuProduct, type Order, type PublicTable, type SessionConsumption } from '@messa/contracts';
import { money } from '@/lib/format';
import { publicApi, isApiError } from '@/lib/public-api';
import { useRealtimeKeyed } from '@/lib/realtime';
import { newIdempotencyKey, useCart } from '@/lib/cart';
import { DialogProvider, useDialog } from '@/components/dialog';

type TableState = PublicTable['state'];

/**
 * Máquina de estados do cliente (F01, F02, F05–F07, F11, F15).
 * - browsing: cardápio + CTA conforme estado da mesa
 * - waiting:  solicitação pendente (polling 3 s + socket)
 * - session:  participante (PIN, carrinho, consumo); `awaiting` = pedido aguardando confirmação (BR-09)
 * - notice:   mensagem terminal
 */
type Ui =
  | { kind: 'loading' }
  | { kind: 'browsing'; tableState: TableState; pinMode?: boolean }
  | { kind: 'waiting'; request: CustomerRequest }
  | { kind: 'session'; session: CustomerSession; awaiting: string | null }
  | { kind: 'notice'; title: string; body: string; retry?: boolean };

type Tab = 'menu' | 'cart' | 'bill';

const requestKey = (token: string) => `messa_request_${token}`;
const awaitingKey = (token: string) => `messa_awaiting_${token}`;

export function MenuView(props: { table: PublicTable; menu: Menu; token: string }) {
  return (
    <DialogProvider>
      <MenuViewInner {...props} />
    </DialogProvider>
  );
}

function MenuViewInner({ table, menu, token }: { table: PublicTable; menu: Menu; token: string }) {
  const dialog = useDialog();
  const [ui, setUi] = useState<Ui>({ kind: 'loading' });
  const [tab, setTab] = useState<Tab>('menu');
  const [consumption, setConsumption] = useState<SessionConsumption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeCat, setActiveCat] = useState(menu.categories[0]?.id ?? null);
  const cart = useCart(`messa_cart_${token}`);
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const inSession = ui.kind === 'session';

  const loadConsumption = useCallback(async () => {
    try {
      setConsumption(await publicApi.consumption());
    } catch {
      /* ignore */
    }
  }, []);

  // ---- reidratação: sessão por cookie → solicitação pendente salva → estado da mesa
  const bootstrap = useCallback(async () => {
    try {
      const session = await publicApi.session();
      const awaiting = window.localStorage.getItem(awaitingKey(token));
      setUi({ kind: 'session', session, awaiting });
      void loadConsumption();
      return;
    } catch (e) {
      if (isApiError(e, 'session_closed')) {
        window.localStorage.removeItem(awaitingKey(token));
        setUi({ kind: 'notice', title: ptBR.session.closed.title, body: ptBR.session.closed.body });
        return;
      }
    }
    const savedId = window.localStorage.getItem(requestKey(token));
    if (savedId) {
      try {
        const request = await publicApi.requestStatus(token, savedId);
        if (request.status === 'pending') return setUi({ kind: 'waiting', request });
        if (request.status === 'approved') return void bootstrap();
      } catch {
        /* solicitação antiga/inválida */
      }
      window.localStorage.removeItem(requestKey(token));
    }
    try {
      const { state } = await publicApi.tableState(token);
      setUi({ kind: 'browsing', tableState: state });
    } catch {
      setUi({ kind: 'browsing', tableState: table.state });
    }
  }, [token, table.state, loadConsumption]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // ---- polling de fallback (RNF-04): aguardando liberação ou confirmação
  const pollingId = ui.kind === 'waiting' ? ui.request.id : ui.kind === 'session' ? ui.awaiting : null;
  useEffect(() => {
    if (!pollingId) return;
    const id = window.setInterval(() => void refreshRequest(pollingId), 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingId]);

  async function refreshRequest(id: string) {
    try {
      applyRequest(await publicApi.requestStatus(token, id));
    } catch {
      /* rede */
    }
  }

  function applyRequest(request: CustomerRequest) {
    const cur = uiRef.current;
    if (request.type === 'resume_session' || (cur.kind === 'session' && cur.awaiting === request.id)) {
      if (request.status === 'pending') return;
      window.localStorage.removeItem(awaitingKey(token));
      if (request.status === 'approved') setFlash(ptBR.order.sent);
      else setError(request.status === 'rejected' ? ptBR.request.rejected : ptBR.request.expired);
      return void bootstrap();
    }
    if (request.status === 'pending') return setUi({ kind: 'waiting', request });
    window.localStorage.removeItem(requestKey(token));
    if (request.status === 'approved') return void bootstrap();
    if (request.status === 'rejected') return setUi({ kind: 'notice', title: 'Atendimento não liberado', body: ptBR.request.rejected, retry: true });
    setUi({ kind: 'notice', title: 'Sem resposta', body: ptBR.request.expired, retry: true });
  }

  // ---- realtime
  const socketKey = ui.kind === 'session' ? `s:${ui.session.id}` : ui.kind === 'waiting' ? `r:${ui.request.id}` : 'browse';
  useRealtimeKeyed(socketKey, (e) => {
    const cur = uiRef.current;
    if (e.type.startsWith('request.')) {
      const id = e.aggregateId;
      if ((cur.kind === 'waiting' && id === cur.request.id) || (cur.kind === 'session' && cur.awaiting === id)) void refreshRequest(id);
    }
    if (cur.kind === 'session' && (e.aggregateId === cur.session.id || e.payload.sessionId === cur.session.id)) {
      if (e.type === 'session.closed') {
        window.localStorage.removeItem(awaitingKey(token));
        setUi({ kind: 'notice', title: ptBR.session.closed.title, body: ptBR.session.closed.body });
      } else if (e.type.startsWith('order.')) void loadConsumption();
      else if (e.type.startsWith('session.') || e.type.startsWith('bill.')) publicApi.session().then((session) => setUi({ kind: 'session', session, awaiting: cur.awaiting })).catch(() => undefined);
    }
    if (e.type === 'service_area.changed' || e.type === 'catalog.changed') window.location.reload();
    if (cur.kind === 'browsing' && e.type.startsWith('session.')) void bootstrap();
  }, { enabled: ui.kind !== 'loading' });

  // ---- ações
  async function requestService() {
    setBusy(true);
    setError(null);
    try {
      const request = await publicApi.requestService(token);
      window.localStorage.setItem(requestKey(token), request.id);
      applyRequest(request);
    } catch (e) {
      if (isApiError(e, 'session_active')) setUi({ kind: 'browsing', tableState: 'occupied', pinMode: true });
      else if (isApiError(e, 'device_blocked') || isApiError(e, 'table_rate_limited')) setUi({ kind: 'notice', title: 'Aguarde um pouco', body: e.error.message });
      else setError(isApiError(e) ? e.error.message : 'Falha de conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function join(pin: string) {
    setBusy(true);
    setError(null);
    try {
      const session = await publicApi.join(token, pin);
      setUi({ kind: 'session', session, awaiting: null });
      void loadConsumption();
    } catch (e) {
      if (isApiError(e, 'session_closed')) setUi({ kind: 'browsing', tableState: 'free' });
      else setError(isApiError(e) ? e.error.message : 'Falha de conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function sendOrder() {
    if (ui.kind !== 'session' || cart.lines.length === 0) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const result = await publicApi.createOrder({ items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, notes: l.notes.trim() || null })) }, newIdempotencyKey());
      cart.clear();
      if (result.awaitingConfirmation && result.requestId) {
        window.localStorage.setItem(awaitingKey(token), result.requestId);
        setUi({ ...ui, awaiting: result.requestId });
      } else {
        setFlash(ptBR.order.sent);
      }
      await loadConsumption();
      setTab('bill');
    } catch (e) {
      if (isApiError(e, 'validation') && Array.isArray(e.error.details?.rejected)) {
        const rejected = e.error.details.rejected as Array<{ productId: string; reason: string }>;
        const names = rejected.map((r) => cart.lines.find((l) => l.productId === r.productId)?.name ?? '?');
        for (const r of rejected) cart.remove(r.productId);
        setError(ptBR.order.rejectedItems.replace('{items}', names.join(', ')));
      } else if (isApiError(e, 'awaiting_confirmation')) {
        const requestId = e.error.details?.requestId as string | undefined;
        if (requestId) {
          window.localStorage.setItem(awaitingKey(token), requestId);
          setUi({ ...ui, awaiting: requestId });
        }
      } else if (isApiError(e, 'session_closed') || isApiError(e, 'not_in_session')) {
        void bootstrap();
      } else setError(isApiError(e) ? e.error.message : 'Falha de conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function requestBill() {
    if (ui.kind !== 'session') return;
    const ok = await dialog.confirm({ title: ptBR.bill.confirmTitle, body: ptBR.bill.confirmBody, confirmLabel: ptBR.bill.confirmAction });
    if (!ok) return;
    setBusy(true);
    try {
      const session = await publicApi.requestBill();
      setUi({ kind: 'session', session, awaiting: null });
      await loadConsumption();
      setTab('bill');
    } catch (e) {
      setError(isApiError(e) ? e.error.message : 'Falha de conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelBill() {
    if (ui.kind !== 'session') return;
    try {
      const session = await publicApi.cancelBill();
      setUi({ kind: 'session', session, awaiting: null });
    } catch (e) {
      setError(isApiError(e) ? e.error.message : 'Falha de conexão. Tente novamente.');
    }
  }

  async function cancelOrder(o: Order) {
    if (!(await dialog.confirm({ title: `Cancelar o pedido #${o.sequenceNo}?`, body: o.items.map((i) => `${i.quantity}× ${i.name}`).join(', '), confirmLabel: 'Cancelar pedido', danger: true }))) return;
    try {
      await publicApi.cancelOrder(o.id);
      await loadConsumption();
    } catch (e) {
      setError(isApiError(e) ? e.error.message : 'Não foi possível cancelar.');
    }
  }

  const billRequested = ui.kind === 'session' && Boolean(ui.session.bill.requestedAt);
  const canOrder = inSession && !(ui.kind === 'session' && ui.awaiting) && !billRequested;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white pb-44">
      <header className="flex flex-col items-center gap-2 border-b border-neutral-100 px-6 pb-4 pt-8 text-center">
        {table.tenant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={table.tenant.logoUrl} alt={table.tenant.name} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">{table.tenant.name.slice(0, 1)}</div>
        )}
        <h1 className="text-xl font-bold">{table.tenant.name}</h1>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700">{table.table.displayName}</span>
        <a href="/privacidade" className="text-[10px] text-neutral-400 underline">privacidade</a>
      </header>

      {ui.kind === 'session' && <SessionBanner session={ui.session} onName={(session) => setUi({ ...ui, session })} />}

      {inSession && (
        <div className="sticky top-0 z-20 grid grid-cols-3 border-b border-neutral-100 bg-white text-sm">
          {(['menu', 'cart', 'bill'] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`py-2 font-medium ${tab === t ? 'border-b-2 border-brand text-brand' : 'text-neutral-500'}`}>
              {t === 'menu' ? 'Cardápio' : t === 'cart' ? `${ptBR.order.cart}${cart.count ? ` (${cart.count})` : ''}` : ptBR.order.consumption}
            </button>
          ))}
        </div>
      )}

      {tab === 'menu' && (
        <>
          {menu.categories.length > 0 && (
            <nav className={`sticky ${inSession ? 'top-9' : 'top-0'} z-10 flex gap-2 overflow-x-auto border-b border-neutral-100 bg-white px-4 py-2`}>
              {menu.categories.map((c) => (
                <a key={c.id} href={`#cat-${c.id}`} onClick={() => setActiveCat(c.id)} className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${activeCat === c.id ? 'bg-brand text-white' : 'bg-neutral-100 text-neutral-700'}`}>
                  {c.name}
                </a>
              ))}
            </nav>
          )}
          <div className="space-y-6 px-4 py-4">
            {menu.categories.map((c) => (
              <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-24">
                <h2 className="mb-2 text-lg font-semibold">{c.name}</h2>
                <ul className="space-y-3">
                  {c.products.map((p) => (
                    <ProductRow key={p.id} product={p} qty={cart.qty(p.id)} canOrder={canOrder} onAdd={() => cart.add(p)} onRemove={() => cart.remove(p.id)} />
                  ))}
                </ul>
              </section>
            ))}
            {menu.categories.length === 0 && <p className="py-12 text-center text-sm text-neutral-400">Cardápio em preparação.</p>}
          </div>
        </>
      )}

      {tab === 'cart' && inSession && (
        <div className="space-y-3 px-4 py-4">
          {cart.lines.length === 0 && <p className="py-12 text-center text-sm text-neutral-400">Seu pedido está vazio. Adicione itens pelo cardápio.</p>}
          {cart.lines.map((l) => (
            <div key={l.productId} className="rounded-xl border border-neutral-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{l.name}</span>
                <span className="text-sm font-semibold">{money(l.priceCents * l.quantity)}</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Stepper qty={l.quantity} onAdd={() => cart.add({ id: l.productId, name: l.name, priceCents: l.priceCents })} onRemove={() => cart.remove(l.productId)} />
                <input value={l.notes} onChange={(e) => cart.setNotes(l.productId, e.target.value)} maxLength={200} placeholder={ptBR.order.notesPlaceholder} className="flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-sm" />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'bill' && inSession && <Bill consumption={consumption} onCancel={cancelOrder} />}

      <footer className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-neutral-100 bg-white p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.05)]">
        {ui.kind === 'loading' && <p className="text-center text-sm text-neutral-400">Carregando…</p>}

        {ui.kind === 'browsing' && !ui.pinMode && ui.tableState === 'free' && (
          <>
            {error && <p className="mb-2 text-center text-sm text-red-600">{error}</p>}
            <button type="button" onClick={requestService} disabled={busy} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60">
              {busy ? '…' : ptBR.menu.cta.start}
            </button>
          </>
        )}

        {ui.kind === 'browsing' && !ui.pinMode && ui.tableState === 'requested' && (
          <>
            <p className="mb-2 text-center text-sm text-neutral-600">Outra pessoa desta mesa já solicitou atendimento.</p>
            <button type="button" onClick={requestService} disabled={busy} className="w-full rounded-xl border border-neutral-300 px-4 py-3 font-semibold text-neutral-800">
              Solicitar com este celular também
            </button>
          </>
        )}

        {ui.kind === 'browsing' && (ui.pinMode || ui.tableState === 'occupied' || ui.tableState === 'inactive') && (
          <PinForm busy={busy} error={error} onSubmit={join} allowRequest={ui.tableState === 'inactive'} onRequest={requestService} />
        )}

        {ui.kind === 'waiting' && (
          <div className="text-center">
            <p className="font-semibold">{ptBR.request.sent}</p>
            <p className="mt-1 text-sm text-neutral-500">{ptBR.request.waiting.body}</p>
          </div>
        )}

        {ui.kind === 'session' && ui.awaiting && (
          <div className="text-center">
            <p className="font-semibold">{ptBR.resume.title}</p>
            <p className="mt-1 text-xs text-neutral-500">{ptBR.resume.body}</p>
            <p className="mt-2 text-sm text-neutral-600">{ptBR.resume.sent}</p>
          </div>
        )}

        {ui.kind === 'session' && !ui.awaiting && ui.session.bill.requestedAt && (
          <div className="text-center">
            {ui.session.bill.acknowledgedAt ? (
              <>
                <p className="font-semibold">{ptBR.bill.onTheWay}</p>
                <p className="mt-1 text-sm text-neutral-600">{ptBR.bill.onTheWayBody.replace('{total}', money(ui.session.totalCents))}</p>
              </>
            ) : (
              <>
                <p className="font-semibold">{ptBR.bill.requested}</p>
                <p className="mt-1 text-sm text-neutral-600">{ptBR.bill.requestedBody}</p>
                <button type="button" onClick={cancelBill} className="mt-2 text-xs text-neutral-500 underline">
                  {ptBR.bill.cancel}
                </button>
              </>
            )}
          </div>
        )}

        {ui.kind === 'session' && !ui.awaiting && !ui.session.bill.requestedAt && (
          <>
            {error && <p className="mb-2 text-center text-sm text-red-600">{error}</p>}
            {flash && !error && <p className="mb-2 text-center text-sm text-green-700">{flash}</p>}
            {cart.count > 0 ? (
              <button type="button" onClick={tab === 'cart' ? sendOrder : () => setTab('cart')} disabled={busy} className="flex w-full items-center justify-between rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60">
                <span>{tab === 'cart' ? ptBR.order.send : `Ver pedido (${cart.count})`}</span>
                <span>{money(cart.totalCents)}</span>
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-sm text-neutral-500">
                  {ui.session.status === 'inactive' ? 'Sem pedidos há mais de 1 hora. Ao pedir, o caixa vai confirmar seu atendimento.' : 'Toque em + para adicionar itens ao seu pedido.'}
                </p>
                {(consumption?.orders.some((o) => o.status !== 'cancelled') ?? false) && (
                  <button type="button" onClick={requestBill} disabled={busy} className="whitespace-nowrap rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-neutral-800">
                    {ptBR.bill.cta}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {ui.kind === 'notice' && (
          <div className="text-center">
            <p className="font-semibold">{ui.title}</p>
            <p className="mt-1 text-sm text-neutral-500">{ui.body}</p>
            {ui.retry && (
              <button type="button" onClick={() => void bootstrap()} className="mt-3 text-sm font-medium text-brand underline">
                Voltar ao cardápio
              </button>
            )}
          </div>
        )}
      </footer>
    </main>
  );
}

function SessionBanner({ session, onName }: { session: CustomerSession; onName: (s: CustomerSession) => void }) {
  const [name, setName] = useState(session.participant.name ?? '');
  const [editing, setEditing] = useState(!session.participant.name);
  async function save() {
    try {
      onName(await publicApi.setName(name.trim() || null));
      setEditing(false);
    } catch {
      /* mantém o campo */
    }
  }
  return (
    <div className="mx-4 mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        Atendimento em andamento · {session.participant.name ? session.participant.name : `Cliente ${session.participant.ordinal}`}
      </p>
      {editing ? (
        <form
          className="mx-auto mt-2 flex max-w-xs items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder={ptBR.order.namePrompt} className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
          <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white">
            OK
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs text-neutral-500 underline">
          alterar nome
        </button>
      )}
      {editing && <p className="mt-1 text-[11px] text-neutral-400">{ptBR.order.nameHint}</p>}
      <p className="text-sm text-neutral-700">
        Compartilhe com sua mesa: <span className="font-mono text-2xl font-bold tracking-[0.25em] text-brand">{session.pin}</span>
      </p>
      <p className="text-xs text-neutral-500">
        {session.participantsCount} {session.participantsCount === 1 ? 'pessoa' : 'pessoas'} nesta mesa
      </p>
    </div>
  );
}

function Bill({ consumption, onCancel }: { consumption: SessionConsumption | null; onCancel: (o: Order) => void }) {
  if (!consumption) return <p className="py-12 text-center text-sm text-neutral-400">Carregando…</p>;
  return (
    <div className="space-y-3 px-4 py-4">
      {consumption.orders.length === 0 && <p className="py-12 text-center text-sm text-neutral-400">{ptBR.order.empty}</p>}
      {consumption.orders.map((o) => (
        <div key={o.id} className={`rounded-xl border border-neutral-200 p-3 ${o.status === 'cancelled' ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              Pedido #{o.sequenceNo} · {o.createdBy.kind === 'customer' ? (o.createdBy.participantName ?? `Cliente ${o.createdBy.participantOrdinal}`) : 'Garçom'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${o.status === 'acknowledged' ? 'bg-green-100 text-green-800' : o.status === 'cancelled' ? 'bg-neutral-100' : 'bg-amber-100 text-amber-800'}`}>{ptBR.order.status[o.status]}</span>
          </div>
          <ul className="mt-1 text-sm text-neutral-700">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>
                  {i.quantity}× {i.name}
                  {i.notes && <span className="text-neutral-400"> — {i.notes}</span>}
                </span>
                <span>{money(i.unitPriceCents * i.quantity)}</span>
              </li>
            ))}
          </ul>
          {o.status === 'submitted' && (
            <button type="button" onClick={() => onCancel(o)} className="mt-1 text-xs text-neutral-500 underline">
              {ptBR.order.cancelOwn}
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-neutral-200 pt-3 text-base font-semibold">
        <span>Total</span>
        <span>{money(consumption.totalCents)}</span>
      </div>
    </div>
  );
}

function Stepper({ qty, onAdd, onRemove }: { qty: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center rounded-full border border-neutral-300">
      <button type="button" onClick={onRemove} className="h-8 w-8 text-lg leading-none" aria-label="menos">
        −
      </button>
      <span className="w-6 text-center text-sm font-semibold">{qty}</span>
      <button type="button" onClick={onAdd} className="h-8 w-8 text-lg leading-none" aria-label="mais">
        +
      </button>
    </div>
  );
}

function PinForm({ busy, error, onSubmit, allowRequest, onRequest }: { busy: boolean; error: string | null; onSubmit: (pin: string) => void; allowRequest: boolean; onRequest: () => void }) {
  const [pin, setPin] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (/^\d{4}$/.test(pin)) onSubmit(pin);
  }
  return (
    <form onSubmit={submit} className="space-y-2 text-center">
      <p className="font-semibold">{ptBR.session.join.title}</p>
      <p className="text-sm text-neutral-500">{ptBR.session.join.body}</p>
      <input inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="one-time-code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-40 rounded-xl border border-neutral-300 px-4 py-3 text-center font-mono text-3xl tracking-[0.4em] focus:border-brand focus:outline-none" placeholder="••••" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy || pin.length !== 4} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60">
        Entrar
      </button>
      {allowRequest && (
        <button type="button" onClick={onRequest} disabled={busy} className="text-sm font-medium text-neutral-600 underline">
          {ptBR.session.join.noPin}
        </button>
      )}
    </form>
  );
}

function ProductRow({ product: p, qty, canOrder, onAdd, onRemove }: { product: MenuProduct; qty: number; canOrder: boolean; onAdd: () => void; onRemove: () => void }) {
  const blocked = p.state !== 'orderable';
  const label = p.state === 'area_closed' ? ptBR.product.areaClosed[p.serviceAreaKey] : p.state === 'unavailable' ? ptBR.product.unavailable : null;
  return (
    <li className={`flex gap-3 ${blocked ? 'opacity-60' : ''}`}>
      {p.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageUrl} alt="" className="h-20 w-20 flex-none rounded-lg object-cover" loading="lazy" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium">{p.name}</span>
          <span className="whitespace-nowrap text-sm font-semibold">{money(p.priceCents)}</span>
        </div>
        {p.description && <p className="mt-0.5 text-sm text-neutral-500">{p.description}</p>}
        <div className="mt-1 flex items-center justify-between">
          {label ? <span className="inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{label}</span> : <span />}
          {canOrder && !blocked && (qty > 0 ? <Stepper qty={qty} onAdd={onAdd} onRemove={onRemove} /> : (
            <button type="button" onClick={onAdd} className="rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white">
              + Adicionar
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}
