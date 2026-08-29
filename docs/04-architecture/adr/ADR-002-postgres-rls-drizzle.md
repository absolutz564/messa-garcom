# ADR-002 — PostgreSQL com Row Level Security + Drizzle

**Status:** aceito · 2026-08-29

## Contexto
Isolamento entre tenants é o requisito não funcional mais crítico (RNF-01). Regras de concorrência (uma sessão viva por mesa, uma request pendente por device/mesa) precisam de garantia no banco.

## Decisão
- PostgreSQL. Todas as tabelas operacionais têm `tenant_id NOT NULL`.
- RLS habilitado em todas elas; política `tenant_id = current_setting('app.tenant_id')::uuid`.
- A aplicação conecta com role sem `BYPASSRLS` (`messa_app` local; role única em Neon). `FORCE ROW LEVEL SECURITY` faz as políticas valerem também para o owner. Cada transação inicia com `set_config('app.tenant_id', …, true)`.
- Super Admin usa `set_config('app.platform', 'true', true)` (bypass por transação, auditado na aplicação) em vez de uma role de banco separada — portável para provedores com role única.
- Constraints parciais: `UNIQUE(table_id) WHERE status IN ('active','inactive')` em `sessions`; `UNIQUE(table_id, device_id) WHERE status='pending'` em `service_requests`.
- Drizzle como ORM: SQL-first, migrations legíveis, `SET LOCAL` trivial, sem problemas de pooling.
- UUID v7 como chave primária.

## Alternativas
- **Schema por tenant**: migrations × N, ruim para milhares de tenants.
- **Banco por tenant**: só justificável para enterprise; futuro, se necessário.
- **Prisma**: RLS desajeitado, pooling em serverless problemático.
- **Apenas filtro na aplicação**: uma única query esquecida vaza dados. Duas camadas são obrigatórias.

## Consequências
+ Vazamento entre tenants exige falha simultânea de duas camadas.
+ Invariantes de concorrência garantidas mesmo com bug na aplicação.
− Todo código de acesso a dados passa por um helper de transação que seta o tenant; é proibido usar a conexão crua.
− Testes de isolamento fazem parte do CI (obrigatório).
