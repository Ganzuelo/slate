# Vendored Dataview engine

Source: https://github.com/blacksmithgu/obsidian-dataview

Version: 0.5.70, commit `5ad0994ff384cbb797de382e7edff2388141b73a`.

The TypeScript modules in `src/` are unmodified upstream source. Only the
query/expression engine, Markdown data import, values, DataArray, settings, and
their dependencies are retained. `modules.json` records the runtime modules
included by esbuild. The serialized Markdown types are also retained.

The MIT license is retained in `LICENSE.txt` and appended to the generated worker,
alongside licenses for every bundled dependency.

Slate supplies its own read-only index and Markdown cache adapter in
`public/dataview-engine.js`. `public/dataview-index-shim.js` supplies the two path
filters used by upstream's resolver, without importing Obsidian's plugin runtime.
The Obsidian UI, plugin lifecycle, persistence layer, workers, and tests are not
included. Type-only Obsidian imports are erased by esbuild.

Run `npm run build:dataview` after changing the adapter or vendored source. Commit
the generated `public/vendor/dataview-worker.js` with source changes.
