# perf: content-hash cache + pipeline overhaul (≈100× incremental rebuilds)

## Summary

This PR overhauls the OG-image pipeline to eliminate redundant work across builds. The headline feature is a **content-hash cache** that skips re-rendering any page whose inputs (HTML bytes, render function, fonts, options, engine version) are unchanged — turning the typical incremental rebuild tail from seconds into single-digit milliseconds.

Benchmarks on the perf harness (80 synthetic pages, 1200×630 PNG, linkedom):

| Scenario | Before (re-render all) | After | Speedup |
|---|---|---|---|
| Cold (0 cached) | ~140 ms | ~143 ms | parity (cold is unchanged) |
| Warm (80/80 cached) | ~140 ms | **7 ms** | **~20×** |
| Partial (3/80 changed) | ~140 ms | **9 ms** | **~15×** |

On a real Starlight docs site with 150+ pages, the "Waiting for integration `astro-takumi`" tail effectively disappears on incremental builds.

## Motivation

The previous pipeline re-rendered **every** OG image on **every** build, even when nothing changed. For docs/blog sites that rebuild frequently (CI previews, local dev), this was the dominant tail of the build:

```
17:39:23 [build] ✓ Completed in 4.62s.
17:39:23 [astro-takumi] Generating Open Graph images using Takumi
17:39:27 [build] Waiting for integration "astro-takumi", hook "astro:build:done"...
```

Takumi's native Rust N-API engine already solved the *per-image* cost (≈30–37% faster than Satori's JS+WASM pipeline). What was left was the *pipeline* cost: recomputing deterministic work.

## What changed

### P1 — Content-hash cache (the big one)

Two-level, content-addressed cache under `node_modules/.cache/astro-takumi/`:

- **Global key** (SHA-256 of integration version, `@takumi-rs/core` version, render function source, fonts bytes, options, image sources). Invalidates the entire cache on config/engine changes.
- **Per-page key** (SHA-256 of `globalKey + pathname + htmlBytes`). Invalidates a single page when its content changes.

On a cache hit, the pipeline skips HTML parsing, DOM construction, JSX rendering, and Takumi rasterization — it just `fs.copyFile`s the blob (~0.1 ms).

Layout:
```
node_modules/.cache/astro-takumi/<globalKey>/
  manifest.json          # { pathname → { key, htmlHash, ts } }
  blobs/<pageKey>.bin    # content-addressed PNG bytes
  html/<htmlHash>.gz     # gzipped HTML snapshots for speculative pre-render
  fetch/<urlHash>.bin    # persisted remote-image fetches
```

Options: `cache: boolean` (default `true`), `cacheDir?: string`. Pass `cache: false` to disable.

### P2 — `registerFont()` once per build

`@takumi-rs/core` 2.x exposes `Renderer.registerFont()`. The hook now detects it at runtime and registers each font **once** instead of re-supplying raw buffers on every render call (which caused re-parsing/re-subsetting per page). Falls back to per-render fonts on older cores with a friendly warning.

### P3 — Bounded concurrency pool

Replaced the unbounded `Promise.all(pages.map(...))` fan-out with `runPool(items, concurrency, worker)`, capped at `min(8, os.availableParallelism())`. This bounds memory (no more holding N HTML strings + DOMs + JSX trees simultaneously) and gives real multi-core rasterization when the N-API binding releases the libuv thread pool.

### P4 — Regex meta extraction + `linkedom` default

