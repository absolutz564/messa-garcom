-- ---------------------------------------------------------------------------
-- Messa — Row Level Security (ADR-002, docs/04-architecture/multi-tenancy.md)
--
-- Contexto por transação (SET LOCAL via set_config(..., true)):
--   app.tenant_id  → tenant ativo (staff autenticado, cliente via mesa)
--   app.user_id    → identidade sem tenant (login/refresh/switch)
--   app.platform   → 'true' apenas em /platform/* (auditado na aplicação)
--
-- FORCE RLS faz as políticas valerem também para o owner da tabela, então
-- funciona com uma única role (Neon/Supabase) ou com roles separadas (local).
-- Falha fechada: sem contexto, nenhuma linha é visível.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_platform() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.platform', true), '') = 'true'
$$;
--> statement-breakpoint

-- Roles locais (opcional; ignorado se já existem ou sem permissão, ex. Neon).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'messa_app') THEN
    CREATE ROLE messa_app LOGIN PASSWORD 'messa_app';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'sem permissão para criar role messa_app; usando role atual';
END $$;
--> statement-breakpoint
DO $$
BEGIN
  GRANT USAGE ON SCHEMA public TO messa_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO messa_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO messa_app;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'grants para messa_app ignorados';
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Tabelas com tenant_id: política padrão
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_areas','categories','products','tables','revoked_table_tokens',
    'devices','device_blocks','sessions','session_participants','service_requests',
    'orders','order_items','domain_events','idempotency_keys'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_is_platform() OR tenant_id = app_tenant_id()) WITH CHECK (app_is_platform() OR tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- memberships / staff_devices: também visíveis ao próprio usuário (identidade)
-- ---------------------------------------------------------------------------
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_or_self ON memberships;
--> statement-breakpoint
CREATE POLICY tenant_or_self ON memberships
  USING (app_is_platform() OR tenant_id = app_tenant_id() OR user_id = app_user_id())
  WITH CHECK (app_is_platform() OR tenant_id = app_tenant_id() OR user_id = app_user_id());
--> statement-breakpoint
ALTER TABLE staff_devices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_devices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_or_self ON staff_devices;
--> statement-breakpoint
CREATE POLICY tenant_or_self ON staff_devices
  USING (app_is_platform() OR tenant_id = app_tenant_id() OR user_id = app_user_id())
  WITH CHECK (app_is_platform() OR tenant_id = app_tenant_id() OR user_id = app_user_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- tenants: o próprio tenant, os tenants em que o usuário tem membership, ou platform
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_visibility ON tenants;
--> statement-breakpoint
CREATE POLICY tenant_visibility ON tenants
  USING (
    app_is_platform()
    OR id = app_tenant_id()
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = tenants.id AND m.user_id = app_user_id())
  )
  WITH CHECK (app_is_platform());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- users: tabela global. Leitura por e-mail no login precisa ser sem contexto,
-- então NÃO tem RLS; a aplicação restringe o acesso ao módulo identity.
-- ---------------------------------------------------------------------------
