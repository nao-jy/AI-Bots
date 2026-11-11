#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/57ad65998e079efb63f0c5e10fb003ba312c33cf2a1eb8913a3e52a2a1b928f2/contract';
import startContract from '../../snapshots/57ad65998e079efb63f0c5e10fb003ba312c33cf2a1eb8913a3e52a2a1b928f2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/6bfd13fddf7ed0f0922329fecd4b0740578ee51b3d4af580901aede42a5255c6/contract';
import endContract from '../../snapshots/6bfd13fddf7ed0f0922329fecd4b0740578ee51b3d4af580901aede42a5255c6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'oauth.clear-legacy-thread-connections',
        label: 'Remove pre-release thread OAuth credentials',
        operationClass: 'destructive', target: { id: 'postgres' }, precheck: [], postcheck: [],
        execute: [{ description: 'Delete legacy authentication resources and their connections', sql: 'DELETE FROM aibot."ResourceBase" WHERE id IN (SELECT "authenticationId" FROM aibot."ThreadOAuthConnection")' }],
      }),
      this.dropConstraint({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        constraint: 'ThreadOAuthConnection_oauthClientId_chatbotId_adapterId_threadI',
      }),
      this.dropColumn({ schema: 'aibot', table: 'ThreadOAuthConnection', column: 'threadId' }),
      this.addRequiredColumnToEmptyTable({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        column: 'authorId',
        type: 'text',
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'ThreadOAuthConnection',
        constraint: 'ThreadOAuthConnection_oauthClientId_chatbotId_adapterId_authorI',
        columns: ['oauthClientId', 'chatbotId', 'adapterId', 'authorId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
