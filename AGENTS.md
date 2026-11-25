# Agent instructions

## Database access

- Put application database reads and writes in `app/.server/repository/`. This includes ORM/query-builder calls, raw SQL, and transaction boundaries. Expose repository functions to routes, authorization, features, workers, and other application code; do not import a database client or issue queries directly from those callers.
- Keep related operations that must be atomic within a repository transaction. Repository functions should return application-appropriate data rather than exposing query builders, clients, or transactions to callers.
- When changing existing application code that accesses the database outside the repository layer, move the affected DB operations into the repository as part of the change. Do not add new direct access by copying existing patterns.
- Database connection setup, schema and migrations (including triggers), and database-specific test or maintenance scripts may access the database directly where needed. This exception does not apply to application feature or worker code.

## Shared logic (DRY)

- Reuse existing functions and modules for behavior that is already implemented. Before adding logic, search for an existing implementation that can be called or extended.
- Keep common behavior in one shared function or module and have callers use it; avoid copying the same logic across routes, features, or repositories.
- When changing duplicated behavior, consolidate the affected copies as part of the change when doing so preserves their intended differences and keeps the shared abstraction clear.
- Do not introduce a shared abstraction for coincidentally similar code when its behavior or future needs differ. Prefer a small, cohesive helper with clear inputs and outputs over a generic framework.
