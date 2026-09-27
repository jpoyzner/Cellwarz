# Cellwarz

Online multiplayer platform game (see [README.md](README.md)). Java WebSocket server + vanilla RequireJS/Backbone client. Eclipse Dynamic Web Project — no Maven/Ant/npm; there is no automated test suite.

## Architecture

- **Server** (`src/com/poyznertech/cells/`): `World` is a `ServletContextListener` that boots one `Physics` and one `Zion` at startup. `Zion` creates several `Cell` instances (rooms), each wrapped in an `Engine` that runs its own 48 FPS `Timer` game loop (`Engine.ENGINE_FRAMES_PER_SECOND`). `Session` maps a login to the player's current `Avatar`.
- **Realtime transport**: `WebSocketConnector` (`/socketrefresh`) is a Tomcat 7 `WebSocketServlet` (the old `org.apache.catalina.websocket` API, **not** the JSR‑356 `javax.websocket` API — don't introduce annotated endpoints). Each connection gets its own `SocketHub`, which runs its own render `Timer` and speaks a small JSON protocol (`connect` / `message` / key-down-up), built with `net.sf.json` (json-lib) via `JSONGenerator`.
- **Physics/world model**: `CellData` stores sprites in a 2D grid of `Set<Sprite>` (`ANIMATION_STEP = 8` px per grid unit). `Physics` implements move/push/collision on that grid. Sprites (`sprite/`) extend the abstract `Sprite`; cells (`cell/`) extend abstract `Cell`, which populates walls/doors/mana/robots in `init()` — `SimpleSmallCell` is the only concrete cell type today.
- **Wire format is intentionally terse**: `JSONGenerator.getSprites` emits `[imageIndex, xPixels, yPixels, extraInfo?]` per sprite keyed by cell index, and `-1` means "deleted this frame" — this is a size/perf optimization for frequent redraw messages, preserve it when touching this path.
- **Client** (`js/`, bundled to `WebContent/js/cellwarz.js`): RequireJS modules loaded via `js/cellwarz.js` (data-main). `canvas.js` (Backbone view) wires up `ui.js` (input), `renderer.js` (canvas drawing from server JSON), `syncer.js` (the `WebSocket` connection + message parsing), and `analyzer.js` (perf HUD). jquery/jquery-mobile/underscore/backbone are loaded from CDN — **the CDN paths are duplicated in both `js/cellwarz.js` and `gulpfile.js`; update both together** (see comment in `js/cellwarz.js`).

## Build / run

- No npm install step recorded — gulp plugins (`gulp-requirejs`, `gulp-uglify`, `gulp-shell`, `del`) are assumed globally available; there's no `package.json` in this repo.
- `gulp debug` — copies `js/**/*` as-is into `WebContent/js/` (fast path for local iteration).
- `gulp` / `gulp bundle` — bundles+minifies `js/` into a single `WebContent/js/cellwarz.js` via RequireJS optimizer.
- `gulp deploy` — `scp`s a pre-built `../Cellwarz.war` to the production EC2 host. This is a real deploy to a live server; never run it without explicit user confirmation.
- Java side has no CLI build: it's an Eclipse Dynamic Web Project (`.project`/`.classpath`) targeting **Apache Tomcat v7.0**, compiled to `build/classes`, packaged as a WAR by Eclipse. Third-party jars live in [WebContent/WEB-INF/lib](WebContent/WEB-INF/lib) (json-lib + its commons-* dependencies) and are referenced directly in `.classpath`.

## Conventions & gotchas

- Many `TODO:` comments throughout mark known rough edges/race conditions (e.g. `Session.unplug()`, `SocketHub.renderClient()`); this is an actively-evolving hobby project, not a polished codebase — don't be surprised by dead/commented-out code blocks, and match the existing terse style rather than over-refactoring.
- `Cell` subclasses only override the small set of abstract sizing/spawn-count methods (see `SimpleSmallCell`); add new room types this way rather than changing `Cell` itself.
- Sprite subclasses under `sprite/` follow a consistent pattern: static `init(CellData)` registers animation frames/images once per cell, instance constructors take `(x, y, cellInit, cell)` and can throw `ClusteredInitException` if the spawn position is occupied.
