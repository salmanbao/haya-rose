import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260817122354 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "payment_provider_config" drop constraint if exists "payment_provider_config_provider_unique";`);
    this.addSql(`create table if not exists "payment_provider_config" ("id" text not null, "provider" text not null, "enabled" boolean not null default false, "environment" text null, "config" jsonb null, "secrets" jsonb null, "last_tested_at" timestamptz null, "last_test_status" text null, "last_test_error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payment_provider_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_provider_config_provider_unique" ON "payment_provider_config" ("provider") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_provider_config_deleted_at" ON "payment_provider_config" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "payment_provider_config_audit" ("id" text not null, "provider" text not null, "action" text not null, "actor" text null, "environment" text null, "changed_fields" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payment_provider_config_audit_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_provider_config_audit_deleted_at" ON "payment_provider_config_audit" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payment_provider_config" cascade;`);

    this.addSql(`drop table if exists "payment_provider_config_audit" cascade;`);
  }

}
