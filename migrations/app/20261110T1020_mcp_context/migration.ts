#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5b158a92977ca07a797aa8e1e8c512303cb6771313c570330e1c11e6fd529aff/contract';
import startContract from '../../snapshots/5b158a92977ca07a797aa8e1e8c512303cb6771313c570330e1c11e6fd529aff/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fe81e888a4734a3a8b3fb92c7a0e892efdd46fefe287ae980ba3ce94d73f3528/contract';
import endContract from '../../snapshots/fe81e888a4734a3a8b3fb92c7a0e892efdd46fefe287ae980ba3ce94d73f3528/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'aibot', table: 'ChatBotToolSetContext' }),
      this.addColumn({
        schema: 'aibot',
        table: 'ChatBotMcpServer',
        column: col('context', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'aibot',
        table: 'McpServer',
        column: col('contextEndpoint', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'aibot',
        table: 'ChatBotMcpServer',
        column: 'updatedAt',
        type: 'timestamptz(3)',
        temporaryDefault: sql`'epoch'`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
