# AFK rework module shape

Vigil will reset the pre-rework Task storage into an Item model instead of
preserving old `tasks`, tiering, and chat tables in place. Items use one envelope
row with queryable lifecycle columns and a Zod-validated JSON payload per `kind`;
lifecycle behavior enters through Item Commands; planning is a separate Spawner
axis; dashboard state comes from a server-owned Dashboard Contract and Run
Observation read model.

## Considered options

- In-place migration of old Task rows: rejected because legacy tier/chat fields
  would leak into every Item module.
- Separate tables per Item kind: rejected until a kind-specific field needs
  indexed querying.
- Config-enum Spawners: rejected because installed adapters should be the files
  present, matching almanac loop-adapter ergonomics.

## Consequences

- Existing local `vigil.db` data may be discarded during the rework.
- Server routes, CLI, extension, and poller should become adapters over Item
  Commands instead of parallel write paths.
- UI modules should render a Dashboard Contract, not raw persistence rows.
