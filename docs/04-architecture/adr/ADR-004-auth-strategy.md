# ADR-004 — Autenticação própria para staff; cookies anônimos para cliente

**Status:** aceito · 2026-08-29

## Contexto
Staff tem papéis por tenant (um usuário pode pertencer a vários). Cliente não deve criar conta nem fornecer dados pessoais (LGPD, princípio 12). Garçom usa o celular pessoal (PDR-011).

## Decisão
**Staff**
- E-mail + senha (argon2id). Access token JWT de 15 min contendo `sub`, `tenant_id`, `role`, `is_platform_admin`.
- Refresh token opaco, rotativo, 30 dias, em cookie HttpOnly, persistido como `StaffDevice` (hash) — permite revogação por dispositivo pelo admin.
- Troca de tenant (usuário com várias memberships) = novo access token.
- WebAuthn (biometria) como desbloqueio rápido: SHOULD.

**Cliente**
- `messa_device`: cookie HttpOnly, assinado (HMAC), 1 ano, contém `device_id` + `tenant_id`. Emitido no primeiro `GET /public/tables/{token}`.
- `messa_participant`: cookie HttpOnly, assinado, contém `participant_id` + `session_id`; validade = vida da sessão.
- Nenhum dado pessoal. Sem fingerprinting.

**Autorização**
- Guards NestJS: `@Roles('admin' | 'operator' | 'waiter')`, `@PlatformAdmin()`, `@Participant()`.
- Matriz completa em `05-security/auth.md`.

## Alternativas
- **Supabase Auth / Clerk / Auth0**: multi-tenant com papéis por tenant exige customização; cria dependência no core; free tiers limitam MAUs quando houver muitos garçons.
- **Sessões server-side para staff**: viável, mas JWT curto + refresh dá o mesmo resultado sem tabela de sessão quente.

## Consequências
+ Controle total, zero lock-in, RBAC multi-tenant natural.
− Precisamos implementar reset de senha, convites e rotação de refresh com cuidado (lista em `05-security/threat-model.md`).
