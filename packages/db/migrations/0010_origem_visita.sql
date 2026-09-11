CREATE TABLE "origem_visita" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"source" text,
	"medium" text,
	"campaign" text,
	"content" text,
	"landing_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "origem_visita_origem_idx" ON "origem_visita" USING btree ("medium","source","created_at");--> statement-breakpoint
CREATE INDEX "origem_visita_quando_idx" ON "origem_visita" USING btree ("created_at");