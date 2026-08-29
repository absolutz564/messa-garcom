# ADR-003 — Realtime com Socket.IO no próprio API e bus em Postgres LISTEN/NOTIFY

**Status:** aceito · 2026-08-29

## Contexto
Operador precisa ver solicitações e pedidos em ≤ 2 s; cliente precisa ver aprovação em ≤ 2 s (RNF-04). Custo zero no MVP; deve suportar múltiplas instâncias depois.

## Decisão
- Socket.IO hospedado no mesmo processo NestJS. Rooms: `tenant:{id}` (staff), `session:{id}` (participantes), `request:{id}` (device aguardando).
- Autenticação do socket via os mesmos cookies/JWT do REST; o servidor decide as rooms (cliente não escolhe).
- Eventos saem da **outbox**: após commit, um publisher lê `domain_events` não publicados e emite. Bus entre instâncias: `pg_notify` no MVP; Redis adapter (`@socket.io/redis-adapter`) quando houver > 1 instância — mudança de configuração, não de código.
- Fallback: endpoints REST de leitura para polling (cliente aguardando: 3 s; painel: 5 s) usados quando o socket está desconectado.

## Alternativas
- **Supabase Realtime**: acopla ao provedor e expõe mudanças de tabela em vez de eventos de domínio.
- **Pusher/Ably**: custo e lock-in.
- **SSE**: suficiente, mas Socket.IO dá rooms, reconexão e fallback prontos.

## Consequências
+ Zero dependência externa no MVP.
+ Mesma fonte (outbox) alimenta realtime, auditoria e integrações futuras.
− O processo do API precisa ser persistente (não serverless) — influencia hosting (Fly.io/Railway).
