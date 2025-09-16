Canadian Trail: Out There, Eh? (static ES modules)

A Canadian road‑trip roguelike inspired by *Out There*: you hop node‑to‑node on a branching map, juggling **Gas, Snacks, and Ride** (vehicle integrity), with witty events and hard choices. Short, deterministic runs; multiple endings across Canada.

## Constraints
- Vanilla HTML/CSS/JS (ES Modules). No frameworks/bundlers/deps.
- Cross‑browser (desktop & mobile). Accessible UI (keyboard, roles, focus).
- JSON loaded via `systems/jsonLoader.js` using `fetch(new URL(path, import.meta.url))`.
- One seeded RNG per run; all randomness uses it for reproducible runs.
- Image placeholders auto‑generated from `/data/manifest.json`.

## Run
```sh
python3 -m http.server 5173 || python -m http.server 5173
# Open http://localhost:5173/

High‑level Architecture
	•	Map (node graph): provinces stitched into a branching road network.
	•	Resources: Gas (fuel), Snacks (stamina/comfort), Ride (vehicle integrity), Money (shops).
	•	Family party: same characters/roles/health; witty daily logs.
	•	Node actions: Siphon (fuel spots), Forage (parks/forests), Tinker (mechanics) with deterministic risk rolls.
	•	Events: JSON‑authored interactive fiction (requires/roll/effects) with Canadian humour.
	•	Upgrades/vehicles: techs (snow tires, larger tank, CB radio); minivan/pickup/bus with different stats.
	•	Endings: reach a coast/territory; permadeath if resources hit zero during actions.

Files & Folders

index.html
styles.css
main.js
README.md
package.json
.editorconfig
.gitignore
/systems/ (jsonLoader, assets, rng, state, events, graph, a11y)
/ui/ (Title, Setup, Map, EventModal, EndScreen)
/data/ (manifest.json, nodes.json, events.json)
/tests/run.js
/assets/ img/{ui,scene,sprites}/ audio/

License & IP

This is an homage to the pacing/structure of Out There; all copy/art/UI are original; real Canadian place names are used.
