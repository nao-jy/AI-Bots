#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/407d785a112816d010ff0ecd918932dd9783a2f1b2685adb8d1a02c181a2e847/contract';
import endContract from '../../snapshots/407d785a112816d010ff0ecd918932dd9783a2f1b2685adb8d1a02c181a2e847/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fc86a5f332489690564a0f0a256b5172e5d46aea7216ecb5c30c048fad696e48/contract';
import startContract from '../../snapshots/fc86a5f332489690564a0f0a256b5172e5d46aea7216ecb5c30c048fad696e48/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      ...this.renameColumn({
        schema: 'public',
        table: 'ChatAdapter',
        column: 'envs',
        to: 'config',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
