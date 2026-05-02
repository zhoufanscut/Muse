# Muse — Coding Font × Theme × Language Live Preview

Muse is a static, no-build-step web app that lets visitors live-preview any coding font, VSCode theme, and programming language combination in real time. Fonts load from CDN (no local install required), themes render through Shiki, and languages come with idiomatic sample programs. Selection state is shareable via URL hash. Everything is plain HTML, ES modules, and JSON — no bundler, no transpiler, no `npm install`.

The full architecture is documented in [PLAN.md](./PLAN.md). This file covers how to contribute.

---

## Add a font (1 file)

Drop a JSON file at `data/fonts/<id>.json`:

```json
{
  "id": "fira-code",
  "name": "Fira Code",
  "stack": "'Fira Code', monospace",
  "cssUrl": "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap",
  "ligatures": true,
  "weights": [400, 700],
  "credits": "https://github.com/tonsky/FiraCode"
}
```

The filename stem (`fira-code`) is the canonical id and must match the `id` field. The `cssUrl` should point to a Google Fonts or Fontsource stylesheet. The `stack` is the CSS `font-family` value applied to the preview.

That is the only file you need. On push to `main`, CI runs `scripts/rebuild-index.mjs`, which validates the file and regenerates `data/_index.json` automatically. The new font appears in the sidebar on the next deploy.

Optional fields: `ligatures` (boolean), `weights` (array of numbers), `credits` (URL or attribution string).

---

## Add a theme (1 file)

Drop a VSCode theme JSON file at `data/themes/<id>.json`. The format is the standard VSCode color theme format — a top-level object with `colors`, `tokenColors`, and/or `settings` fields.

The filename stem is the canonical id, used in the URL hash (`?theme=<id>`). The internal `name` field (if present) is for human display only and can differ from the filename.

One file is all you need. CI validates the theme shape and regenerates the index on push.

Built-in Shiki themes are listed in `data/themes/_builtin.json` and do not need individual files. Only custom themes (not shipped by Shiki) go in `data/themes/`.

---

## Add a language (2 files)

Languages require two files:

1. **Manifest** at `data/languages/<id>.json`:

```json
{
  "id": "python",
  "label": "Python",
  "shikiLang": "python",
  "sample": "data/samples/python.txt",
  "summary": "Async ETL pipeline with dataclasses, decorators, and context managers.",
  "exercises": ["dataclass", "decorators", "async/await", "context manager", "type hints", "f-string"]
}
```

- `shikiLang` must match a language id Shiki recognizes (see [shiki.style/languages](https://shiki.style/languages)).
- `sample` is a relative path to the sample file.
- `exercises` lists the syntactic features the sample exercises (used by the validation CI and by human reviewers).

2. **Sample** at `data/samples/<id>.txt` — a plain text file containing the demo program.

The sample must meet the following quality bar:

- Coherent small program (not a feature checklist glued together)
- 60-80 lines ideal, 50-100 acceptable
- Exercises every feature listed in the manifest's `exercises` array
- Includes both string-quote styles the language supports, at least one number, and both line and block comments where available
- Has a docstring or JSDoc-style header
- Self-contained: no missing imports, no fake APIs, no `// rest of code...` placeholders
- Tokenizes cleanly under Shiki (no truncated half-statements, no obvious lex errors)

---

## URL sharing

The URL hash encodes the full visual selection:

```
#font=fira-code&theme=dracula&lang=python&size=14&liga=1&italic=1
```

Every selection change updates the hash. On page load, the URL hash takes precedence over `localStorage`.

Built-in assets (fonts, themes, languages committed to the repo) restore identically on any device. Runtime-uploaded custom fonts and themes persist only in `localStorage` on the browser where they were uploaded. A shared URL that references a runtime-only asset will fall back to defaults on a different device.

---

## Local development

Start a static HTTP server:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

After adding or changing any data file, regenerate the index:

```
node scripts/rebuild-index.mjs
```

Node.js 18+ is required — the script uses `node:fs` only, no dependencies.

Do not use `file://` to test. The app uses `fetch()` for ES modules and data loading, which is blocked by the browser's same-origin policy on `file://`.

---

## Deployment (GitHub Pages)

1. Push the repo to GitHub.
2. Go to **Settings → Pages → Source: Deploy from a branch**.
3. Set **Branch: `main`**, **folder: `/ (root)`**.
4. The site goes live at `https://<username>.github.io/<repo>/` within about a minute. Subsequent pushes auto-deploy.

The `.nojekyll` file at the repo root is required so GitHub Pages does not run Jekyll (which would drop files starting with `_` such as `_index.json` and `_builtin.json`).

On every push to `main`, the `rebuild-index.yml` workflow validates all data files and regenerates `data/_index.json`. That commit triggers a Pages deploy. On PRs, the same workflow runs in validation-only mode (`--check`) to catch issues before merge.
