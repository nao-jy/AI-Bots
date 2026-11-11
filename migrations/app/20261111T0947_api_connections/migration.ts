#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/736fa1b716cea356dc90b82d5aaafb1b8b892f97b91e3dccf2938f5367682359/contract';
import endContract from '../../snapshots/736fa1b716cea356dc90b82d5aaafb1b8b892f97b91e3dccf2938f5367682359/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fe81e888a4734a3a8b3fb92c7a0e892efdd46fefe287ae980ba3ce94d73f3528/contract';
import startContract from '../../snapshots/fe81e888a4734a3a8b3fb92c7a0e892efdd46fefe287ae980ba3ce94d73f3528/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  rawSql,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'sandbox.clear-legacy',
        label: 'Remove pre-release sandbox resources before configuring API connections',
        operationClass: 'destructive', target: { id: 'postgres' }, precheck: [], postcheck: [],
        execute: [{ description: 'Delete legacy sandbox resources and dependent instances', sql: 'DELETE FROM aibot."ResourceBase" WHERE id IN (SELECT id FROM aibot."Sandbox")' }],
      }),
      this.dropConstraint({
        schema: 'aibot',
        table: 'PersistentSandboxInstance',
        constraint: 'PersistentSandboxInstance_instanceId_key',
      }),
      this.dropColumn({ schema: 'aibot', table: 'Sandbox', column: 'sandboxType' }),
      this.createTable({
        schema: 'aibot',
        table: 'ChatBotFileSystem',
        columns: [
          col('chatbotId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('sandboxId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'aibot',
        table: 'FileSystemAPI',
        columns: [
          col('context', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('endpoint', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('headers', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'aibot',
        table: 'SandboxAPI',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('endpoint', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('headers', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organizationId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'aibot',
        table: 'Organization',
        column: col('temporaryFileSystemApiId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'aibot',
        table: 'PersistentSandboxInstance',
        column: col('apiId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.setNotNull({ schema: 'aibot', table: 'PersistentSandboxInstance', column: 'apiId' }),
      this.addColumn({
        schema: 'aibot',
        table: 'Sandbox',
        column: col('apiId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.setNotNull({ schema: 'aibot', table: 'Sandbox', column: 'apiId' }),
      this.addUnique({
        schema: 'aibot',
        table: 'FileSystemAPI',
        constraint: 'FileSystemAPI_organizationId_name_key',
        columns: ['organizationId', 'name'],
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'FileSystemAPI',
        constraint: 'FileSystemAPI_endpoint_context_headers_key',
        columns: ['endpoint', 'context', 'headers'],
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'PersistentSandboxInstance',
        constraint: 'PersistentSandboxInstance_apiId_instanceId_key',
        columns: ['apiId', 'instanceId'],
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'SandboxAPI',
        constraint: 'SandboxAPI_organizationId_name_key',
        columns: ['organizationId', 'name'],
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'SandboxAPI',
        constraint: 'SandboxAPI_endpoint_headers_key',
        columns: ['endpoint', 'headers'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'ChatBotFileSystem',
        index: 'ChatBotFileSystem_chatbotId_idx_52db07ea',
        columns: ['chatbotId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'ChatBotFileSystem',
        index: 'ChatBotFileSystem_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'ChatBotFileSystem',
        index: 'ChatBotFileSystem_sandboxId_idx_2b30d542',
        columns: ['sandboxId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'FileSystemAPI',
        index: 'FileSystemAPI_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'Organization',
        index: 'Organization_temporaryFileSystemApiId_idx_d50d93e3',
        columns: ['temporaryFileSystemApiId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'PersistentSandboxInstance',
        index: 'PersistentSandboxInstance_apiId_idx_a7249ccd',
        columns: ['apiId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'Sandbox',
        index: 'Sandbox_apiId_idx_a7249ccd',
        columns: ['apiId'],
      }),
      this.createIndex({
        schema: 'aibot',
        table: 'SandboxAPI',
        index: 'SandboxAPI_organizationId_idx_2e17ef41',
        columns: ['organizationId'],
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ChatBotFileSystem',
        foreignKey: {
          name: 'ChatBotFileSystem_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'aibot', table: 'Organization', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ChatBotFileSystem',
        foreignKey: {
          name: 'ChatBotFileSystem_chatbotId_fkey',
          columns: ['chatbotId'],
          references: { schema: 'aibot', table: 'ChatBot', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'ChatBotFileSystem',
        foreignKey: {
          name: 'ChatBotFileSystem_sandboxId_fkey',
          columns: ['sandboxId'],
          references: { schema: 'aibot', table: 'FileSystemAPI', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'FileSystemAPI',
        foreignKey: {
          name: 'FileSystemAPI_id_fkey',
          columns: ['id'],
          references: { schema: 'aibot', table: 'ResourceBase', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'FileSystemAPI',
        foreignKey: {
          name: 'FileSystemAPI_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'aibot', table: 'Organization', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'Organization',
        foreignKey: {
          name: 'Organization_temporaryFileSystemApiId_fkey',
          columns: ['temporaryFileSystemApiId'],
          references: { schema: 'aibot', table: 'FileSystemAPI', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'SandboxAPI',
        foreignKey: {
          name: 'SandboxAPI_id_fkey',
          columns: ['id'],
          references: { schema: 'aibot', table: 'ResourceBase', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'SandboxAPI',
        foreignKey: {
          name: 'SandboxAPI_organizationId_fkey',
          columns: ['organizationId'],
          references: { schema: 'aibot', table: 'Organization', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'PersistentSandboxInstance',
        foreignKey: {
          name: 'PersistentSandboxInstance_apiId_fkey',
          columns: ['apiId'],
          references: { schema: 'aibot', table: 'SandboxAPI', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'aibot',
        table: 'Sandbox',
        foreignKey: {
          name: 'Sandbox_apiId_fkey',
          columns: ['apiId'],
          references: { schema: 'aibot', table: 'SandboxAPI', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
