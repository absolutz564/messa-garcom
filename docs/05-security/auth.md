# Autenticação e Autorização

Ver ADR-004 para a estratégia. Aqui: a matriz de permissões.

## Papéis
| Papel | Escopo | Como autentica |
|---|---|---|
| `platform_admin` | global | JWT, `is_platform_admin=true` |
| `admin` | tenant | JWT com membership |
| `operator` | tenant | JWT com membership |
| `waiter` | tenant | JWT com membership |
| `customer` | sessão | cookies `messa_device` + `messa_participant` |

## Matriz (MVP)
| Ação | platform | admin | operator | waiter | customer |
|---|:-:|:-:|:-:|:-:|:-:|
| Criar/bloquear tenant | ✔ | | | | |
| Configurar branding, cardápio, mesas, QR | | ✔ | | | |
| Convidar/gerir funcionários, revogar dispositivos | | ✔ | | | |
| Abrir/fechar área de serviço | | ✔ | ✔ | | |
| Ver mapa de mesas | | ✔ | ✔ | ✔ | |
| Aprovar/recusar solicitações | | ✔ | ✔ | | |
| Resolver sessão inativa (nova/continuar) | | ✔ | ✔ | | |
| Encerrar sessão (inclusive forçado) | | ✔ | ✔ | | |
| Marcar pedido "Lançado" | | ✔ | ✔ | | |
| Cancelar pedido | | ✔ | ✔ | | |
| Abrir sessão em mesa livre sem aprovação | | ✔ | ✔ | ✔ | |
| Acessar sessão sem PIN | | ✔ | ✔ | ✔ | |
| Criar pedido | | ✔ | ✔ | ✔ | ✔ (participante) |
| Ver consumo da mesa | | ✔ | ✔ | ✔ | ✔ (própria sessão) |
| Ver PIN da sessão | | ✔ | ✔ | ✔ | ✔ (própria sessão) |
| Solicitar atendimento | | | | | ✔ |
| Entrar com PIN | | | | | ✔ |

Admin herda operator e waiter dentro do próprio tenant. Um usuário pode ter papéis diferentes em tenants diferentes.

## 2FA (TOTP)
- Obrigatório para `platform_admin`: sem 2FA ativo, o login funciona mas `/platform/*` responde `403 totp_setup_required`; o web redireciona para `/staff/2fa`.
- Fluxo: `POST /auth/2fa/setup` (gera segredo + QR `otpauth://`) → `POST /auth/2fa/enable {code}` (valida e reemite tokens com claim `mfa: true`).
- Login com 2FA ativo exige `totpCode`; sem ele → `401 totp_required`; errado → `401 totp_invalid`.
- Opcional para admin/operador/garçom (mesmos endpoints). Sem códigos de backup no MVP.

## Tokens e cookies
| Nome | Tipo | Duração | Conteúdo |
|---|---|---|---|
| access token | JWT (HS256 no MVP; RS256 quando houver >1 serviço) | 15 min | `sub, tenant_id, role, is_platform_admin, jti` |
| `messa_refresh` | cookie HttpOnly, opaco, rotativo | 30 dias | id de `StaffDevice` + segredo |
| `messa_device` | cookie HttpOnly assinado | 365 dias | `device_id, tenant_id` |
| `messa_participant` | cookie HttpOnly assinado | até `session.closed` | `participant_id, session_id, tenant_id` |

Todos: `Secure; HttpOnly; SameSite=Lax; Path=/`. Domínio único (`messa-garcom.com.br`).

## Rate limits (por ordem de aplicação)
1. Regras de domínio (DeviceBlock, rate por mesa, PIN por sessão) — BR-03/04/07.
2. Por device: PIN 5 falhas / 10 min; solicitações 3 / 10 min.
3. Por IP (última linha): 120 req/min em `/public`, 30 tentativas de login / 15 min.
