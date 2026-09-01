CREATE TABLE "origem_atribuicao" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"first_channel" text NOT NULL,
	"first_source" text,
	"first_medium" text,
	"first_campaign" text,
	"first_content" text,
	"first_term" text,
	"first_click_id" text,
	"first_click_id_kind" text,
	"first_landing_path" text,
	"first_referrer_host" text,
	"first_at" timestamp with time zone,
	"last_channel" text NOT NULL,
	"last_source" text,
	"last_medium" text,
	"last_campaign" text,
	"last_content" text,
	"last_term" text,
	"last_click_id" text,
	"last_click_id_kind" text,
	"last_landing_path" text,
	"last_referrer_host" text,
	"last_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "origem_evento" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"name" text NOT NULL,
	"value" numeric(12, 2),
	"currency" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "origem_gasto" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"source" text NOT NULL,
	"campaign" text,
	"content" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "origem_link" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"source" text NOT NULL,
	"campaign" text NOT NULL,
	"content" text,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "origem_atribuicao_subject_uq" ON "origem_atribuicao" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "origem_atribuicao_last_channel_idx" ON "origem_atribuicao" USING btree ("last_channel","created_at");--> statement-breakpoint
CREATE INDEX "origem_atribuicao_first_channel_idx" ON "origem_atribuicao" USING btree ("first_channel","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "origem_evento_subject_name_uq" ON "origem_evento" USING btree ("subject_type","subject_id","name");--> statement-breakpoint
CREATE INDEX "origem_evento_name_idx" ON "origem_evento" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "origem_gasto_periodo_idx" ON "origem_gasto" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "origem_gasto_canal_idx" ON "origem_gasto" USING btree ("channel","source");--> statement-breakpoint
CREATE INDEX "origem_link_source_campaign_idx" ON "origem_link" USING btree ("source","campaign");--> statement-breakpoint

-- Gerar o mesmo link duas vezes não pode criar duas entradas na lista. COALESCE
-- porque NULL não se compara a NULL em índice único do Postgres, e sem isso todo
-- link sem criativo entraria de novo a cada geração. O Drizzle não expressa
-- índice sobre expressão, então esta linha é escrita à mão.
CREATE UNIQUE INDEX IF NOT EXISTS "origem_link_identidade_uq"
  ON "origem_link" ("source", "campaign", COALESCE("content", ''));
