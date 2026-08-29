# Multi-tenancy

## Resolução do tenant
| Ator | Fonte do `tenant_id` |
|---|---|
| Staff | claim do JWT (nunca de parâmetro de rota/body) |
| Cliente | resolvido a partir de `public_token` da mesa ou do cookie `messa_participant` |
| Super Admin | explícito na rota `/platform/tenants/{id}/…`, com role de banco `messa_platform` e auditoria |

Não usamos subdomínio por tenant no MVP (`slug` reservado para vanity URL futura).

## Contexto de requisição
Middleware coloca `{tenantId, actor}` em `AsyncLocalStorage`. O helper `withTenantTx(fn)`:
1. abre transação;
2. `SET LOCAL app.tenant_id = $1`;
3. executa `fn(tx)`;
4. commit; publica eventos da outbox.

É **proibido** usar a conexão sem passar por `withTenantTx` / `withPlatformTx`. Lint customizado bloqueia import direto do client Drizzle fora de `packages/db`.

## RLS
Implementação real em `packages/db/migrations/0001_rls.sql`. Contexto por transação via `set_config(..., true)`:

| Setting | Quem seta | Efeito |
|---|---|---|
| `app.tenant_id` | `withTenantTx` | política padrão: `tenant_id = app_tenant_id()` |
| `app.user_id` | `withUserTx` (login/refresh/switch) | `memberships`, `staff_devices` e `tenants` do próprio usuário |
| `app.platform = 'true'` | `withPlatformTx` (somente `/platform/*` e publisher da outbox) | bypass, auditado na aplicação |

`FORCE ROW LEVEL SECURITY` faz as políticas valerem também para o owner — funciona com role única (Neon) ou roles separadas (local). Sem contexto: nenhuma linha (falha fechada). `users` é a única tabela operacional sem RLS (leitura por e-mail no login); só o módulo `identity` a acessa.

Forma geral das políticas:
```sql
ALTER TABLE t ENABLE ROW LEVEL SECURITY;
ALTER TABLE t FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON t
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
`current_setting(..., true)` retorna NULL quando não setado ⇒ nenhuma linha visível. Falha fechada.

## Chaves e tokens
- PK: UUID v7 (ordenável, não enumerável).
- `public_token`: 12 chars base62 (~71 bits) via CSPRNG; único global (não por tenant) para que a URL não precise do tenant.

## Testes obrigatórios (CI)
Suíte `tenant-isolation.e2e`: cria tenants A e B com dados, autentica como A e chama **todos** os endpoints com IDs de B. Esperado: 404 (nunca 403 que confirme existência, nunca 200). Roda a cada PR.
