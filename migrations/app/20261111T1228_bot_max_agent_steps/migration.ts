#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/57ad65998e079efb63f0c5e10fb003ba312c33cf2a1eb8913a3e52a2a1b928f2/contract';
import endContract from '../../snapshots/57ad65998e079efb63f0c5e10fb003ba312c33cf2a1eb8913a3e52a2a1b928f2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/736fa1b716cea356dc90b82d5aaafb1b8b892f97b91e3dccf2938f5367682359/contract';
import startContract from '../../snapshots/736fa1b716cea356dc90b82d5aaafb1b8b892f97b91e3dccf2938f5367682359/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'aibot',
        table: 'ChatBot',
        column: col('maxAgentSteps', 'int4', {
          notNull: true,
          default: lit(8),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
