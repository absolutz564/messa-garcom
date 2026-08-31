/**
 * Messa — schema Drizzle.
 * Fonte de verdade estrutural; decisões explicadas em docs/06-database/schema.md.
 * Dinheiro em centavos (integer). Enums como text + CHECK. UUID v7 gerado na aplicação.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Plataforma / identidade
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    primaryColor: text('primary_color').notNull().default('#e11d48'),
    /** Bloqueio manual do Super Admin (abuso/fraude) — nunca escrito pelo módulo de cobrança (BR-20/ADR-006). */
    status: text('status').notNull().default('active'),
    settings: jsonb('settings').notNull().default({}),
    createdAt: createdAt(),
    /** BR-20 — cobrança da assinatura. Nunca persiste "past_due"/bloqueado: é sempre calculado na leitura. */
    billingStatus: text('billing_status').notNull().default('trial'),
    billingPlan: text('billing_plan'),
    trialEndsAt: ts('trial_ends_at'),
    subscriptionEndsAt: ts('subscription_ends_at'),
  },
  (t) => [
    uniqueIndex('tenants_slug_uq').on(t.slug),
    check('tenants_status_chk', sql`${t.status} IN ('active','blocked')`),
    check('tenants_billing_status_chk', sql`${t.billingStatus} IN ('trial','active')`),
    check('tenants_billing_plan_chk', sql`${t.billingPlan} IS NULL OR ${t.billingPlan} IN ('monthly','semiannual','annual')`),
  ],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    name: text('name').notNull(),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    /** 2FA (TOTP) — obrigatório para platform admin (threat-model). Segredo cifrado com a chave do servidor. */
    totpSecretEncrypted: text('totp_secret_encrypted'),
    totpEnabledAt: ts('totp_enabled_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(),
    status: text('status').notNull().default('invited'),
    inviteTokenHash: text('invite_token_hash'),
    invitedAt: ts('invited_at').defaultNow(),
    acceptedAt: ts('accepted_at'),
  },
  (t) => [
    uniqueIndex('memberships_tenant_user_uq').on(t.tenantId, t.userId),
    check('memberships_role_chk', sql`${t.role} IN ('admin','operator','waiter')`),
    check('memberships_status_chk', sql`${t.status} IN ('invited','active','disabled')`),
  ],
);

