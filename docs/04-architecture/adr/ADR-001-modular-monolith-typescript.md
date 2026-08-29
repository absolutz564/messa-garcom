# ADR-001 — Monólito modular em TypeScript (NestJS + Next.js)

**Status:** aceito · 2026-08-29

## Contexto
MVP para validar produto com 1–5 restaurantes, custo ~zero, um desenvolvedor. Precisa crescer para centenas de tenants sem reescrita do core.

## Decisão
- Um único serviço backend (NestJS sobre Fastify) com módulos de fronteira explícita.
- Um único frontend Next.js com três superfícies (cliente, staff, admin) compartilhando `packages/ui`.
- TypeScript em tudo; contratos compartilhados via `packages/contracts` (zod).
- Domínio puro em `packages/domain`, sem imports de NestJS/Drizzle.

## Alternativas
- **Microserviços**: overhead operacional sem ganho até milhares de tenants.
- **Go no backend**: performance não é gargalo; divide a stack e os contratos.
- **Fastify puro**: menos estrutura; NestJS impõe módulos, DI e guards úteis para RBAC/tenant.
- **Vite SPA**: perde SSR do cardápio (importante em 4G).

## Consequências
+ Um deploy, um repositório, refatoração barata.
+ Mesmo cardápio/carrinho para cliente e garçom (princípio 7).
− Disciplina de fronteiras precisa ser mantida por lint (`eslint-plugin-boundaries`) e revisão.
