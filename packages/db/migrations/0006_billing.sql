CREATE TABLE "pix_charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_charge_id" text NOT NULL,
	"plan" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"qr_code" text NOT NULL,
	"qr_code_base64" text,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pix_charges_plan_chk" CHECK ("pix_charges"."plan" IN ('monthly','semiannual','annual')),
	CONSTRAINT "pix_charges_status_chk" CHECK ("pix_charges"."status" IN ('pending','paid','expired'))
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_status" text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_plan" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "subscription_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pix_charges" ADD CONSTRAINT "pix_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pix_charges_tenant_status_idx" ON "pix_charges" USING btree ("tenant_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "pix_charges_pending_idx" ON "pix_charges" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_billing_status_chk" CHECK ("tenants"."billing_status" IN ('trial','active'));--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_billing_plan_chk" CHECK ("tenants"."billing_plan" IS NULL OR "tenants"."billing_plan" IN ('monthly','semiannual','annual'));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- PDR-017/ADR-006: tenants criados antes deste controle migram sem prazo
-- (subscription_ends_at NULL ⇒ nunca bloqueia por cobrança — mesma proteção
-- documentada no evaluateAccess do Terap-IA Kids). O default 'trial' da coluna
-- vale só para tenants novos, criados pela aplicação já com trial_ends_at setado.
-- ---------------------------------------------------------------------------
UPDATE "tenants" SET "billing_status" = 'active' WHERE "billing_status" = 'trial';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS para pix_charges (mesmo padrão de 0001_rls.sql — tabela nova, não coberta
-- pelo loop original).
-- ---------------------------------------------------------------------------
ALTER TABLE "pix_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pix_charges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "pix_charges";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "pix_charges" USING (app_is_platform() OR tenant_id = app_tenant_id()) WITH CHECK (app_is_platform() OR tenant_id = app_tenant_id());