/** Sessão longa de staff (refresh token rotativo) — PDR-011. */
export const staffDevices = pgTable(
  'staff_devices',
  {
    id: id(),
    /** Null para platform admin sem tenant ativo. */
    tenantId: uuid('tenant_id').references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    family: uuid('family').notNull(),
    label: text('label'),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [index('staff_devices_user_idx').on(t.tenantId, t.userId)],
);

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const serviceAreas = pgTable(
  'service_areas',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: text('key').notNull(),
    name: text('name').notNull(),
    isOpen: boolean('is_open').notNull().default(true),
    changedAt: ts('changed_at'),
    changedByUserId: uuid('changed_by_user_id'),
  },
  (t) => [
    uniqueIndex('service_areas_tenant_key_uq').on(t.tenantId, t.key),
    check('service_areas_key_chk', sql`${t.key} IN ('kitchen','bar')`),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('categories_tenant_idx').on(t.tenantId, t.sortOrder)],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    serviceAreaId: uuid('service_area_id')
      .notNull()
      .references(() => serviceAreas.id),
    name: text('name').notNull(),
    /** Opcional (§18). Ingredientes, peso, acompanhamentos… */
    description: text('description'),
    priceCents: integer('price_cents').notNull(),
    imageUrl: text('image_url'),
    isAvailable: boolean('is_available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('products_tenant_cat_idx').on(t.tenantId, t.categoryId, t.sortOrder),
    check('products_price_chk', sql`${t.priceCents} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Mesas
// ---------------------------------------------------------------------------

export const tables = pgTable(
  'tables',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    displayName: text('display_name').notNull(),
    /** Token opaco do QR — global, permanente, desacoplado do nome (RF-21). */
    publicToken: text('public_token').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('tables_public_token_uq').on(t.publicToken),
    uniqueIndex('tables_tenant_name_uq').on(t.tenantId, t.displayName),
  ],
);

export const revokedTableTokens = pgTable('revoked_table_tokens', {
  token: text('token').primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  tableId: uuid('table_id')
    .notNull()
    .references(() => tables.id),
  revokedAt: ts('revoked_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Presença (dispositivo anônimo) e anti-spam
// ---------------------------------------------------------------------------

export const devices = pgTable(
  'devices',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [index('devices_tenant_last_seen_idx').on(t.tenantId, t.lastSeenAt)],
);

export const deviceBlocks = pgTable(
  'device_blocks',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    blockedUntil: ts('blocked_until').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('device_blocks_lookup_idx').on(t.tableId, t.deviceId, t.blockedUntil)],
);

// ---------------------------------------------------------------------------
// Sessão de atendimento
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id),
    status: text('status').notNull().default('active'),
    /** PIN cifrado (AES-256-GCM) — PDR-005. */
    pinEncrypted: text('pin_encrypted').notNull(),
    pinFailedAttempts: integer('pin_failed_attempts').notNull().default(0),
    pinLockedUntil: ts('pin_locked_until'),
    openedAt: ts('opened_at').notNull().defaultNow(),
    openedBy: text('opened_by').notNull(),
    openedByUserId: uuid('opened_by_user_id'),
    lastActivityAt: ts('last_activity_at').notNull().defaultNow(),
    /** Pedido de conta (RF-68): solicitado pelo cliente, confirmado pelo staff. Não encerra a sessão. */
    billRequestedAt: ts('bill_requested_at'),
    billRequestedByParticipantId: uuid('bill_requested_by_participant_id'),
    billAcknowledgedAt: ts('bill_acknowledged_at'),
    closedAt: ts('closed_at'),
    closedByUserId: uuid('closed_by_user_id'),
    closeReason: text('close_reason'),
  },
  (t) => [
    /** Uma sessão viva por mesa (BR-16). */
    uniqueIndex('sessions_one_live_per_table_uq')
      .on(t.tableId)
      .where(sql`${t.status} IN ('active','inactive')`),
    index('sessions_tenant_status_idx').on(t.tenantId, t.status, t.lastActivityAt),
    check('sessions_status_chk', sql`${t.status} IN ('active','inactive','closed')`),
    check('sessions_opened_by_chk', sql`${t.openedBy} IN ('operator','waiter')`),
  ],
);

export const sessionParticipants = pgTable(
  'session_participants',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    /** "Cliente N" — PDR-012. */
    ordinal: integer('ordinal').notNull(),
    /** Primeiro nome/apelido opcional (PDR-012 rev. 2026-08-29); apagado ao encerrar a sessão (LGPD). */
    displayName: text('display_name'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
    joinedVia: text('joined_via').notNull(),
  },
  (t) => [
    uniqueIndex('session_participants_session_device_uq').on(t.sessionId, t.deviceId),
    uniqueIndex('session_participants_session_ordinal_uq').on(t.sessionId, t.ordinal),
    check('session_participants_via_chk', sql`${t.joinedVia} IN ('approval','pin','migrated')`),
  ],
);

export const serviceRequests = pgTable(
  'service_requests',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    type: text('type').notNull(),
    status: text('status').notNull().default('pending'),
    sessionId: uuid('session_id').references(() => sessions.id),
    pendingOrderId: uuid('pending_order_id'),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
    resolvedAt: ts('resolved_at'),
    resolvedByUserId: uuid('resolved_by_user_id'),
    resolution: text('resolution'),
  },
  (t) => [
    /** Uma pendente por (mesa, dispositivo) — BR-03. */
    uniqueIndex('service_requests_one_pending_uq')
      .on(t.tableId, t.deviceId)
      .where(sql`${t.status} = 'pending'`),
    index('service_requests_rejected_idx')
      .on(t.tableId, t.deviceId, t.createdAt)
      .where(sql`${t.status} = 'rejected'`),
    index('service_requests_tenant_pending_idx')
      .on(t.tenantId, t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    check('service_requests_type_chk', sql`${t.type} IN ('open_session','resume_session')`),
    check(
      'service_requests_status_chk',
      sql`${t.status} IN ('pending','approved','rejected','expired','cancelled')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    sequenceNo: integer('sequence_no').notNull(),
    status: text('status').notNull(),
    createdByKind: text('created_by_kind').notNull(),
    participantId: uuid('participant_id').references(() => sessionParticipants.id),
    userId: uuid('user_id').references(() => users.id),
    totalCents: integer('total_cents').notNull(),
    createdAt: createdAt(),
    acknowledgedAt: ts('acknowledged_at'),
    acknowledgedByUserId: uuid('acknowledged_by_user_id'),
    cancelledAt: ts('cancelled_at'),
    cancelledByUserId: uuid('cancelled_by_user_id'),
    cancelReason: text('cancel_reason'),
  },
  (t) => [
    uniqueIndex('orders_session_seq_uq').on(t.sessionId, t.sequenceNo),
    index('orders_tenant_status_idx').on(t.tenantId, t.status, t.createdAt),
    check(
      'orders_status_chk',
      sql`${t.status} IN ('pending_confirmation','submitted','acknowledged','cancelled')`,
    ),
    check('orders_created_by_chk', sql`${t.createdByKind} IN ('customer','staff')`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    productNameSnapshot: text('product_name_snapshot').notNull(),
    unitPriceCentsSnapshot: integer('unit_price_cents_snapshot').notNull(),
    quantity: integer('quantity').notNull(),
    notes: text('notes'),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    check('order_items_qty_chk', sql`${t.quantity} BETWEEN 1 AND 50`),
  ],
);

// ---------------------------------------------------------------------------
// Cobrança da assinatura (BR-20/PDR-017/ADR-006)
// ---------------------------------------------------------------------------

export const pixCharges = pgTable(
  'pix_charges',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    provider: text('provider').notNull(),
    providerChargeId: text('provider_charge_id').notNull(),
    plan: text('plan').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull().default('pending'),
    qrCode: text('qr_code').notNull(),
    qrCodeBase64: text('qr_code_base64'),
    expiresAt: ts('expires_at').notNull(),
    paidAt: ts('paid_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('pix_charges_tenant_status_idx').on(t.tenantId, t.status, t.expiresAt),
    /** Varredura do job de confirmação/expiração (todas as tenants). */
    index('pix_charges_pending_idx').on(t.status, t.expiresAt),
    check('pix_charges_plan_chk', sql`${t.plan} IN ('monthly','semiannual','annual')`),
    check('pix_charges_status_chk', sql`${t.status} IN ('pending','paid','expired')`),
  ],
);

// ---------------------------------------------------------------------------
// Infra: outbox e idempotência
// ---------------------------------------------------------------------------

export const domainEvents = pgTable(
  'domain_events',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    type: text('type').notNull(),
    actor: jsonb('actor').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: createdAt(),
    publishedAt: ts('published_at'),
  },
  (t) => [
    index('domain_events_unpublished_idx')
      .on(t.createdAt)
      .where(sql`${t.publishedAt} IS NULL`),
    index('domain_events_aggregate_idx').on(t.tenantId, t.aggregateType, t.aggregateId),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.scope, t.key] })],
);

/** Tabelas que carregam tenant_id e recebem política RLS (migration 0001). */
export const TENANT_SCOPED_TABLES = [
  'memberships',
  'staff_devices',
  'service_areas',
  'categories',
  'products',
  'tables',
  'revoked_table_tokens',
  'devices',
  'device_blocks',
  'sessions',
  'session_participants',
  'service_requests',
  'orders',
  'order_items',
  'domain_events',
  'idempotency_keys',
  'pix_charges',
] as const;
