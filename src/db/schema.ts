import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  bigserial,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Enums
export const channelEnum = pgEnum('channel', ['SMS', 'WHATSAPP', 'WEB']);

export const contributionStatusEnum = pgEnum('contribution_status', [
  'PENDING',
  'PROCESSED',
  'FAILED',
]);

export const memberStatusEnum = pgEnum('member_status', [
  'ACTIVE',
  'INACTIVE',
]);

export const memberRoleEnum = pgEnum('member_role', [
  'MEMBER',
  'COLLECTOR',
]);

// Groups

export const groups = pgTable('groups', {
  id:            uuid('id').primaryKey().defaultRandom(),
  name:          text('name').notNull(),
  description:   text('description'),
  cycleAmount:   integer('cycle_amount').notNull(), // in kobo
  cycleInterval: text('cycle_interval').notNull(),  // "weekly" | "monthly"
  isActive:      boolean('is_active').notNull().default(true),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});

// Members

export const members = pgTable('members', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        text('name').notNull(),
  phoneNumber: text('phone_number'),
  role:        memberRoleEnum('role').notNull().default('MEMBER'),
  status:      memberStatusEnum('status').notNull().default('ACTIVE'),
  groupId:     uuid('group_id').notNull().references(() => groups.id),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

// Contributions

export const contributions = pgTable('contributions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  amount:         integer('amount').notNull(),           // in kobo
  channel:        channelEnum('channel').notNull(),
  status:         contributionStatusEnum('status').notNull().default('PENDING'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  rawPayload:     text('raw_payload').notNull(),         // original input, never deleted
  failureReason:  text('failure_reason'),
  processedAt:    timestamp('processed_at'),
  memberId:       uuid('member_id').notNull().references(() => members.id),
  collectorId:    uuid('collector_id').notNull().references(() => members.id),
  groupId:        uuid('group_id').notNull().references(() => groups.id),
  receivedAt:     timestamp('received_at').notNull().defaultNow(),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
});

// Audit Logs

export const auditLogs = pgTable('audit_logs', {
  id:          bigserial('id', { mode: 'number' }).primaryKey(),
  eventId:     text('event_id').notNull().unique(),
  groupId:     uuid('group_id').notNull().references(() => groups.id),
  sequenceNum: integer('sequence_num').notNull(),
  entryData:   jsonb('entry_data').notNull(),
  prevHash:    text('prev_hash').notNull(),
  entryHash:   text('entry_hash').notNull(),
  hmacSig:     text('hmac_sig').notNull(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

// Notification Logs

export const notificationLogs = pgTable('notification_logs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  recipient: text('recipient').notNull(),   // phone number
  channel:   channelEnum('channel').notNull(),
  message:   text('message').notNull(),
  status:    text('status').notNull(),      // SENT | FAILED | PENDING
  attempts:  integer('attempts').notNull().default(0),
  sentAt:    timestamp('sent_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});