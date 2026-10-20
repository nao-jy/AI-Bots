#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/58e4aec382cd753051860f760cae77e4ef8fcef396a32d1c60a5e9ea282b19cc/contract';
import startContract from '../../snapshots/58e4aec382cd753051860f760cae77e4ef8fcef396a32d1c60a5e9ea282b19cc/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/980ed93b452f0e90f4e355e082cd9c16b50e443bce0c1c9aed4113264f71a083/contract';
import endContract from '../../snapshots/980ed93b452f0e90f4e355e082cd9c16b50e443bce0c1c9aed4113264f71a083/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'OAuthAuthentication',
        column: col('createdAt', 'timestamptz', {
          notNull: true,
          default: fn(sql`now()`),
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'OAuthClient',
        column: col('createdAt', 'timestamptz', {
          notNull: true,
          default: fn(sql`now()`),
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'OAuthAuthentication',
        column: 'updatedAt',
        type: 'timestamptz',
        temporaryDefault: sql`'epoch'`,
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'OAuthClient',
        column: 'updatedAt',
        type: 'timestamptz',
        temporaryDefault: sql`'epoch'`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
