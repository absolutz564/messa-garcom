# Arquitetura — Visão Geral

## Princípio
**Monólito modular, um deploy, fronteiras explícitas.** Microserviços agora seriam complexidade sem necessidade (princípio 10). Módulos só se falam por interfaces públicas e eventos, o que permite extração futura — normalmente desnecessária até milhares de tenants.

## Estrutura do repositório
```
apps/
  api/            NestJS — REST + WebSocket + jobs
  web/            Next.js — /t/[token] (cliente), /staff (operador+garçom), /admin, /platform (super admin)
packages/
  domain/         entidades, regras (BR-xx), máquinas de estado — zero dependência de framework
  db/             schema Drizzle, migrations, políticas RLS, seed
  contracts/      DTOs e schemas zod compartilhados (API ↔ web), catálogo de eventos
  ui/             componentes compartilhados (cardápio/carrinho usados por cliente E garçom)
docs/
infra/            docker-compose (dev), Dockerfile, fly.toml
```

## Módulos do backend (`apps/api/src/modules`)
| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `platform` | tenants, super admin | — |
| `identity` | users, memberships, auth de staff, StaffDevice | platform |
| `catalog` | categorias, produtos, áreas de serviço, upload de imagens | platform |
| `tables` | mesas, tokens, QR | platform |
| `presence` | Device (cookie anônimo), DeviceBlock, rate limits | tables |
| `service` | ServiceRequest, Session, SessionParticipant, PIN, job de inatividade | tables, presence, identity |
| `ordering` | Order, OrderItem, validação, ack/cancel | service, catalog |
| `events` | outbox, publicação, realtime gateway | — (todos publicam nele) |
| `integrations` | dispatcher + adapters (vazio no MVP) | events |

Regra de dependência: setas apenas para baixo na tabela; `events` é transversal. Módulos expõem *services*; nunca importam repositórios de outro módulo.

## Stack
| Camada | Escolha | ADR |
|---|---|---|
| Linguagem | TypeScript ponta a ponta | ADR-001 |
| Backend | NestJS + Fastify adapter | ADR-001 |
| ORM | Drizzle | ADR-002 |
| Banco | PostgreSQL (Neon/Supabase free) com RLS | ADR-002 |
| Frontend | Next.js App Router + Tailwind + shadcn/ui, PWA para staff | ADR-001 |
| Auth staff | próprio: argon2id, JWT 15 min + refresh rotativo em cookie | ADR-004 |
| Auth cliente | cookies assinados `messa_device` / `messa_participant` | ADR-004 |
| Realtime | Socket.IO no API; bus = Postgres LISTEN/NOTIFY → Redis adapter quando >1 instância | ADR-003 |
| Jobs | `@nestjs/schedule` (1h, expiração, diário) | — |
| Storage | Cloudflare R2 (presigned upload, sharp no resize) | — |
| QR | `qrcode` (SVG/PNG); `pdf-lib` em lote | — |
| Hosting | API: Fly.io (processo persistente p/ WS); Web: Vercel; DB: Neon | 08-operations |
| Observabilidade | pino JSON, Sentry, OpenTelemetry | 08-operations |
| CI/CD | GitHub Actions | — |
| E-mail | Resend | — |

## Superfícies e autenticação
| Superfície | Rota | Ator | Credencial |
|---|---|---|---|
| Cardápio/sessão | `/t/{token}` | cliente | cookie device + participant |
| Staff | `/staff/*` | operator, waiter, admin | JWT (membership) |
| Admin do restaurante | `/admin/*` | admin | JWT (membership admin) |
| Plataforma | `/platform/*` | super admin | JWT (`is_platform_admin`) |

## Caminho de escala (sem tocar no domínio)
| Fase | Tenants | Mudança |
|---|---|---|
| MVP | 1–5 | 1 instância API, Neon free, LISTEN/NOTIFY |
| Tração | 10–50 | 2+ instâncias + Redis (Upstash) para Socket.IO adapter e rate limit distribuído |
| Crescimento | 100–500 | Read replica; cache do cardápio por tenant em CDN com invalidação por evento; BullMQ para integrações; partição mensal de `orders`/`domain_events` |
| Escala | 1000+ | Extrair `integrations`; sharding por tenant (mecânico graças a `tenant_id` em tudo) |
