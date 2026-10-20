#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/407d785a112816d010ff0ecd918932dd9783a2f1b2685adb8d1a02c181a2e847/contract';
import startContract from '../../snapshots/407d785a112816d010ff0ecd918932dd9783a2f1b2685adb8d1a02c181a2e847/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/58e4aec382cd753051860f760cae77e4ef8fcef396a32d1c60a5e9ea282b19cc/contract';
import endContract from '../../snapshots/58e4aec382cd753051860f760cae77e4ef8fcef396a32d1c60a5e9ea282b19cc/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'OAuthAuthentication',
        columns: [
          col('accessToken', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('oauthId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ownerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('refreshToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'OAuthClient',
        columns: [
          col('authorizationEndpoint', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('clientId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('clientSecret', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ownerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('refreshEndpoint', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('revocationEndpoint', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('scopes', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('tokenEndpoint', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'OAuthClient_scopes_elem_not_null_de6fcc8e',
            sql`array_position("scopes", NULL) IS NULL`,
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'OAuthAuthentication',
        index: 'OAuthAuthentication_oauthId_idx_b3651b5a',
        columns: ['oauthId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'OAuthAuthentication',
        index: 'OAuthAuthentication_ownerId_idx_e2d0c1ef',
        columns: ['ownerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'OAuthClient',
        index: 'OAuthClient_ownerId_idx_e2d0c1ef',
        columns: ['ownerId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'OAuthAuthentication',
        foreignKey: {
          name: 'OAuthAuthentication_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'OAuthAuthentication',
        foreignKey: {
          name: 'OAuthAuthentication_oauthId_fkey',
          columns: ['oauthId'],
          references: { schema: 'public', table: 'OAuthClient', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'OAuthClient',
        foreignKey: {
          name: 'OAuthClient_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
