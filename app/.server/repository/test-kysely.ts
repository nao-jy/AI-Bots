type Condition = { column: string; operator: string; value: unknown };
type Resolver = (table: string, conditions: Condition[]) => unknown[] | Promise<unknown[]>;
type Mutation = (table: string, values: unknown, conditions: Condition[], returning?: string) => unknown;

/** Small query-builder double for unit tests that exercise repository decisions. */
export function createTestKysely(
  resolve: Resolver,
  mutate: Mutation = () => undefined,
  filterRows = true,
) {
  const rowsFor = async (table: string, conditions: Condition[]) => {
    const rows = await resolve(table, conditions);
    if (!filterRows) return rows;
    return rows.filter((row) => conditions.every(({ column, operator, value }) => {
      const actual = (row as Record<string, unknown>)[column];
      if (operator === "=") return actual === value;
      if (operator === "in") return Array.isArray(value) && value.includes(actual);
      if (operator === ">=") return String(actual) >= String(value);
      if (operator === "<") return String(actual) < String(value);
      return true;
    }));
  };

  const selectFrom = (table: string) => {
    const conditions: Condition[] = [];
    const query = {
      select: () => query,
      selectAll: () => query,
      where: (column: string, operator: string, value: unknown) => {
        conditions.push({ column, operator, value });
        return query;
      },
      whereRef: () => query,
      innerJoin: () => query,
      forUpdate: () => query,
      orderBy: () => query,
      limit: () => query,
      offset: () => query,
      execute: async () => rowsFor(table, conditions),
      executeTakeFirst: async () => (await rowsFor(table, conditions))[0],
      executeTakeFirstOrThrow: async () => {
        const row = (await rowsFor(table, conditions))[0];
        if (!row) throw new Error("No test row returned");
        return row;
      },
    };
    return query;
  };

  const insertInto = (table: string) => {
    let values: unknown;
    let returning: string | undefined;
    const query = {
      values: (next: unknown) => {
        values = next;
        return query;
      },
      returning: (column: string) => {
        returning = column;
        return query;
      },
      execute: async () => mutate(table, values, [], returning),
      executeTakeFirstOrThrow: async () => mutate(table, values, [], returning),
    };
    return query;
  };

  const updateTable = (table: string) => {
    let values: unknown;
    const conditions: Condition[] = [];
    const query = {
      set: (next: unknown) => {
        values = next;
        return query;
      },
      where: (column: string, operator: string, value: unknown) => {
        conditions.push({ column, operator, value });
        return query;
      },
      execute: async () => mutate(table, values, conditions),
    };
    return query;
  };

  const deleteFrom = (table: string) => {
    const conditions: Condition[] = [];
    const query = {
      where: (column: string, operator: string, value: unknown) => {
        conditions.push({ column, operator, value });
        return query;
      },
      execute: async () => mutate(table, undefined, conditions),
    };
    return query;
  };

  const db = {
    selectFrom,
    insertInto,
    updateTable,
    deleteFrom,
    transaction: () => ({ execute: (callback: (tx: unknown) => unknown) => callback(db) }),
  };
  return db;
}
