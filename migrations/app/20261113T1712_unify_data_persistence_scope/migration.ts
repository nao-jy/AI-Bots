#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/764f7547cf7dc125e42c53cecdb1c50c7f05b0a92899e60abfeda437dfc9abb9/contract';
import endContract from '../../snapshots/764f7547cf7dc125e42c53cecdb1c50c7f05b0a92899e60abfeda437dfc9abb9/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/927579b9a46ad16089da0de5f5d070d6fe005255dcefba603c4eef5f339cbc30/contract';
import startContract from '../../snapshots/927579b9a46ad16089da0de5f5d070d6fe005255dcefba603c4eef5f339cbc30/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'aibot',
        table: 'ChatBot',
        constraint: 'ChatBot_memoryConfig_check_0c542cf2',
      }),
      this.dropColumn({ schema: 'aibot', table: 'ChatBot', column: 'memoryConfig' }),
      this.dropCheckConstraint({
        schema: 'aibot',
        table: 'Sandbox',
        constraint: 'Sandbox_sandboxScope_check_825fb1d7',
      }),
      this.dropColumn({ schema: 'aibot', table: 'Sandbox', column: 'sandboxScope' }),
      this.addColumn({
        schema: 'aibot',
        table: 'ChatBot',
        column: col('dataPersistenceScope', 'text', {
          notNull: true,
          default: lit('nopersistence'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'aibot',
        table: 'ChatBot',
        constraint: 'ChatBot_dataPersistenceScope_check_9e451ce9',
        expression: sql`"dataPersistenceScope" IN ('nopersistence', 'thread', 'bot')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
