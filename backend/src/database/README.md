# PostgreSQL data-access convention

`PostgresTransactionRunner` is the narrow transaction boundary for a command
that changes multiple rows or aggregates. Register it with the capability's
TypeORM runtime module for the capability that owns the transaction boundary.

- Controllers validate/map transport input and call an application service.
  They do not inject `DataSource`, `EntityManager`, `QueryRunner`, or a
  TypeORM repository.
- A capability owns its own entities and data-access classes. Do not create a
  global base repository or an interface for every entity.
- Tenant-scoped repository methods receive a verified `organizationId`
  explicitly. There is no unscoped `findById` for a tenant resource.
- The application service validates authorization and business policy before
  mutation. For a multi-row or multi-aggregate invariant, it calls
  `transactions.run(async (manager) => ...)` and passes that same manager to
  every participating repository call.
- A repository never opens a nested transaction for a caller's command. It
  uses the supplied `EntityManager`; simple single-row commands do not add a
  transaction without an identified invariant.
- Isolation level, locks, conditional updates, and negative database tests are
  selected by the owning capability. The helper does not turn every command
  into `SERIALIZABLE` and does not provide an outbox.

Use TypeORM migration history for schema changes; see
[`migrations/README.md`](./migrations/README.md) for that convention.
