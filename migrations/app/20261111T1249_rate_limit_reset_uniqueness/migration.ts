#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/6bfd13fddf7ed0f0922329fecd4b0740578ee51b3d4af580901aede42a5255c6/contract';
import startContract from '../../snapshots/6bfd13fddf7ed0f0922329fecd4b0740578ee51b3d4af580901aede42a5255c6/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/927579b9a46ad16089da0de5f5d070d6fe005255dcefba603c4eef5f339cbc30/contract';
import endContract from '../../snapshots/927579b9a46ad16089da0de5f5d070d6fe005255dcefba603c4eef5f339cbc30/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'aibot',
        table: 'RateLimit',
        constraint: 'RateLimit_criteria_criteriaId_key',
      }),
      this.addUnique({
        schema: 'aibot',
        table: 'RateLimit',
        constraint: 'RateLimit_criteria_criteriaId_resetOnCron_key',
        columns: ['criteria', 'criteriaId', 'resetOnCron'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
