# anti-slop provenance

- **Source:** Vendored from the `install-anti-slop` skill bundle (`assets/anti-slop`).
  The bundle carries no git identity; the recoverable pristine snapshot is the skill
  directory itself (`~/.agents/skills/install-anti-slop/assets/anti-slop`). Upstream
  revision: unknown (no commit recorded in the bundle).
- **Installed:** 2026-09-10.
- **Installed plugin path:** `tools/oxlint/anti-slop/` (generic plugin; entry point
  `tools/oxlint/anti-slop/index.ts`).
- **Dependencies:** `@oxlint/plugins@1.82.0`, pinned exactly to match `oxlint@1.82.0`
  (both exact, so future upgrades move together).
- **Intentional deviations:**
  - The opt-in Effect plugin (`anti-slop-effect`) is **not** registered: this repo has no
    direct `effect` dependency.
  - `examples` is added to `ignorePatterns` to preserve the previous ESLint setup's
    lint scope (`eslint src` — the Astro examples were never linted).
- **Migration context:** This plugin was added while replacing ESLint with Oxlint.
  The base ruleset came from `npx @oxlint/migrate eslint.config.js --type-aware`
  (ESLint core recommended + typescript-eslint strict/stylistic type-checked rules).
