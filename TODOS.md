# TODOs

## Agent customizations to consider

- Adapt Moshe agent to new tech stack here
- `/create-instruction` for the `sprite/` subclassing pattern (`applyTo: src/**/sprite/**`) — codifies the static `init(CellData)` + `(x, y, cellInit, cell)` constructor + `ClusteredInitException` convention, useful if new sprites are added often.
- `/create-agent` "game-client" agent scoped to `js/**` with browser tools, for UI-focused iteration on the RequireJS/Backbone client.
