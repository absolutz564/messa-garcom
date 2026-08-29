# Messa — Garçom Virtual

> Um garçom virtual que trabalha junto com a equipe do restaurante.

SaaS B2B multi-tenant: o cliente escaneia o QR da mesa, é liberado pelo caixa, entra numa sessão com PIN e faz pedidos pelo celular. O garçom usa o mesmo motor de pedidos para atender quem prefere atendimento humano.

Documentação completa em [docs/](docs/README.md).

## Rodando localmente
```bash
cp .env.example .env
pnpm install
pnpm db:up          # Postgres 16 em Docker  (sem Docker: pnpm db:local — ver docs/08-operations/environments.md)
pnpm db:migrate     # schema + RLS
pnpm db:seed        # tenant demo + usuários (senha: messa123)
pnpm dev            # api :3001, web :3000
```

Usuários do seed: `platform@messa.local` (super admin), `admin@bardojoao.local`, `caixa@bardojoao.local`, `garcom@bardojoao.local`.

## Verificação
```bash
pnpm test                          # domínio (vitest) + api (jest)
pnpm --filter @messa/api test:e2e  # suíte de isolamento de tenant (precisa do banco)
pnpm typecheck && pnpm build
```

## Estrutura
```
apps/api        NestJS — REST + WebSocket + jobs
apps/web        Next.js — cliente, staff, admin, platform
packages/domain regras de negócio puras
packages/db     Drizzle schema, migrations, RLS
packages/contracts  DTOs zod, eventos, i18n
docs/           visão, requisitos, domínio, fluxos, arquitetura, segurança
```
