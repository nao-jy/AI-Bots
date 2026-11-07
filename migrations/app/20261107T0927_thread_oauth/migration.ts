#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5b158a92977ca07a797aa8e1e8c512303cb6771313c570330e1c11e6fd529aff/contract';
import endContract from '../../snapshots/5b158a92977ca07a797aa8e1e8c512303cb6771313c570330e1c11e6fd529aff/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a8c887057b26ed29e31335243867b909e4990512963bec74dbb855acc56287a5/contract';
import startContract from '../../snapshots/a8c887057b26ed29e31335243867b909e4990512963bec74dbb855acc56287a5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        columns: [
          col('adapterId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('authenticationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('chatbotId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('oauthClientId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('threadId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'aibot',
        table: 'ChatBotMcpServer',
        column: col('oauthClientId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'ChatBotMcpServer',
        constraint: 'ChatBotMcpServer_chatbotId_mcpServerId_oauthClientId_key',
        columns: ['chatbotId', 'mcpServerId', 'oauthClientId'],
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        constraint: 'ThreadOAuthConnection_authenticationId_key',
        columns: ['authenticationId'],
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        constraint: 'ThreadOAuthConnection_oauthClientId_chatbotId_adapterId_threadI',
        columns: ['oauthClientId', 'chatbotId', 'adapterId', 'threadId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'ChatBotMcpServer',
        index: 'ChatBotMcpServer_oauthClientId_idx_06565021',
        columns: ['oauthClientId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        index: 'ThreadOAuthConnection_adapterId_idx_f5208af9',
        columns: ['adapterId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        index: 'ThreadOAuthConnection_chatbotId_idx_52db07ea',
        columns: ['chatbotId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        index: 'ThreadOAuthConnection_oauthClientId_idx_06565021',
        columns: ['oauthClientId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        index: 'ThreadOAuthConnection_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ChatBotMcpServer',
        foreignKey: {
          name: 'ChatBotMcpServer_oauthClientId_fkey',
          columns: ['oauthClientId'],
          references: { schema: 'aibot', table: 'OAuthClient', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        foreignKey: {
          name: 'ThreadOAuthConnection_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'aibot', table: 'Organization', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        foreignKey: {
          name: 'ThreadOAuthConnection_oauthClientId_fkey',
          columns: ['oauthClientId'],
          references: { schema: 'aibot', table: 'OAuthClient', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        foreignKey: {
          name: 'ThreadOAuthConnection_chatbotId_fkey',
          columns: ['chatbotId'],
          references: { schema: 'aibot', table: 'ChatBot', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        foreignKey: {
          name: 'ThreadOAuthConnection_adapterId_fkey',
          columns: ['adapterId'],
          references: { schema: 'aibot', table: 'ChatAdapter', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        foreignKey: {
          name: 'ThreadOAuthConnection_authenticationId_fkey',
          columns: ['authenticationId'],
          references: { schema: 'aibot', table: 'OAuthAuthentication', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
