#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3f3fa5b24f30727a91f20c81fb5acd9feef9f9824ada6029a5e14e5509b68f3c/contract';
import startContract from '../../snapshots/3f3fa5b24f30727a91f20c81fb5acd9feef9f9824ada6029a5e14e5509b68f3c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/90303116f963c8685cd5d838420106241bdc2a09682e3fed66ba47656fd34d66/contract';
import endContract from '../../snapshots/90303116f963c8685cd5d838420106241bdc2a09682e3fed66ba47656fd34d66/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      ...this.renameColumn({
        schema: 'public',
        table: 'ChatAdapter',
        column: 'config',
        to: 'envs',
      }),
      ...this.renameColumn({
        schema: 'public',
        table: 'McpServer',
        column: 'config',
        to: 'headers',
      }),
      this.dropColumn({ schema: 'public', table: 'AgentMcpServer', column: 'config' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
