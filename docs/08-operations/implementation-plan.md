# Plano de Implementação

| Fase | Entrega | Conteúdo | Est. |
|---|---|---|---|
| **0 — Fundação** | Repo, docs, CI, deploy vazio | Monorepo (pnpm + Turborepo), NestJS + Next.js esqueleto, Drizzle + Postgres + RLS + migrations, tenant context, auth de staff, RBAC guards, logs/Sentry, pipeline, staging no ar, suíte de isolamento. | 4–5 d |
| **1 — Admin & Cardápio** | Restaurante configura e imprime QR | Tenants (platform), branding, categorias, produtos, áreas, mesas, QR, convites. Cardápio público SSR. | 5–6 d |
| **2 — Sessão** | Fluxo cliente ↔ operador | Device cookie, ServiceRequest + anti-spam, painel do operador (WS), aprovação/recusa, Session + PIN, join, close, outbox. | 6–8 d |
| **3 — Pedidos** | Operação real | Carrinho, Order/OrderItem, validações, fila + ack, consumo em tempo real, toggle de áreas, cancelamento. | 5–6 d |
| **4 — Garçom + 1 h** | MVP completo | PWA do garçom, abrir/acessar mesa, pedido staff, job de inatividade, resume com 2 opções, "não tenho o PIN", migração de pedido. Hardening e testes de concorrência. | 5–6 d |
| **5 — Piloto** | 1–2 restaurantes | SHOULD-haves conforme fôlego, onboarding, runbook, ajustes do piloto. | 5 d + contínuo |

Total até piloto: ~30–36 dias úteis. Fase 2 vem antes de pedidos deliberadamente: é o coração e o maior risco técnico.

## Status
| Fase | Status | Data |
|---|---|---|
| 0 — Fundação | ✅ concluída | 2026-08-29 |
| 1 — Admin & Cardápio | ✅ concluída (e-mail de convite fica para a fase 5: link é exibido na tela) | 2026-08-29 |
| 2 — Sessão | ✅ concluída (14 testes e2e cobrindo BR-03/04/05/07/08/10/13/14) | 2026-08-29 |
| 3 — Pedidos | ✅ concluída (5 testes e2e: snapshot/idempotência/ack, cozinha fechada, garçom em sessão inativa, continuar/nova sessão com pedido pendente) | 2026-08-29 |
| 4 — Garçom + hardening | ✅ concluída (PWA manifest, rate limit por IP, CSP/headers, 4 testes de concorrência/rate limit; 23 e2e no total). Pendências registradas no threat model: 2FA do super admin, CSP com nonce, política de privacidade | 2026-08-29 |
| 4b — Pendências de segurança | ✅ 2FA TOTP obrigatório para super admin (`mfa.e2e-spec.ts`), CSP com nonce por requisição (middleware + `force-dynamic`), página `/privacidade` | 2026-08-29 |
| 5 — Piloto | 🔧 preparada — `Dockerfile`, `fly.toml` (sem hibernação, volume, health check, migrations no release), `vercel.json`, e-mail de convite via Resend, workflow de deploy por tag, guia `deploy.md` e `09-ux/onboarding.md`. **Aguarda execução pelo dono das contas** (Fly/Vercel/Neon/Resend + DNS) | 2026-08-29 |

## Definition of Done (por fase)
- Testes unitários do domínio para cada BR tocada.
- Suíte de isolamento verde.
- Docs atualizadas (PDR/ADR se houve decisão).
- Deploy em staging funcionando.
