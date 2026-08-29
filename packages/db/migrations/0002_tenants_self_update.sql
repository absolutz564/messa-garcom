-- Admin do restaurante pode atualizar o próprio tenant (branding, RF-10).
-- USING permanece: próprio tenant, tenants do usuário, ou plataforma.
DROP POLICY IF EXISTS tenant_visibility ON tenants;
--> statement-breakpoint
CREATE POLICY tenant_visibility ON tenants
  USING (
    app_is_platform()
    OR id = app_tenant_id()
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = tenants.id AND m.user_id = app_user_id())
  )
  WITH CHECK (app_is_platform() OR id = app_tenant_id());
