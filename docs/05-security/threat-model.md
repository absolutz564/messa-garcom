# Threat Model (STRIDE resumido)

## Superfície pública (`/t/{token}`, `/public/*`)
| Ameaça | Vetor | Mitigação |
|---|---|---|
| Enumeração de mesas | adivinhar `public_token` | 71 bits CSPRNG; 404 uniforme; rate limit por IP |
| Spam de solicitações | foto do QR, repetir de casa | BR-03/04: 1 pendente por (mesa, device), bloqueio após 2 recusas, rate limit por mesa; device cookie assinado |
| Contornar bloqueio limpando cookies | novo device | rate limit por mesa (independe de device); operador pode silenciar mesa (SHOULD) |
| Força bruta de PIN | 10 000 combinações | 10 falhas/sessão ⇒ lock 15 min + alerta; 5/device; 120 req/min/IP ⇒ inviável na prática |
| Entrar na comanda de outra mesa | PIN vazado | PIN por sessão, invalidado ao fechar; operador vê participantes; SHOULD: "expulsar participante" |
| Forjar cookie de participante | manipular cookie | HMAC com chave do servidor; cookie carrega `session_id`, servidor verifica status |
| Pedido com preço manipulado | body com preço | preço nunca vem do cliente (BR-11/15) |
| Pedido de item de cozinha fechada | UI antiga | validação no backend (BR-12) |
| Replay de pedido | reenvio | `Idempotency-Key` obrigatório |
| XSS via descrição/nome de produto | admin malicioso/comprometido | escape por padrão (React); CSP estrita; sem HTML rico |

## Superfície staff / admin
| Ameaça | Mitigação |
|---|---|
| Credential stuffing | argon2id; 30 tentativas / 15 min por IP + por conta; sem enumeração de e-mails |
| Refresh token roubado do celular do garçom | rotação com detecção de reuso (invalida família); revogação por dispositivo pelo admin; expira 30 dias |
| Escalada de papel | papel vem da membership no banco a cada refresh; JWT curto |
| Cross-tenant via ID de outro tenant | RLS + repositório com tenant scope + suíte de isolamento |
| Upload malicioso | validação de magic bytes, tamanho ≤ 5 MB, reprocessamento via sharp, nome randômico, servido de domínio de storage |
| CSRF | SameSite=Lax + verificação de `Origin` em mutações |

## Plataforma
| Ameaça | Mitigação |
|---|---|
| Super admin comprometido | 2FA obrigatório (TOTP) para `is_platform_admin`; auditoria de toda ação |
| Segredos vazados | env vars no host; rotação documentada; nenhum segredo no repo (gitleaks no CI) |
| Dependências | Dependabot; `pnpm audit` no CI |

## Checklist antes do piloto
- [x] Suíte de isolamento verde (`tenant-isolation.e2e-spec.ts`)
- [x] Testes de concorrência (`concurrency.e2e-spec.ts`: 5 aprovações simultâneas ⇒ 1 vence; 2 aberturas + 2 solicitações ⇒ 1 sessão; join × close)
- [x] Headers no web: CSP, HSTS (prod), X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy (`next.config.mjs`). Helmet no API.
- [x] Rate limit por IP (`IpRateLimitGuard`, janela deslizante em memória): login 30/15 min, accept-invite 10/15 min, `/public/*` 120/min, join 20/10 min. Testado em e2e. **Ao escalar para >1 instância, trocar o store por Redis.**
- [x] 2FA (TOTP, RFC 6238) obrigatório para `is_platform_admin`: `/platform/*` responde `403 totp_setup_required` até ativar; login exige `totpCode` quando ativo. Segredo cifrado (AES-GCM). Testado em `mfa.e2e-spec.ts`. Recuperação: sem códigos de backup no MVP — reset manual no banco (`totp_enabled_at = null`).
- [x] CSP com nonce por requisição (`apps/web/src/middleware.ts`, `'strict-dynamic'`), sem `'unsafe-inline'` em `script-src`.
- [x] Política de privacidade pública em `/privacidade` (texto em `apps/web/src/app/privacidade/page.tsx`, base em `lgpd.md`) — **revisar com apoio jurídico antes do piloto**.
