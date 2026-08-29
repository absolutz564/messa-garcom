# Ambientes e Operação

## Ambientes
| Ambiente | API | Web | DB | Uso |
|---|---|---|---|---|
| local | `pnpm dev` | `pnpm dev` | Docker Postgres 16 | desenvolvimento |
| staging | Fly.io (1 shared-cpu) | Vercel preview | Neon branch | validação antes de prod |
| prod | Fly.io (1 shared-cpu, escala depois) | Vercel prod | Neon main | pilotos |

### Local sem Docker (máquinas sem WSL2 / virtualização)
`pnpm db:local` sobe um Postgres 18 embutido (`embedded-postgres`, binário baixado pelo npm) em `infra/.pgdata`, com as mesmas credenciais do docker-compose. Depois: `pnpm --filter @messa/db createdb` (cria o banco em UTF-8), `pnpm db:migrate`, `pnpm db:seed`.

Limitação do Windows: o Postgres se recusa a rodar num shell **com privilégios de administrador**. Nesse caso, inicie o servidor com token restrito:
```
runas /trustlevel:0x20000 "cmd /c <caminho>\pg_ctl.exe -D <repo>\infra\.pgdata -l <repo>\infra\.pgdata\server.log -o \"-p 5432\" start"
```
(`pg_ctl.exe` fica em `node_modules/.pnpm/@embedded-postgres+windows-x64*/node_modules/@embedded-postgres/windows-x64/native/bin/`). Use caminhos 8.3 (`dir /x`) se o caminho tiver acentos.

## Custos estimados (MVP)
| Serviço | Plano | Custo |
|---|---|---|
| Fly.io API | shared-cpu-1x 256 MB | ~US$ 2–5/mês (ou free allowance) |
| Vercel | Hobby | 0 |
| Neon | Free (0,5 GB, autosuspend) — configurar `suspend_timeout` alto ou migrar para Supabase se cold start incomodar | 0 |
| Cloudflare R2 | 10 GB free | 0 |
| Sentry | Developer | 0 |
| Better Stack / Axiom logs | free | 0 |
| Resend | 3 000 e-mails/mês | 0 |
| Domínio `messa-garcom.com.br` | registro.br | ~R$ 40/ano |

## Deploy
Passo a passo completo em [deploy.md](deploy.md). Lição do incidente `comparador-fichas.fly.dev` (2026-08): o app hibernava (`min_machines_running = 0`, `auto_stop_machines`) e guardava estado em memória — parecia "fora do ar". O Messa usa `auto_stop_machines = "off"`, `min_machines_running = 1`, health check em `/ready` e zero estado em memória.
- GitHub Actions: `ci.yml` (`typecheck → test → migrate → e2e → build`) em PRs e `main`; `deploy-api.yml` em tags `v*` ⇒ `fly deploy`. Web: Vercel a cada push em `main`.
- Migrations rodam como release step antes do novo processo subir (`drizzle-kit migrate`). Migrations devem ser **backward-compatible** (expand/contract) porque a versão antiga ainda roda por alguns segundos.
- Janela de deploy em prod: **fora de 18h–02h** (horário de bar).

## Observabilidade
- Logs: pino JSON com `request_id`, `tenant_id`, `actor`, `session_id`. Sem PII.
- Erros: Sentry (API e web) com `tenant_id` como tag.
- Métricas de negócio (contadores expostos em `/metrics` e logados): `requests_created`, `requests_approved`, `requests_rejected`, `devices_blocked`, `sessions_opened`, `sessions_closed`, `orders_created`, `orders_acknowledged`, `orders_unacknowledged_over_10min` (alerta).
- Health: `/health` (liveness) e `/ready` (DB + publisher).
- OpenTelemetry instrumentação básica desde a fase 0; exporter só quando compensar.

## Runbook (inicial)
| Sintoma | Ação |
|---|---|
| Operador não recebe solicitações | verificar `/ready`, reconexão WS no painel (indicador visual), fallback polling ativo? |
| Banco "dormindo" (Neon) | primeira query lenta; aumentar `suspend_timeout` ou pingar via cron |
| Pedidos não lançados acumulando | alerta `orders_unacknowledged_over_10min`; contato com o restaurante |
| Cliente preso em "aguardando" | request expira em 10 min; verificar job de expiração |
