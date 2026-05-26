# AGENTS.md

## Project type

Muse is a **static, no-build-step web app** — plain HTML + vanilla ES modules + JSON data files. No `package.json`, no bundler, no transpiler, no test harness, no linter. Dependencies (Shiki) load at runtime from `esm.sh` CDN. Deployed as **GitHub Pages** from the repo root on `main`.

## Architecture

```
index.html  →  src/main.js (boot orchestrator)
                  ├── state.js       — pub/sub store, localStorage + URL hash sync
                  ├── themes.js      — Shiki highlighter (@1.24.0, esm.sh)
                  ├── fonts.js       — CDN font loading, installed-font detection
                  ├── languages.js   — manifest + sample loading, caching
                  ├── preview.js     — render with race-condition guard
                  ├── util.js        — fetch helpers (HTTP-error-checked JSON/text)
                  ├── style.css      — all styles
                  └── ui/
                      ├── sidebar-fonts.js   — left sidebar pills
                      ├── sidebar-themes.js  — right sidebar pills
                      ├── controls.js        — size slider, ligatures, lang tabs
                      ├── uploaders.js       — custom font/theme upload dialogs
                      └── search.js          — fuzzy scoring + pill navigation

data/
  ├── _index.json          — auto-generated catalog (CI, never edit manually)
  ├── fonts/<id>.json      — font manifests
  ├── themes/<id>.json     — VSCode theme JSONs
  ├── themes/_builtin.json — Shiki built-in theme names
  ├── languages/<id>.json  — language manifests
  └── samples/<id>.txt     — sample code files
```

All imports use relative paths with `./` prefix. All `fetch()` calls use `./` prefix (required for GitHub Pages project sites).

**`_index.json` vs `_builtin.json`**: `_index.json` only lists **repo** fonts/themes/languages by id. Shiki built-in theme names live separately in `data/themes/_builtin.json` (a string array) and are NOT in `_index.json`. The sidebar merges both lists at runtime. When adding a repo theme, ensure the id doesn't collide with any name in `_builtin.json`.

## Local dev

```bash
python3 -m http.server 8000        # serve on localhost:8000
node scripts/rebuild-index.mjs     # regenerate data/_index.json after data changes
node scripts/rebuild-index.mjs --check   # validate-only (no write)
```

Node.js 18+ required (CI uses 20). The rebuild script uses only `node:fs`, zero dependencies.

**Do NOT test with `file://`.** Browsers block `fetch()` for ES modules and data on file protocol.

**Manual verification only.** No test runner exists. Start the HTTP server, open the browser, check the console for errors. The boot overlay displays "Failed to start: …" in red if `_index.json` is missing or malformed.

## Data contribution rules

Adding content is conflict-free by design — you never edit shared files:

| Asset | Files needed | Where |
|-------|-------------|-------|
| Font | 1 file | `data/fonts/<id>.json` |
| Theme | 1 file | `data/themes/<id>.json` |
| Language | 2 files | `data/languages/<id>.json` + `data/samples/<id>.txt` |

**Filename stem = canonical id** — used in URL hash, localStorage, and Shiki theme registration. The `id` field inside the JSON **must** match the filename.

For PR contribution checklists (screenshot requirements, sample quality bar, etc.), see `CONTRIBUTING.md`.

## Critical invariants

These were learned through multiple bug-fix rounds. Violating any of them causes silent breakage.

### Theme name override
```js
// ALWAYS do this before passing a custom theme to Shiki:
const theme = { ...raw, name: id };
```
The filename stem is canonical. The theme's embedded `name` field is display-only and **may differ**. If you pass the raw `name` to Shiki, URL sharing breaks because localStorage stores the filename-stem id.

### Font loading
```js
// Use this — waits for font decoding:
await document.fonts.load(`16px "${font.name}"`);

// NOT this — fires when CSS arrives, not when font is ready:
link.addEventListener('load', ...);
```

### State precedence
```
URL hash > localStorage > hardcoded defaults
```
On page load, hash overrides everything. When state changes, **both** `localStorage` and URL hash update simultaneously.

### `.nojekyll`
The root `.nojekyll` file (empty) is **required** for GitHub Pages. Without it, Jekyll drops files starting with `_` (like `_index.json` and `_builtin.json`), and the app fails to boot.

### `data/_index.json` is auto-generated
Never edit it manually. CI regenerates it on push to `main`. The rebuild script reads the filesystem and writes it. Manual edits will be clobbered.

