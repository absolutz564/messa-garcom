# Messa — Garçom Virtual

SaaS B2B multi-tenant para bares e restaurantes. Cliente pede pelo QR da mesa; garçom usa o mesmo motor de pedidos.

## Fonte de verdade
- Regras de negócio: `docs/02-domain/business-rules.md` (BR-xx). Código que contradiga está errado.
- Decisões: `docs/01-product/decisions.md` (PDR) e `docs/04-architecture/adr/` (ADR). Não alterar regra sem registrar.
- Textos de UI: `docs/09-ux/copy.md` ⇄ `packages/contracts/src/i18n/pt-BR.ts`.

## Estrutura
- `apps/api` NestJS (Fastify) — REST, WebSocket, jobs. Módulos em `src/modules/*`; ver `docs/04-architecture/overview.md` para a regra de dependência.
- `apps/web` Next.js — `/t/[token]` cliente, `/staff`, `/admin`, `/platform`.
- `packages/domain` regras puras (sem framework). Toda BR tem teste unitário aqui.
- `packages/db` schema Drizzle + migrations + RLS. Acesso ao banco **somente** via `withTenantTx` / `withPlatformTx`.
- `packages/contracts` zod DTOs, eventos, i18n.

## Regras inegociáveis
1. Todo dado operacional tem `tenant_id`; RLS ligado; nunca usar a conexão crua.
2. Preço, disponibilidade, PIN, anti-spam, 1h: validados no backend. Frontend só antecipa.
3. Mudança de estado de mesa/sessão/request ⇒ `SELECT … FOR UPDATE` na mesa + `DomainEvent` na mesma transação.
4. Payloads de evento nunca contêm PIN.
5. Idioma: docs em pt-BR, código em inglês.

## Comandos
`pnpm db:up` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm test:e2e`