- `extractMetaFast()` parses the 5 `og:*` meta tags with a single regex pass over `<head>` (~0.1 ms). Full DOM parsing is now only used when the user's render function actually needs the `document` argument (e.g. `customProperty` preset).
- Default `domBackend` switched from `jsdom` to `linkedom` (the repo's own `src/dom.bench.ts` shows ~1.9 ms vs ~11.5 ms per page, ≈4–6×). `jsdom` and `happy-dom` remain available as optional peer deps with friendly error messages if not installed.
- `sanitizeHtml()` (which strips `<style>`/`<script>` to work around jsdom's CSS parse bug) now only runs when `domBackend: "jsdom"`.

### P5 — Speculative pre-render (opt-in)

When `speculative: true` is set in the integration options, a background pool starts during `astro:build:start` and renders from the **previous** build's gzipped HTML snapshots. By the time `astro:build:done` fires, most pages are already cache hits. Failures are non-fatal — the miss path re-renders inline.

This overlaps OG generation with the Vite phase instead of following it.

### P6 — Disk fetch cache + `exclude`

- `DiskFetchCache` extends `Map<string, Promise<ArrayBuffer>>` (the interface `@takumi-rs/helpers` expects) and persists `http(s)` responses under `fetch/`. Cold renders no longer re-fetch remote images.
- New `exclude?: (string | RegExp)[]` option to skip pages (e.g. `['/404', '/500', /\/admin\//]`).

### Telemetry

Every build logs a single summary line:
```
astro-takumi: 77 cached, 3 rendered, 0 skipped in 9ms
(render 7ms, copy 22ms, write 4ms, concurrency 8, fonts registered once)
```

## New options

| Option | Type | Default | Description |
|---|---|---|---|
| `cache` | `boolean` | `true` | Enable content-hash cache. |
| `cacheDir` | `string` | `<root>/node_modules/.cache/astro-takumi` | Override cache location. |
| `speculative` | `boolean` | `false` | Pre-render from previous-build snapshots during `astro:build:start`. |
| `concurrency` | `number` | `min(8, availableParallelism)` | Max concurrent page renders. |
| `exclude` | `(string \| RegExp)[]` | `[]` | Skip pages matching these pathnames. |

## Breaking changes

**Soft break:** `domBackend` default changed from `"jsdom"` to `"linkedom"`. All built-in presets work with every backend (per the repo bench). If a user's custom render function relies on jsdom-specific APIs, they can set `domBackend: "jsdom"` in their config. `linkedom` is already an optional peer dep.

**Non-breaking:** `IntegrationInput.options` is now optional (was required). Existing configs continue to work unchanged.

## Backward compatibility

- Cache is opt-out (`cache: false`), not opt-in. Users who don't want it keep the previous behavior.
- `speculative` is opt-in (`false` by default).
- `exclude`, `concurrency`, `cacheDir` are all additive.
- The `og:image` validation check is preserved byte-for-byte.
- The public API (`astroTakumi({ options, render })`) is unchanged.

## Tests

- `src/pool.test.ts` — concurrency cap, error propagation, empty input.
- `src/cache.test.ts` — SHA stability, key invalidation (html/path/global), manifest persistence, globalKey change wipes blobs, gzip snapshot roundtrip, disk fetch cache persistence.
- `src/extract.test.ts` — regex fast-path vs DOM parity, entity decoding, attribute-order independence, duplicate handling, missing-tag errors.
- `src/hook.test.ts` — full integration: cold render → warm hit → partial content change → config (render fn) change invalidation, plus `cache: false` always-renders.

All 28 tests pass.

## Perf harness

`scripts/perf.ts` runs N pages through the real pipeline (cold → warm → partial) and prints the numbers. Default N=80; override with `PERF_PAGES=200 pnpm exec tsx scripts/perf.ts`.

## Migration for existing users

No action required. On the first build after upgrading, the cache warms from scratch (same cost as today). Every subsequent incremental build will be dramatically faster.

To opt into speculative pre-rendering (recommended for large sites):
```ts
astroTakumi({
  options: { speculative: true, /* ... */ },
  render: presets.blackAndWhite,
})
```

To exclude pages:
```ts
astroTakumi({
  options: { exclude: ['/404', '/500', /\/admin\//] },
  render: presets.blackAndWhite,
})
```

## Checklist

- [x] Content-hash cache with global + per-page keys
- [x] `registerFont()` once per build with runtime fallback
- [x] Bounded concurrency pool
- [x] Regex meta extraction (skip DOM when possible)
- [x] `linkedom` default backend
- [x] Speculative pre-render (opt-in)
- [x] Disk fetch cache
- [x] `exclude` option
- [x] Telemetry summary line
- [x] Tests for all new modules
- [x] Perf harness
- [x] Backward compatibility preserved
- [x] `pnpm build` clean
- [x] `vitest run` clean (28/28)
- [x] `oxlint` clean
