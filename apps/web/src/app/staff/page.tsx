'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ptBR, type ServiceArea, type SessionConsumption, type StaffOrder, type StaffRequest, type StaffSession, type StaffTable } from '@messa/contracts';
import { api, getSession } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { money } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { chime, isSoundEnabled, notificationPermission, notify, requestNotifications, setSoundEnabled, unlockAudio } from '@/lib/sound';
import { money as fmt } from '@/lib/format';
import { StaffShell } from '@/components/staff-shell';
import { Badge, Button, Card, ErrorText, PageTitle } from '@/components/ui';

const STATE_TONE: Record<StaffTable['state'], 'neutral' | 'green' | 'red' | 'amber'> = { free: 'neutral', requested: 'amber', occupied: 'green', inactive: 'red', disabled: 'neutral' };
const STATE_BG: Record<StaffTable['state'], string> = {
  free: 'bg-white border-neutral-200',
  requested: 'bg-amber-50 border-amber-300 animate-pulse',
  occupied: 'bg-green-50 border-green-300',
  inactive: 'bg-red-50 border-red-300',
  disabled: 'bg-neutral-100 border-neutral-200 opacity-60',
};

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'agora' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Painel do operador + app do garçom (F03, F07 ack, F09, F12–F14). */
export default function StaffPage() {
  const role = getSession()?.activeTenant?.role;
  const isOperator = role === 'operator' || role === 'admin';
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const [notif, setNotif] = useState<string>('default');
  const seen = useRef<{ requests: Set<string>; orders: Set<string>; primed: boolean }>({ requests: new Set(), orders: new Set(), primed: false });

  useEffect(() => {
    setSound(isSoundEnabled());
    setNotif(notificationPermission());
  }, []);

  const reload = useCallback(async () => {
    try {
      const [t, a, r, o] = await Promise.all([
        api<StaffTable[]>('/staff/tables'),
        api<ServiceArea[]>('/admin/service-areas'),
        isOperator ? api<StaffRequest[]>('/staff/requests') : Promise.resolve([]),
        isOperator ? api<StaffOrder[]>('/staff/orders') : Promise.resolve([]),
      ]);
      setTables(t);
      setAreas(a);
      setRequests(r);
      setOrders(o);
      setError(null);
      // Toca ao detectar solicitação/pedido novos (socket ou polling), exceto na primeira carga.
      const st = seen.current;
      const prevReq = st.requests;
      const prevOrd = st.orders;
      const newReq = r.some((x) => !st.requests.has(x.id));
      const newOrd = o.some((x) => x.status === 'submitted' && !st.orders.has(x.id));
      st.requests = new Set(r.map((x) => x.id));
      st.orders = new Set(o.filter((x) => x.status === 'submitted').map((x) => x.id));
      if (st.primed) {
        if (newReq) {
          void chime('request');
          const first = r.find((x) => !prevReq.has(x.id));
          if (first) notify(`${first.table.displayName} — solicitação de atendimento`, first.type === 'resume_session' ? 'Pedido aguardando confirmação (mesa inativa há mais de 1 h)' : 'Cliente pediu para iniciar o atendimento. Toque para liberar.', `req-${first.id}`);
        } else if (newOrd) {
          void chime('order');
          const first = o.find((x) => x.status === 'submitted' && !prevOrd.has(x.id));
          if (first) notify(`${first.table.displayName} — pedido #${first.sequenceNo} (${fmt(first.totalCents)})`, first.items.map((i) => `${i.quantity}× ${i.name}`).join(', '), `ord-${first.id}`);
        }
      }
      st.primed = true;
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [isOperator]);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 5000); // fallback (RNF-04)
    return () => window.clearInterval(id);
  }, [reload]);

  useRealtime(() => void reload(), { staff: true });

  // Campainha repetida enquanto houver solicitação pendente + título da aba (caixa de costas para a tela).
  useEffect(() => {
    const pending = requests.length;
    const base = 'Messa · Equipe';
    document.title = pending > 0 ? `(${pending}) Solicitação de atendimento` : base;
    if (pending === 0) return;
    const id = window.setInterval(() => void chime('request'), 10_000);
    return () => {
      window.clearInterval(id);
      document.title = base;
    };
  }, [requests.length]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const selectedTable = tables.find((t) => t.id === selected) ?? null;
  const submitted = orders.filter((o) => o.status === 'submitted');
  const pendingConfirmation = orders.filter((o) => o.status === 'pending_confirmation');

  return (
    <StaffShell title="Messa · Equipe" nav={[{ href: '/staff', label: 'Mesas' }]} require={['operator', 'waiter']}>
      <PageTitle
        actions={
          <div className="flex gap-2">
            <Button
              variant={sound ? 'secondary' : 'ghost'}
              title={sound ? 'Som de alerta ligado' : 'Som de alerta desligado'}
              onClick={async () => {
                const next = !sound;
                setSoundEnabled(next);
                setSound(next);
                if (next) {
                  await unlockAudio();
                  void chime('test');
                  setNotif(await requestNotifications());
                }
              }}
            >
              {sound ? (notif === 'granted' ? '🔔 Som + notificações' : '🔔 Som ligado') : '🔕 Som desligado'}
            </Button>
            {sound && notif === 'granted' && (
              <Button
                variant="ghost"
                title="Mostra um balão de teste do sistema (mesmo com esta aba em primeiro plano)"
                onClick={() => {
                  const ok = notify('Messa — teste', 'Se você está vendo isto, as notificações do sistema funcionam.', 'test', true);
                  if (!ok) window.alert('O navegador não exibiu a notificação. Verifique: Windows → Configurações → Notificações → Chrome ativado, e o Assistente de Foco desligado.');
                }}
              >
                Testar notificação
              </Button>
            )}
            {sound && notif === 'denied' && <span className="self-center text-xs text-red-600" title="Clique no cadeado na barra de endereço → Notificações → Permitir">notificações bloqueadas no navegador</span>}
            {sound && notif === 'default' && <span className="self-center text-xs text-amber-700">clique no sino para permitir notificações</span>}
            {areas.map((a) => (
              <Button key={a.key} variant={a.isOpen ? 'secondary' : 'danger'} disabled={!isOperator || busy === a.key} onClick={() => run(a.key, () => api(`/admin/service-areas/${a.key}`, { method: 'PATCH', body: { isOpen: !a.isOpen } }))}>
                {a.isOpen ? ptBR.staff.area.close[a.key] : ptBR.staff.area.open[a.key]}
              </Button>
            ))}
          </div>
        }
      >
        Mesas
      </PageTitle>
      <ErrorText>{error}</ErrorText>

      {isOperator && requests.length > 0 && (
        <div className="mb-6 space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} pendingOrder={pendingConfirmation.find((o) => o.sessionId === r.liveSession?.id) ?? null} busy={busy === r.id} onApprove={(resolution) => run(r.id, () => api(`/staff/requests/${r.id}/approve`, { method: 'POST', body: { resolution } }))} onReject={() => run(r.id, () => api(`/staff/requests/${r.id}/reject`, { method: 'POST' }))} />
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {isOperator && (
            <section>
              <h2 className="mb-2 font-semibold">
                {ptBR.staff.order.queueTitle} {submitted.length > 0 && <Badge tone="amber">{submitted.length}</Badge>}
              </h2>
              {submitted.length === 0 ? (
                <p className="text-sm text-neutral-400">Nenhum pedido aguardando lançamento.</p>
              ) : (
                <div className="space-y-2">
                  {submitted.map((o) => (
                    <OrderCard key={o.id} order={o} busy={busy === o.id} onAck={() => run(o.id, () => api(`/staff/orders/${o.id}/ack`, { method: 'POST' }))} onCancel={() => window.confirm(`Cancelar o pedido #${o.sequenceNo} da ${o.table.displayName}?`) && run(o.id, () => api(`/staff/orders/${o.id}/cancel`, { method: 'POST', body: {} }))} />
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((t) => (
              <button key={t.id} type="button" onClick={() => setSelected(t.id)} className={`rounded-xl border-2 p-3 text-left transition ${STATE_BG[t.state]} ${selected === t.id ? 'ring-2 ring-neutral-900' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{t.displayName}</span>
                  <Badge tone={STATE_TONE[t.state]}>{ptBR.staff.table.state[t.state]}</Badge>
                </div>
                {t.session && (
                  <div className="mt-2 text-xs text-neutral-600">
                    <div>
                      PIN <span className="font-mono font-bold">{t.session.pin}</span> · {t.session.participantsCount} 👤
                    </div>
                    <div>
                      {t.session.ordersCount} pedidos · {money(t.session.totalCents)}
                      {t.session.unacknowledgedCount > 0 && <span className="ml-1 font-medium text-amber-700">({t.session.unacknowledgedCount} a lançar)</span>}
                    </div>
                    <div className="text-neutral-400">última atividade: {ago(t.session.lastActivityAt)}</div>
                  </div>
                )}
                {t.pendingRequests > 0 && <div className="mt-2 text-xs font-medium text-amber-700">{t.pendingRequests} solicitação(ões)</div>}
              </button>
            ))}
            {tables.length === 0 && <p className="col-span-full py-8 text-center text-sm text-neutral-400">Nenhuma mesa cadastrada.</p>}
          </div>
        </div>

        {selectedTable && (
          <TableDetail
            table={selectedTable}
            isOperator={isOperator}
            busy={busy === selectedTable.id}
            onOpen={() => run(selectedTable.id, () => api(`/staff/tables/${selectedTable.id}/open`, { method: 'POST' }))}
            onClose={(force) => run(selectedTable.id, () => api(`/staff/sessions/${selectedTable.session!.id}/close`, { method: 'POST', body: { force } }))}
            onDeselect={() => setSelected(null)}
          />
        )}
      </div>
    </StaffShell>
  );
}

function OrderCard({ order: o, busy, onAck, onCancel }: { order: StaffOrder; busy: boolean; onAck: () => void; onCancel: () => void }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {o.table.displayName} · Pedido #{o.sequenceNo} <span className="text-xs font-normal text-neutral-500">há {ago(o.createdAt)} · {o.createdBy.kind === 'customer' ? `Cliente ${o.createdBy.participantOrdinal}` : o.createdBy.userName}</span>
        </p>
        <ul className="mt-1 text-sm text-neutral-700">
          {o.items.map((i) => (
            <li key={i.id}>
              {i.quantity}× {i.name}
              {i.notes && <span className="text-amber-700"> — {i.notes}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-sm font-semibold">{money(o.totalCents)}</p>
      </div>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={onAck}>
          {ptBR.staff.order.ack}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          {ptBR.staff.order.cancel}
        </Button>
      </div>
    </Card>
  );
}

function RequestCard({ request: r, pendingOrder, busy, onApprove, onReject }: { request: StaffRequest; pendingOrder: StaffOrder | null; busy: boolean; onApprove: (resolution?: 'new_session' | 'continue_session') => void; onReject: () => void }) {
  const inactive = r.liveSession?.status === 'inactive';
  return (
    <Card className="border-amber-300 bg-amber-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{inactive && r.liveSession ? ptBR.staff.resume.title.replace('{table}', r.table.displayName).replace('{duration}', ago(r.liveSession.lastActivityAt)) : ptBR.staff.request.title.replace('{table}', r.table.displayName)}</p>
          <p className="text-xs text-neutral-500">há {ago(r.createdAt)}</p>
          {inactive && r.liveSession && <p className="mt-1 text-sm text-neutral-700">{ptBR.staff.resume.body.replace('{orderCount}', String(r.liveSession.ordersCount)).replace('{total}', money(r.liveSession.totalCents))}</p>}
          {pendingOrder && (
            <p className="mt-1 text-sm text-neutral-700">
              Novo pedido aguardando: {pendingOrder.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')} ({money(pendingOrder.totalCents)})
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {inactive ? (
            <>
              <Button disabled={busy} onClick={() => onApprove('new_session')}>
                {ptBR.staff.resume.newSession}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => onApprove('continue_session')}>
                {ptBR.staff.resume.continue}
              </Button>
            </>
          ) : (
            <Button disabled={busy} onClick={() => onApprove()}>
              {ptBR.staff.request.approve}
            </Button>
          )}
          <Button variant="danger" disabled={busy} onClick={onReject}>
            {ptBR.staff.request.reject}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TableDetail({ table: t, isOperator, busy, onOpen, onClose, onDeselect }: { table: StaffTable; isOperator: boolean; busy: boolean; onOpen: () => void; onClose: (force: boolean) => void; onDeselect: () => void }) {
  const s: StaffSession | null = t.session;
  const [consumption, setConsumption] = useState<SessionConsumption | null>(null);
  useEffect(() => {
    if (!s) return setConsumption(null);
    api<SessionConsumption>(`/staff/sessions/${s.id}/orders`).then(setConsumption).catch(() => setConsumption(null));
  }, [s?.id, s?.ordersCount, s?.unacknowledgedCount, s]);

  return (
    <Card className="h-fit md:sticky md:top-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.displayName}</h2>
        <Badge tone={STATE_TONE[t.state]}>{ptBR.staff.table.state[t.state]}</Badge>
      </div>
      {s ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-neutral-50 p-3 text-center">
            <p className="text-xs uppercase text-neutral-500">PIN da sessão</p>
            <p className="font-mono text-3xl font-bold tracking-[0.3em]">{s.pin}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-neutral-700">
            <dt className="text-neutral-500">Aberta</dt>
            <dd>
              há {ago(s.openedAt)} ({s.openedBy === 'waiter' ? 'garçom' : 'caixa'})
            </dd>
            <dt className="text-neutral-500">Última atividade</dt>
            <dd>há {ago(s.lastActivityAt)}</dd>
            <dt className="text-neutral-500">Pessoas</dt>
            <dd>{s.participantsCount}</dd>
          </dl>
          <div>
            <p className="mb-1 font-medium">{ptBR.order.consumption}</p>
            {!consumption || consumption.orders.length === 0 ? (
              <p className="text-neutral-400">{ptBR.order.empty}</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {consumption.orders.map((o) => (
                  <li key={o.id} className={`py-1 ${o.status === 'cancelled' ? 'line-through opacity-50' : ''}`}>
                    <div className="flex justify-between">
                      <span>
                        #{o.sequenceNo} · {ptBR.order.status[o.status]}
                      </span>
                      <span>{money(o.totalCents)}</span>
                    </div>
                    <div className="text-xs text-neutral-500">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</div>
                  </li>
                ))}
              </ul>
            )}
            {consumption && (
              <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 font-semibold">
                <span>Total</span>
                <span>{money(consumption.totalCents)}</span>
              </div>
            )}
          </div>
          <a href={`/staff/order/${s.id}`} className="block w-full rounded-lg bg-brand px-3 py-2 text-center text-sm font-medium text-white">
            Fazer pedido para esta mesa
          </a>
          {isOperator && (
            <Button
              variant="danger"
              className="w-full"
              disabled={busy}
              onClick={() => {
                if (s.unacknowledgedCount > 0) {
                  if (window.confirm(`${ptBR.staff.session.close.pending.title.replace('{count}', String(s.unacknowledgedCount))}\n\n${ptBR.staff.session.close.pending.force}?`)) onClose(true);
                } else if (window.confirm(`Encerrar o atendimento da ${t.displayName}?`)) onClose(false);
              }}
            >
              Encerrar atendimento
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-neutral-600">{t.state === 'requested' ? 'Há solicitação pendente. Libere pela fila acima ou abra a mesa diretamente.' : 'Mesa livre.'}</p>
          {t.state !== 'disabled' && (
            <Button className="w-full" disabled={busy} onClick={onOpen}>
              Abrir atendimento
            </Button>
          )}
        </div>
      )}
      <button type="button" onClick={onDeselect} className="mt-3 w-full text-xs text-neutral-500 underline">
        fechar
      </button>
    </Card>
  );
}

