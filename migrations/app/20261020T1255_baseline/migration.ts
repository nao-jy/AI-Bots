#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/fc86a5f332489690564a0f0a256b5172e5d46aea7216ecb5c30c048fad696e48/contract';
import endContract from '../../snapshots/fc86a5f332489690564a0f0a256b5172e5d46aea7216ecb5c30c048fad696e48/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'AgentDefinition',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('model_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('options', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('providerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'AgentMcpServer',
        columns: [
          col('agentId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('mcpServerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['agentId', 'mcpServerId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ChatAdapter',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('envs', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ownerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('platform', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Chatbot',
        columns: [
          col('agentId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isEnabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ownerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ChatbotAdapter',
        columns: [
          col('adapterId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('chatbotId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['chatbotId', 'adapterId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'McpServer',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('endpoint', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('headers', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ownerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('transport', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Provider',
        columns: [
          col('args', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('headers', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ownerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('providerName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Session',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'User',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Chatbot',
        constraint: 'Chatbot_agentId_key',
        columns: ['agentId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Provider',
        constraint: 'Provider_ownerId_name_key',
        columns: ['ownerId', 'name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Session',
        constraint: 'Session_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AgentDefinition',
        index: 'AgentDefinition_providerId_idx_d1904c54',
        columns: ['providerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AgentMcpServer',
        index: 'AgentMcpServer_agentId_idx_8d0ba4f0',
        columns: ['agentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AgentMcpServer',
        index: 'AgentMcpServer_mcpServerId_idx_1c0baf24',
        columns: ['mcpServerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ChatAdapter',
        index: 'ChatAdapter_ownerId_idx_e2d0c1ef',
        columns: ['ownerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ChatAdapter',
        index: 'ChatAdapter_platform_idx_b8f7b2d3',
        columns: ['platform'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Chatbot',
        index: 'Chatbot_ownerId_idx_e2d0c1ef',
        columns: ['ownerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ChatbotAdapter',
        index: 'ChatbotAdapter_adapterId_idx_f5208af9',
        columns: ['adapterId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ChatbotAdapter',
        index: 'ChatbotAdapter_chatbotId_idx_52db07ea',
        columns: ['chatbotId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'McpServer',
        index: 'McpServer_ownerId_idx_e2d0c1ef',
        columns: ['ownerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Provider',
        index: 'Provider_ownerId_idx_e2d0c1ef',
        columns: ['ownerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AgentDefinition',
        foreignKey: {
          name: 'AgentDefinition_providerId_fkey',
          columns: ['providerId'],
          references: { schema: 'public', table: 'Provider', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AgentMcpServer',
        foreignKey: {
          name: 'AgentMcpServer_agentId_fkey',
          columns: ['agentId'],
          references: { schema: 'public', table: 'AgentDefinition', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AgentMcpServer',
        foreignKey: {
          name: 'AgentMcpServer_mcpServerId_fkey',
          columns: ['mcpServerId'],
          references: { schema: 'public', table: 'McpServer', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ChatAdapter',
        foreignKey: {
          name: 'ChatAdapter_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Chatbot',
        foreignKey: {
          name: 'Chatbot_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Chatbot',
        foreignKey: {
          name: 'Chatbot_agentId_fkey',
          columns: ['agentId'],
          references: { schema: 'public', table: 'AgentDefinition', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ChatbotAdapter',
        foreignKey: {
          name: 'ChatbotAdapter_chatbotId_fkey',
          columns: ['chatbotId'],
          references: { schema: 'public', table: 'Chatbot', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ChatbotAdapter',
        foreignKey: {
          name: 'ChatbotAdapter_adapterId_fkey',
          columns: ['adapterId'],
          references: { schema: 'public', table: 'ChatAdapter', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'McpServer',
        foreignKey: {
          name: 'McpServer_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Provider',
        foreignKey: {
          name: 'Provider_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Session',
        foreignKey: {
          name: 'Session_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
