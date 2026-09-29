CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"pkr_paisa" bigint NOT NULL,
	"gold_mg" bigint NOT NULL,
	CONSTRAINT "accounts_pkr_nonneg" CHECK ("accounts"."pkr_paisa" >= 0),
	CONSTRAINT "accounts_gold_nonneg" CHECK ("accounts"."gold_mg" >= 0)
);
--> statement-breakpoint
CREATE TABLE "demo_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"guardrail_paisa" bigint NOT NULL,
	"sim_pakgold_down" boolean DEFAULT false NOT NULL,
	"sim_goldprice_down" boolean DEFAULT false NOT NULL,
	CONSTRAINT "demo_settings_single_row" CHECK ("demo_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"side" text NOT NULL,
	"input_mode" text NOT NULL,
	"pkr_paisa" bigint NOT NULL,
	"gold_mg" bigint NOT NULL,
	"unit_price_paisa_per_gram" bigint NOT NULL,
	"market_paisa_per_gram" bigint NOT NULL,
	"guardrail_applied" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"price_fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quotes_side" CHECK ("quotes"."side" in ('buy','sell')),
	CONSTRAINT "quotes_positive" CHECK ("quotes"."pkr_paisa" > 0 and "quotes"."gold_mg" > 0)
);
--> statement-breakpoint
CREATE TABLE "source_readings" (
	"source" text PRIMARY KEY NOT NULL,
	"price_paisa_per_gram" bigint,
	"source_updated_text" text,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"receipt_seq" bigserial NOT NULL,
	"side" text NOT NULL,
	"pkr_paisa" bigint NOT NULL,
	"gold_mg" bigint NOT NULL,
	"unit_price_paisa_per_gram" bigint NOT NULL,
	"source" text NOT NULL,
	"price_fetched_at" timestamp with time zone NOT NULL,
	"customer_pkr_after" bigint NOT NULL,
	"customer_gold_after" bigint NOT NULL,
	"inventory_gold_after" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trades_quote_id_unique" UNIQUE("quote_id"),
	CONSTRAINT "trades_receipt_seq_unique" UNIQUE("receipt_seq")
);
--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;