### Index must exist at boot time
`src/main.js` fetches `data/_index.json` on app load. If this file is missing or invalid, the entire app fails with "Failed to start". When adding new assets, run `node scripts/rebuild-index.mjs` before testing.

### Runtime assets (localStorage) vs repo assets
Fonts/themes uploaded at runtime via the UI dialogs persist in `localStorage` **only**. They are NOT backed by repo JSON files. A shared URL referencing a runtime-only asset falls back to defaults on a different device.

**Boot sequence matters:** runtime asset IDs are read from `localStorage` in `src/main.js` *before* `setCatalog()` is called. This ensures `setCatalog()` knows about runtime-only IDs and doesn't clobber state pointing to them during validation. Rearranging this order breaks runtime asset restoration on page reload.

### Shiki version
Pinned to `https://esm.sh/shiki@1.24.0` in `src/themes.js`. Changing this requires verifying that all custom theme loading still works, the theme API hasn't changed, and all `shikiLang` values in language manifests are still valid.

### Sample path convention
Language manifests store `sample` as a **relative path without `./` prefix** (e.g. `"sample": "data/samples/python.txt"`). The loader (`src/languages.js`) prepends `./` at fetch time. Never include `./` in the manifest's `sample` field — it would produce `././data/samples/x.txt` and break.

### Custom theme slug prefix
Runtime-uploaded themes get slugs prefixed with `custom-` (see `slugify()` in `src/ui/uploaders.js`). This distinguishes runtime-only themes from repo themes and prevents accidental filename collisions. Repo themes never use this prefix.

### Custom font slug prefix
Runtime-uploaded fonts (URL or `@font-face` via the dialog) also get `custom-`-prefixed ids — `slugify()` computes the id in `src/ui/uploaders.js` and `installFont` honors `spec.id`. This stops a name like "JetBrains Mono" from shadowing the repo `jetbrains-mono` manifest. System/"found" fonts keep their **real** id (no prefix) so they map to the actually-installed font. Repo fonts never use this prefix.

### Content-Security-Policy
`index.html` carries a CSP `<meta>`. `script-src` must keep `https://esm.sh` **and** `'wasm-unsafe-eval'`, and `connect-src` must keep `https://esm.sh` — Shiki loads its module and oniguruma WASM from there, and a stricter policy silently breaks highlighting. `style-src`/`font-src` allow any `https:` host so custom fonts from any CDN work; `style-src` needs `'unsafe-inline'` because Shiki emits inline styles. Update the directive list when introducing a new CDN.

### localStorage keys
```
muse:state          — current selection (font/theme/lang/size/ligatures/italic)
muse:custom-fonts   — array of user-uploaded font objects
muse:custom-themes  — array of {id, theme} for user-uploaded VSCode themes
muse:found-fonts    — array of fonts detected as installed on this device
```
All values are JSON. Clearing a key or corrupting it triggers fallback to defaults — the app never crashes on bad localStorage.

## CI

Single workflow: `.github/workflows/rebuild-index.yml`

- **On PR**: runs `node scripts/rebuild-index.mjs --check` (validation-only)
- **On push to `main`**: validates + regenerates `data/_index.json` + auto-commits it

The auto-commit triggers a GitHub Pages deploy. No manual deploy step.

## What doesn't exist

- No tests (no jest, vitest, pytest, etc.)
- No linter (no eslint, prettier, biome)
- No type checker (no TS config)
- No pre-commit hooks
- No Docker/container setup
- No environment variables (purely static frontend)

Manual verification: start the HTTP server, open the browser, check the console for errors.

## State management pattern

Import `state.js` — it's a single pub/sub store:

```js
import { getState, setState, subscribe } from './state.js';

// Read (returns a copy, don't mutate)
const { font, theme, lang, size, ligatures, italic } = getState();

// Write (triggers all subscribers, updates localStorage + URL hash)
setState({ theme: 'dracula' });

// Subscribe (fires immediately, then on every change)
const unsub = subscribe((state) => { /* render */ });
```

Before `setCatalog()` is called during boot, `setState` does NOT validate against available assets. After boot, invalid font/theme/lang IDs trigger `console.error` and fall back to defaults.

**First-visit randomization**: On the very first visit (no `localStorage` state AND no URL hash), `setCatalog()` picks a random font and theme from the catalog. This is how each new visitor sees a different landing combination. On subsequent visits, the stored or hash-driven selection wins.
