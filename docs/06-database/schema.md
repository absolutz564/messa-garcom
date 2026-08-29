# Schema do Banco

Fonte de verdade: `packages/db/src/schema/*.ts` (Drizzle). Esta página resume decisões que o código não explica sozinho.

## Convenções
- Nomes de tabela no plural, snake_case. PK `id uuid` (v7). `created_at timestamptz default now()`.
- Toda tabela operacional: `tenant_id uuid NOT NULL REFERENCES tenants(id)`. Índice composto começa por `tenant_id`.
- Dinheiro em `integer` (centavos). Sem `float`.
- Enums como `text` + `CHECK` (migrations mais simples que `ENUM` nativo).
- Soft delete apenas em `products` (referenciados por `order_items`).

## Tabelas e índices notáveis
| Tabela | Constraint / índice | Motivo |
|---|---|---|
| `tables` | `UNIQUE(public_token)` global | URL do QR sem tenant |
| `tables` | `UNIQUE(tenant_id, display_name)` | evitar duas "Mesa 38" |
| `sessions` | `UNIQUE(table_id) WHERE status IN ('active','inactive')` | 1 sessão viva por mesa |
| `service_requests` | `UNIQUE(table_id, device_id) WHERE status='pending'` | BR-03 (idempotência) |
| `service_requests` | `INDEX(table_id, created_at) WHERE status='rejected'` | BR-04 (contar recusas) |
| `device_blocks` | `INDEX(table_id, device_id, blocked_until)` | BR-03 |
| `session_participants` | `UNIQUE(session_id, device_id)`, `UNIQUE(session_id, ordinal)` | "Cliente N" |
| `orders` | `UNIQUE(session_id, sequence_no)` | numeração por sessão |
| `orders` | `INDEX(tenant_id, status, created_at)` | fila do operador |
| `domain_events` | `INDEX(published_at) WHERE published_at IS NULL` | publisher |
| `idempotency_keys` | `PRIMARY KEY(tenant_id, scope, key)` | RNF-16 |
| `service_areas` | `UNIQUE(tenant_id, key)` | `kitchen`, `bar` fixos no MVP |
| `memberships` | `UNIQUE(tenant_id, user_id)` | |

## RLS
Implementado em `packages/db/migrations/0001_rls.sql`. Todas as tabelas com `tenant_id` (inclusive `domain_events`, `idempotency_keys`) têm política `app_is_platform() OR tenant_id = app_tenant_id()`. `memberships` e `staff_devices` também aceitam `user_id = app_user_id()` (login/refresh). `tenants` é visível ao próprio tenant, aos tenants do usuário autenticado ou à plataforma; escrita permitida ao próprio tenant (branding) e à plataforma (migration `0002`). `users` não tem RLS (leitura por e-mail no login) — só o módulo `identity` a acessa.

O bypass de plataforma é um *setting de transação* (`app.platform = 'true'`), não uma role de banco: portável para Neon/Supabase (role única) e auditado na aplicação (`withPlatformTx` só é chamado por `/platform/*` e pelo publisher da outbox).

Roles locais (docker): `messa` (owner/migrator) e `messa_app` (DML, sem BYPASSRLS). Em produção com role única, `FORCE ROW LEVEL SECURITY` garante que as políticas valem também para o owner.

## Jobs
| Job | Frequência | SQL essencial |
|---|---|---|
| inatividade | 60 s | `UPDATE sessions SET status='inactive' WHERE status='active' AND last_activity_at < now() - interval '1 hour'` (por tenant, com evento) |
| expirar requests | 60 s | `status='pending' AND expires_at < now()` ⇒ `expired` |
| limpar device_blocks | 1 h | `blocked_until < now() - interval '1 day'` |
| retenção de devices | diário | `last_seen_at < now() - interval '365 days'` |
| encerramento diário (PDR-013) | por tenant, se configurado | `inactive` ⇒ `closed(daily_auto)` |

## Migrations
- `drizzle-kit generate` gera SQL versionado em `packages/db/migrations`. Revisado em PR.
- RLS e roles ficam em migrations SQL manuais (`0001_rls.sql`), não geradas.
- Nunca editar migration aplicada em staging/prod.
