ALTER TABLE "origem_link" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "origem_link_slug_uq" ON "origem_link" USING btree ("slug");