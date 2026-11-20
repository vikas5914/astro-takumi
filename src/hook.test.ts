import { createElement } from "react";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import type { AstroIntegrationLogger } from "astro";
import { buildDoneHook } from "./hook.js";
import { computeGlobalKey } from "./cache.js";
import type { IntegrationOptions, Page, RenderFunction } from "./types.js";

const SITE = "http://example.com";

function fakeLogger(lines: string[]): AstroIntegrationLogger {
  const info = (msg: string) => {
    lines.push(String(msg));
  };
  // SAFETY: buildDoneHook only uses info/warn on the logger surface.
  // SAFETY: buildDoneHook only uses info/warn/error/level on the logger surface.
  return { info, warn: info, error: info, level: "info" } as unknown as AstroIntegrationLogger;
}

const options: IntegrationOptions = {
  width: 400,
  height: 210,
  format: "png",
  quality: 100,
  verbose: false,
  drawDebugBorder: false,
  domBackend: "linkedom",
  cache: true,
};

// render depends on the title so content changes produce different bytes
const render: RenderFunction = ({ title }) =>
  createElement(
    "div",
    { style: { display: "flex", width: "100%", height: "100%", backgroundColor: "#000", color: "#fff" } },
    title,
  );

function pageHtml(title: string, pathname: string): string {
  const image = `${SITE}${pathname.endsWith("/") ? `${pathname}index` : pathname}.png`;
  return `<!doctype html><html><head>
<meta property="og:title" content="${title}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${pathname}">
<meta property="og:image" content="${image}">
</head><body>${title}</body></html>`;
}

async function writePages(dist: string, titles: Record<string, string>): Promise<Page[]> {
  const pages: Page[] = [];
  for (const [pathname, title] of Object.entries(titles)) {
    const rel = pathname.replace(/^\/+|\/+$/g, "");
    if (rel === "") {
      await writeFile(join(dist, "index.html"), pageHtml(title, "/"));
    } else {
      await mkdir(join(dist, rel), { recursive: true });
      await writeFile(join(dist, rel, "index.html"), pageHtml(title, pathname));
    }
    pages.push({ pathname });
  }
  return pages;
}

test("buildDoneHook: cold renders, warm hits, content-change invalidation", async () => {
  const root = await mkdtemp(join(tmpdir(), "takumi-hook-"));
  const dist = join(root, "dist");
  const cacheDir = join(root, "cache");
  await mkdir(dist, { recursive: true });

  const globalKey = computeGlobalKey({
    render,
    options: { ...options, cacheDir },
    versions: { integration: "t", core: "t" },
  });
  const dir = pathToFileURL(dist + "/");

  const pages = await writePages(dist, { "/": "Home", "/blog/a/": "Post A", "/blog/b/": "Post B" });

  // cold run
  const lines1: string[] = [];
  await buildDoneHook({ logger: fakeLogger(lines1), pages, dir, options: { ...options, cacheDir }, render, globalKey });
  expect(lines1.some((l) => l.includes("0 cached, 3 rendered"))).toBe(true);
  const pngA1 = await readFile(join(dist, "blog/a/index.png"));
  const pngB1 = await readFile(join(dist, "blog/b/index.png"));
  expect(pngA1.length).toBeGreaterThan(0);

  // warm run: delete outputs, they must be restored byte-identically from cache
  await rm(join(dist, "blog/b/index.png"));
  await rm(join(dist, "index.png"));
  const lines2: string[] = [];
  await buildDoneHook({ logger: fakeLogger(lines2), pages, dir, options: { ...options, cacheDir }, render, globalKey });
  expect(lines2.some((l) => l.includes('3 cached, 0 rendered'))).toBe(true);
  const pngB2 = await readFile(join(dist, "blog/b/index.png"));
  expect(Buffer.compare(pngB1, pngB2)).toBe(0);

  // content change: only blog/a re-renders
  await writeFile(join(dist, "blog/a/index.html"), pageHtml("Post A v2", "/blog/a/"));
  const lines3: string[] = [];
  await buildDoneHook({ logger: fakeLogger(lines3), pages, dir, options: { ...options, cacheDir }, render, globalKey });
  expect(lines3.some((l) => l.includes('2 cached, 1 rendered'))).toBe(true);
  const pngA3 = await readFile(join(dist, "blog/a/index.png"));
  expect(Buffer.compare(pngA1, pngA3)).not.toBe(0);

  // config change (render fn) invalidates everything
  const render2: RenderFunction = ({ title }) =>
    createElement("div", { style: { width: "100%", height: "100%", backgroundColor: "#fff", color: "#000" } }, title);
  const globalKey2 = computeGlobalKey({
    render: render2,
    options: { ...options, cacheDir },
    versions: { integration: "t", core: "t" },
  });
  const lines4: string[] = [];
  await buildDoneHook({
    logger: fakeLogger(lines4),
    pages,
    dir,
    options: { ...options, cacheDir },
    render: render2,
    globalKey: globalKey2,
  });
  expect(lines4.some((l) => l.includes("0 cached, 3 rendered"))).toBe(true);

  await rm(root, { recursive: true, force: true });
}, 60000);

test("buildDoneHook: cache:false always renders", async () => {
  const root = await mkdtemp(join(tmpdir(), "takumi-nocache-"));
  const dist = join(root, "dist");
  await mkdir(dist, { recursive: true });
  const dir = pathToFileURL(dist + "/");
  const globalKey = computeGlobalKey({ render, options, versions: { integration: "t", core: "t" } });
  const pages = await writePages(dist, { "/": "Home" });

  const lines: string[] = [];
  const opts = { ...options, cache: false };
  await buildDoneHook({ logger: fakeLogger(lines), pages, dir, options: opts, render, globalKey });
  await buildDoneHook({ logger: fakeLogger(lines), pages, dir, options: opts, render, globalKey });
  expect(lines.filter((l) => l.includes("0 cached, 1 rendered")).length).toBe(2);

  await rm(root, { recursive: true, force: true });
}, 30000);
