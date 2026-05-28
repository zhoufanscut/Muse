# Contributing

Muse is a toy I built for fun, so please read this as "here's how, if you feel like it" rather than a process to follow. There's no roadmap and no obligation. If you add a font, theme, or language you like, I'd be glad to see a PR — and just as glad if you fork it and keep the changes to yourself.

The nice part of the data layout: every contribution is a new file in `data/`. You never edit shared files, so PRs basically can't conflict.

## The gist

**Font** — add `data/fonts/<id>.json`. Check that the `cssUrl` actually loads (try it in a private window), that the `id` matches the filename, and that the font is something you're allowed to share (a `credits` link is nice).

**Theme** — add `data/themes/<id>.json`, any valid VSCode theme JSON. A screenshot in the PR helps me see what it looks like. The filename id shouldn't collide with a Shiki built-in theme name.

**Language** — add `data/languages/<id>.json` plus `data/samples/<id>.txt`. Keep the sample a small, self-contained, real-looking program (~50–100 lines) that tokenizes cleanly, and make `shikiLang` a real Shiki language id.

One small reserved-word note: ids starting with `custom-` belong to the in-browser uploader, so don't use that prefix for committed files.

## CI

You don't have to run anything — every PR runs `node scripts/rebuild-index.mjs --check` to make sure the files are shaped right, and the catalog regenerates itself once things land on `main`. If you'd rather check locally first:

```bash
node scripts/rebuild-index.mjs --check
```

That's it. Thanks for taking a look.
