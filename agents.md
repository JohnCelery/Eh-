Agents Guide — Canadian Trail: Out There, Eh?

Audience: Any AI agent or contributor working in this repo.
Prime directive: Static ES modules only, mobile-first, deterministic, accessible, reproducible. No frameworks, no build tools, no JSON import assertions.

1) Golden Rules (don’t break these)

Mobile-first UX: the game must play perfectly on phones (≥320 px width).

One-screen map in a fullscreen viewport (100dvh), no page scrolling.

Tap targets ≥44 px; don’t rely on hover. Every hover affordance needs a tap/keyboard path.

Respect safe-area insets on mobile: padding: env(safe-area-inset-*).

Test on iOS Safari and Android Chrome; keep performance smooth (avoid layout thrash/redraw loops).

Static only: vanilla HTML/CSS/JS (ES modules). No bundlers, npm packages, or transpilers.

Determinism: all randomness flows through the seeded RNG in state.js. Never use Math.random. UI visuals must not consume game RNG.

JSON loading: always via systems/jsonLoader.js using fetch(new URL(path, import.meta.url)). Do not use import ... assert { type: "json" }.

Paths for GitHub Pages: relative imports only (./ or ../). No leading /. Case must match files exactly.

Accessibility: keyboard navigable, visible focus, ARIA roles/labels, modals trap & return focus (a11y.js). All interactions reachable via keyboard and touch.

Assets/manifest: declare images in /data/manifest.json. If missing, assets.js auto-generates crisp labeled placeholders. Don’t break existing keys.

Save compatibility: if you add fields, migrate old saves safely; never crash on missing properties.

Delivery format: when responding with files, output full files wrapped with:

BEGIN FILE: path/to/file.ext
…full content…
END FILE


and include GitHub web UI steps + a Run/Verify checklist.

2) Mobile-First Implementation Notes

Layout

Use a single .viewport container that fills 100dvh/100vw; letterbox on wide screens.

Keep UI within a “safe area” (avoid content under mobile browser UI); apply env(safe-area-inset-*).

Fluid typography via clamp(); avoid text below ~12–13 px on phone.

Inputs

Buttons/controls ≥44 px; spacing via CSS variables; large hit areas.

Provide explicit tap targets for actions that previously relied on hover tooltips.

Rendering

SceneCanvas: DPR-aware, but cap super-high DPR if it harms perf; do not animate continuously without need.

Respect prefers-reduced-motion; disable cosmetic animations when requested.

3) Current Architecture (do not reshape without instruction)

index.html: accessible scaffold; dynamic import of ./main.js.

main.js: ScreenManager and bootstraps systems.

Systems:

jsonLoader.js (JSON), assets.js (manifest + placeholders), rng.js (xorshift),

state.js (GameState, save/load, travel), graph.js (node graph), events.js (event engine), a11y.js (focus trap).

UI: TitleScreen.js, SetupScreen.js, MapScreen.js (SVG/canvas map), EventModal.js, EndScreen.js.

Data: /data/manifest.json, /data/nodes.json, /data/events.json.

Tests: /tests/run.js (RNG determinism, save/load round-trip).

Fixed party (do not rename):

Mom — Merri-Ellen; Dad — Mike; Ros (9); Jess (6); Martha (3); Rusty (0).

4) Worldgen & Progression (Out-There-style direction)

Anchored east→west checkpoints with procedural branches in between.

Jump Preview before committing: deterministic Gas cost, expected Ride damage range (roughness/weather/resistance), Snack/time tick, known yields (if scanned).

Arrival provides context actions (Siphon/Forage/Tinker/Ferry/Shop) with deterministic yields/mishaps via state.js.

5) Encounters (engine hooks; determinism)

Two hooks: travel (edge) and arrival (node).

Weighted selection with cooldowns, rarity, region & context gates.

Effects can alter resources, flags, reveal POIs, or award items/blueprints; must be deterministic (seed + context; use game RNG).

UI: small banner (travel) or accessible modal (arrival). Choices show clear stakes; touch/keyboard friendly.

6) Vehicles, Modules, Crafting (feature trajectory)

Vehicles: stats (max Gas, efficiency, Ride cap, cargo/tech capacity, resistances/comfort). Found Vehicle flow: Inspect/Compare → Take, Strip, Transfer, or Leave.

Modules (upgrades): blueprint vs unknown; install/repair/dismantle using Parts/Scrap/Electronics; rare Aurora Shard as special resource. Optional adjacency bonuses.

Do now: data shapes + inventory fields are safe to add (guard old saves).

UI: Vehicle Inspect/Swap modal and Upgrades modal must be accessible and mobile-first.

7) Rendering & SceneCanvas

SceneCanvas owns a DPR-aware <canvas> inside the fullscreen viewport; visual-only (no RNG usage).

Draw order: background → parallax layers → roads → nodes/icons/labels → vehicle + portraits → FX (selection ring, geese).

Ambient tints/geese flyovers use a derived view RNG (hash of seed+day), never the game RNG.

Keep draw work minimal per frame; no unbounded loops.

8) Tests (extend as you add systems)

Keep /tests/run.js green and extend with: worldgen reproducibility, encounter lottery sanity, jump preview math invariants, upgrades inventory mutations.

9) Common Pitfalls (avoid)

JSON import assertions → break Safari.

Root-absolute paths or wrong file case → 404 on GitHub Pages.

UI consuming RNG or async race that changes RNG order → non-reproducible runs.

Modal without focus trap → accessibility regression.

Tiny tap targets / hover-only UI → mobile usability regression.

10) Standard Codex Preface (paste before tasks)

Use this preface atop any instruction to Codex:

Constraints: vanilla ES modules; mobile-first UX (no scrolling; tap targets ≥44 px; safe-area insets); JSON via jsonLoader with fetch(new URL(..., import.meta.url)); deterministic RNG via state.js; accessible UI; one-screen map; placeholder images via assets.js; save-compatible migrations.
Output: full files wrapped in BEGIN FILE/END FILE, GitHub web UI steps, Run/Verify checklist.
Never use Math.random or root-absolute imports.
