# Catálogo de Eventos de Domínio

Todos os eventos são gravados em `domain_events` na mesma transação da mudança de estado e publicados após commit para: realtime (rooms), integrações (futuro). Tipos e payloads em `packages/contracts/src/events.ts`.

Envelope:
```json
{ "id": "uuid", "type": "order.created", "tenant_id": "uuid", "aggregate_type": "order", "aggregate_id": "uuid",
  "actor": { "kind": "customer|staff|system", "id": "uuid?" }, "occurred_at": "iso", "payload": { } }
```

| Tipo | Payload | Rooms |
|---|---|---|
| `request.created` | request, table, type | `tenant` |
| `request.approved` | request, session_id, resolution | `tenant`, `request` |
| `request.rejected` | request | `tenant`, `request` |
| `request.expired` | request | `tenant`, `request` |
| `session.opened` | session (sem PIN), table, opened_by | `tenant` |
| `session.participant_joined` | participant (ordinal) | `tenant`, `session` |
| `session.became_inactive` | session_id | `tenant`, `session` |
| `session.resumed` | session_id | `tenant`, `session` |
| `session.pin_locked` | session_id, until | `tenant` |
| `session.closed` | session_id, reason | `tenant`, `session` |
| `order.created` | order + items, created_by | `tenant`, `session` |
| `order.pending_confirmation` | order, request_id | `tenant`, `session` |
| `order.acknowledged` | order_id | `tenant`, `session` |
| `order.cancelled` | order_id, reason | `tenant`, `session` |
| `service_area.changed` | key, is_open | `tenant`, todas as `session` do tenant |
| `catalog.changed` | (sem payload; cliente refaz fetch) | todas as `session` do tenant |
| `table.changed` | table | `tenant` |
| `tenant.blocked` / `tenant.unblocked` | — | `tenant` |

Regra: payloads nunca incluem PIN. O PIN é obtido por endpoint autenticado (`GET /sessions/{id}` como participante ou staff).

## WebSocket
- Namespace único. Handshake com cookies (cliente) ou `Authorization` (staff).
- Servidor atribui rooms; cliente não pode `join` arbitrário.
- Mensagem `event` com o envelope acima. `ack` não é usado; o estado é sempre reidratado via REST em reconexão.
