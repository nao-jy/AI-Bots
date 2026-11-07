#!/usr/bin/env -S node
import { readFileSync } from 'node:fs';
import type { Contract as Start } from '../../snapshots/21e9adf99abf7824f64feb914216c34adb832b84f6f1f320add932808b596595/contract';
import startContract from '../../snapshots/21e9adf99abf7824f64feb914216c34adb832b84f6f1f320add932808b596595/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a8c887057b26ed29e31335243867b909e4990512963bec74dbb855acc56287a5/contract';
import endContract from '../../snapshots/a8c887057b26ed29e31335243867b909e4990512963bec74dbb855acc56287a5/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
  sql,
} from '@prisma/orm-postgres/migration';

// Separate statements without splitting the PL/pgSQL function bodies.
const triggerSql = readFileSync(new URL('./triggers.sql', import.meta.url), 'utf8');
const statements = triggerSql.split(/;\s*\n(?=(?:CREATE|DROP|INSERT)\b)/).map((s) => s.trim()).filter(Boolean);

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'oauth.revocation.lock', label: 'Lock OAuth tables during revocation setup',
        operationClass: 'additive', target: { id: 'postgres' }, precheck: [], postcheck: [],
        execute: [{ description: 'Lock OAuth tables', sql: 'LOCK TABLE aibot."OAuthClient", aibot."OAuthAuthentication" IN SHARE ROW EXCLUSIVE MODE' }],
      }),
      this.createTable({
        schema: 'aibot',
        table: 'OAuthRevocationQueue',
        columns: [
          col('accessToken', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('authenticationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('clientId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('clientSecret', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('nextAttemptAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('refreshToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('revocationEndpoint', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'aibot',
        table: 'OAuthRevocationSnapshot',
        columns: [
          col('authenticationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('clientId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('clientSecret', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('oauthId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('revocationEndpoint', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['authenticationId'])],
      }),
      // Earlier installations used these names for the same indexes. Remove
      // only those redundant indexes; queue contents are preserved.
      rawSql({
        id: 'oauth.revocation.legacy_indexes', label: 'Remove legacy OAuth revocation indexes',
        operationClass: 'widening', target: { id: 'postgres' }, precheck: [], postcheck: [],
        execute: [
          { description: 'Remove legacy queue index', sql: 'DROP INDEX IF EXISTS aibot."OAuthRevocationQueue_nextAttemptAt_idx"' },
          { description: 'Remove legacy snapshot index', sql: 'DROP INDEX IF EXISTS aibot."OAuthRevocationSnapshot_oauthId_idx"' },
        ],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'OAuthRevocationQueue',
        index: 'OAuthRevocationQueue_nextAttemptAt_id_idx_c433e4eb',
        columns: ['nextAttemptAt', 'id'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'OAuthRevocationSnapshot',
        index: 'OAuthRevocationSnapshot_oauthId_idx_b3651b5a',
        columns: ['oauthId'],
      }),
      rawSql({
        id: 'oauth.revocation.triggers', label: 'Install OAuth revocation triggers and backfill snapshots',
        operationClass: 'additive', target: { id: 'postgres' }, precheck: [], postcheck: [],
        execute: statements.map((statement, index) => ({ description: `Install revocation trigger step ${index + 1}`, sql: statement })),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
