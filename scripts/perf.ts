/**
 * Perf harness: N synthetic pages through the real pipeline, cold → warm →
 * partial-change, printing the numbers we care about. Run: pnpm exec tsx scripts/perf.ts
 */
import { createElement } from "react";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AstroIntegrationLogger } from "astro";
import { buildDoneHook } from "../src/hook.js";
import { computeGlobalKey } from "../src/cache.js";
import type { IntegrationOptions, Page, RenderFunction } from "../src/types.js";

const N = Number(process.env.PERF_PAGES ?? 80);
const SITE = "http://example.com";

const logger = {
  info: (m: unknown) =>{  console.log(`  ${String(m)}`); },
  warn: (m: unknown) =>{  console.log(`  WARN ${String(m)}`); },
  error: (m: unknown) =>{  console.log(`  ERR ${String(m)}`); },
  level: "info",
} as unknown as AstroIntegrationLogger; // SAFETY: mock logger for perf harness, only info/warn/error/level are used

const options: IntegrationOptions = {
  width: 1200,
  height: 630,
  format: "png",
  quality: 100,
  verbose: false,
  drawDebugBorder: false,
  domBackend: "linkedom",
  cache: true,
};

const render: RenderFunction = ({ title }) =>
  createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#0c0f17",
        color: "#fff",
        fontSize: 72,
      },
    },
    title,
  );

function pageHtml(title: string, pathname: string): string {
  return `<!doctype html><html><head>
<meta property="og:title" content="${title}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${pathname}">
<meta property="og:image" content="${SITE}${pathname}index.png">
</head><body>${title}</body></html>`;
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "takumi-perf-"));
  const dist = join(root, "dist");
  const cacheDir = join(root, "cache");
  await mkdir(dist, { recursive: true });

  const pages: Page[] = [];
  for (let i = 0; i < N; i++) {
    const pathname = `/post-${i}/`;
    await mkdir(join(dist, `post-${i}`), { recursive: true });
    await writeFile(join(dist, `post-${i}`, "index.html"), pageHtml(`Post ${i}`, pathname));
    pages.push({ pathname });
  }
  const dir = pathToFileURL(dist + "/");
  const globalKey = computeGlobalKey({
    render,
    options: { ...options, cacheDir },
    versions: { integration: "perf", core: "perf" },
  });

  console.log(`\n=== astro-takumi perf harness (${N} pages) ===`);

  let t = performance.now();
  await buildDoneHook({ logger, pages, dir, options: { ...options, cacheDir }, render, globalKey });
  console.log(`COLD total: ${Math.round(performance.now() - t)}ms`);

  t = performance.now();
  await buildDoneHook({ logger, pages, dir, options: { ...options, cacheDir }, render, globalKey });
  console.log(`WARM total: ${Math.round(performance.now() - t)}ms`);

  const changed = 3;
  for (let i = 0; i < changed; i++) {
    const pathname = `/post-${i}/`;
    await writeFile(join(dist, `post-${i}`, "index.html"), pageHtml(`Post ${i} EDITED`, pathname));
  }
  t = performance.now();
  await buildDoneHook({ logger, pages, dir, options: { ...options, cacheDir }, render, globalKey });
  console.log(`PARTIAL (${changed} changed) total: ${Math.round(performance.now() - t)}ms`);

  await rm(root, { recursive: true, force: true });
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
