# Contributing

Thanks for considering a contribution to Muse. This document covers the PR process for adding fonts, themes, and languages.

For recipes on crafting good samples and understanding the data format, see [README.md](README.md).

## PR checklists

### New font PR

- [ ] One file added: `data/fonts/<id>.json`
- [ ] `cssUrl` works in incognito (verify by opening in a private window)
- [ ] `ligatures` flag set to `true` if the font supports ligatures
- [ ] Font is legally usable / has `credits` link
- [ ] `id` matches filename stem
- [ ] `node scripts/rebuild-index.mjs --check` passes

### New theme PR

- [ ] One file added: `data/themes/<id>.json`
- [ ] Valid VSCode theme shape (has `colors`, `tokenColors`, or `settings`)
- [ ] Embedded `name` may differ from filename -- that's fine, filename stem wins
- [ ] Screenshot of preview attached
- [ ] `id` (filename stem) doesn't collide with any built-in theme name
- [ ] `node scripts/rebuild-index.mjs --check` passes

### New language PR

- [ ] Two files added: `data/languages/<id>.json` + `data/samples/<id>.txt`
- [ ] Sample meets the quality bar (see README)
- [ ] Sample line count 50-100
- [ ] All `exercises` items demonstrably present in sample
- [ ] Sample tokenizes cleanly under Shiki
- [ ] `shikiLang` is a valid Shiki built-in language id
- [ ] `node scripts/rebuild-index.mjs --check` passes

## CI

Every PR runs `node scripts/rebuild-index.mjs --check` to validate file shapes. When a PR merges to `main`, the index at `data/_index.json` is automatically regenerated and committed.
