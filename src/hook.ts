import { Renderer } from "@takumi-rs/core";
import type { FontLoader, ImageSource, RenderOptions } from "@takumi-rs/core";
import { prepareImages } from "@takumi-rs/helpers";
import type { PrepareImagesOptions } from "@takumi-rs/helpers";
import { fromJsx } from "@takumi-rs/helpers/jsx";
import type { AstroIntegrationLogger } from "astro";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ManifestEntry } from "./cache.js";
import { DiskFetchCache, OgCache, defaultCacheRoot, pageCacheKey, sha256Hex } from "./cache.js";
import { createDocument } from "./dom.js";
import { extractMetaFast } from "./extract.js";
import { runPool } from "./pool.js";
import type { IntegrationOptions, Page, RenderFunction } from "./types.js";
import { getFilePath } from "./util.js";

export interface BuildDoneHookInput {
  logger: AstroIntegrationLogger;
  pages: Page[];
  dir: URL;
  options: IntegrationOptions;
  render: RenderFunction;
  globalKey: string;
  speculative?: Promise<void>;
}

export interface SpeculativeInput {
  logger: AstroIntegrationLogger;
  options: IntegrationOptions;
  render: RenderFunction;
  globalKey: string;
}

interface RenderedPage {
  html: Buffer;
  pathname: string;
  key: string;
  buffer: Buffer;
}

export async function buildDoneHook({
  logger,
  pages,
  options,
  dir,
  render,
  globalKey,
  speculative,
}: BuildDoneHookInput): Promise<void> {
  const t0 = performance.now();
  logger.info("Generating Open Graph images using Takumi");

  const cacheRoot = options.cacheDir ? path.resolve(options.cacheDir) : defaultCacheRoot();
  const cache = options.cache === false ? undefined : new OgCache(cacheRoot, globalKey);
  if (cache) await cache.init();

  if (speculative !== undefined) {
    const s0 = performance.now();
    try {
      await speculative;
    } catch (e) {
      logger.warn(`astro-takumi: speculative pre-render failed (${String(e)}); falling back to inline rendering`);
    }
    logger.info(`astro-takumi: waited ${Math.round(performance.now() - s0)}ms for speculative pre-render`);
  }

  const renderer = new Renderer();
  const fontsRegistered = await registerFontsOnce(renderer, options.fonts, logger);
  const fetchCache: Map<string, Promise<ArrayBuffer>> = cache ? new DiskFetchCache(cache.fetchDir) : new Map();

  const parallelism = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const level = Math.max(1, Math.min(options.concurrency ?? Math.min(8, parallelism), pages.length || 1));

  const exclude = options.exclude;
  const targets =
    exclude !== undefined && exclude.length > 0 ? pages.filter((p) => !isExcluded(p.pathname, exclude)) : pages;
  const skipped = pages.length - targets.length;

  let hits = 0;
  let misses = 0;
  let copyMs = 0;
  let renderMs = 0;
  let writeMs = 0;

  const distPath = fileURLToPath(dir);

  await runPool(targets, level, async (page) => {
    const htmlFile = getFilePath({ dir: distPath, page: page.pathname });
    const html = await fs.readFile(htmlFile);
    const htmlHash = sha256Hex(html);
    const key = pageCacheKey(globalKey, page.pathname, htmlHash);
    const imageFile = htmlFile.replace(/\.html$/, `.${options.format}`);

    if (cache) {
      const entry = cache.getEntry(page.pathname);
      if (entry !== undefined && entry.key === key && (await cache.hasBlob(key))) {
        const c0 = performance.now();
        await fs.copyFile(cache.blobPath(key), imageFile);
        copyMs += performance.now() - c0;
        hits++;
        return;
      }
    }

    const r0 = performance.now();
    const htmlString = html.toString();
    const details = extractMetaFast(htmlString);
    const document = await createDocument(htmlString, options.domBackend);
    const reactNode = await render({ ...page, ...details, dir, document });
    const { node, css } = await fromJsx(reactNode);

    const prepareImagesOptions: PrepareImagesOptions<ImageSource> = { node, fetchCache };
    if (options.images) {
      prepareImagesOptions.sources = options.images;
    }
    // oxlint-disable-next-line typescript/no-deprecated
    const images = await prepareImages(prepareImagesOptions);

    const renderOptions = buildRenderOptions(options, css, images, fontsRegistered);
    const imageBuffer = await renderer.render(node, renderOptions);
    renderMs += performance.now() - r0;

    const w0 = performance.now();
    await fs.writeFile(imageFile, imageBuffer);
    if (cache) {
      await cache.putBlob(key, imageBuffer);
      await cache.snapshotHtml(htmlHash, html);
      const entry: ManifestEntry = { pathname: page.pathname, htmlHash, key, ts: Date.now() };
      cache.record(entry);
    }
    writeMs += performance.now() - w0;
    misses++;

    const relativeImageFile = path.relative(distPath, imageFile).replace(/\\/g, "/");
    const imageUrl = decodeURIComponent(new URL(details.image).pathname).slice(1);
    if (imageUrl !== relativeImageFile) {
      throw new Error(
        `The og:image property in ${htmlFile} (${imageUrl}) does not match the generated image (${relativeImageFile}).`,
      );
    }

    if (options.verbose) {
      logger.info(`Generated ${relativeImageFile} for ${htmlFile}.`);
    }
  });

  if (cache) await cache.flush();

  const total = Math.round(performance.now() - t0);
  logger.info(
    `astro-takumi: ${String(hits)} cached, ${String(misses)} rendered, ${String(skipped)} skipped in ${String(total)}ms ` +
      `(render ${String(Math.round(renderMs))}ms, copy ${String(Math.round(copyMs))}ms, write ${String(Math.round(writeMs))}ms, ` +
      `concurrency ${String(level)}${options.cache === false ? ", cache off" : ""}${
        fontsRegistered ? ", fonts registered once" : ""
      })`,
  );
}

export async function speculativePreRender({ logger, options, render, globalKey }: SpeculativeInput): Promise<void> {
  const cacheRoot = options.cacheDir ? path.resolve(options.cacheDir) : defaultCacheRoot();
  const manifest = await OgCache.load(cacheRoot);
  if (manifest === undefined || manifest.globalKey !== globalKey) return;

  const cache = new OgCache(cacheRoot, globalKey);
  await cache.init();
  const entries = Object.values(manifest.entries);
  if (entries.length === 0) return;

  const renderer = new Renderer();
  const fontsRegistered = await registerFontsOnce(renderer, options.fonts, logger);
  const fetchCache: Map<string, Promise<ArrayBuffer>> = new DiskFetchCache(cache.fetchDir);

  const parallelism = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const level = Math.max(1, Math.min(options.concurrency ?? Math.min(4, parallelism), entries.length));

  const exclude = options.exclude;
  const targets =
    exclude !== undefined && exclude.length > 0 ? entries.filter((e) => !isExcluded(e.pathname, exclude)) : entries;

  let done = 0;
  await runPool(targets, level, async (entry) => {
    if (await cache.hasBlob(entry.key)) {
      done++;
      return;
    }
    const html = await cache.readHtmlSnapshot(entry.htmlHash);
    if (html === undefined) return;
    try {
      const rendered = await renderPageToBuffer({
        html,
        page: { pathname: entry.pathname },
        options,
        render,
        renderer,
        fetchCache,
        fontsRegistered,
        globalKey,
        dir: new URL("http://localhost/"),
      });
      await cache.putBlob(rendered.key, rendered.buffer);
      done++;
    } catch (e) {
      logger.warn(`astro-takumi: speculative render failed for ${entry.pathname} (${String(e)})`);
    }
  });

  await cache.flush();
  logger.info(`astro-takumi: speculative pre-render prepared ${String(done)}/${String(targets.length)} pages`);
}

interface RenderPageInput {
  html: Buffer;
  page: Page;
  options: IntegrationOptions;
  render: RenderFunction;
  renderer: Renderer;
  fetchCache: Map<string, Promise<ArrayBuffer>>;
  fontsRegistered: boolean;
  globalKey: string;
  dir: URL;
}

async function renderPageToBuffer(input: RenderPageInput): Promise<RenderedPage> {
  const htmlHash = sha256Hex(input.html);
  const key = pageCacheKey(input.globalKey, input.page.pathname, htmlHash);
  const details = extractMetaFast(input.html.toString());
  const document = await createDocument(input.html.toString(), input.options.domBackend);
  const reactNode = await input.render({ ...input.page, ...details, dir: input.dir, document });
  const { node, css } = await fromJsx(reactNode);
  const prepareImagesOptions: PrepareImagesOptions<ImageSource> = { node, fetchCache: input.fetchCache };
  if (input.options.images) {
    prepareImagesOptions.sources = input.options.images;
  }
  // oxlint-disable-next-line typescript/no-deprecated
  const images = await prepareImages(prepareImagesOptions);
  const renderOptions = buildRenderOptions(input.options, css, images, input.fontsRegistered);
  const buffer = await input.renderer.render(node, renderOptions);
  return { html: input.html, pathname: input.page.pathname, key, buffer };
}

// oxlint-disable typescript/no-explicit-any, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-runtime-typeof
function buildRenderOptions(
  options: IntegrationOptions,
  css: string | string[] | undefined,
  images: ImageSource[],
  fontsRegistered: boolean,
): RenderOptions {
  const cssArray = typeof css === "string" ? [css] : (css ?? []);
  const renderOptions: RenderOptions = {
    width: options.width,
    height: options.height,
    drawDebugBorder: options.drawDebugBorder,
    css: cssArray,
    images,
    format: options.format as any,
  };

  if (options.format === "jpeg" || options.format === "webp") {
    (renderOptions as any).quality = options.quality;
  }

  if (!fontsRegistered && options.fonts) {
    (renderOptions as any).fonts = options.fonts;
  }
  if (options.fontFamilies) {
    (renderOptions as any).fontFamilies = options.fontFamilies;
  }
  return renderOptions;
}

async function registerFontsOnce(
  renderer: Renderer,
  fonts: FontLoader[] | undefined,
  logger: AstroIntegrationLogger,
): Promise<boolean> {
  if (fonts === undefined || fonts.length === 0) return false;
  const candidate = renderer as unknown as { registerFont?: (font: FontLoader) => void | Promise<void> };
  if (typeof candidate.registerFont !== "function") {
    logger.warn("astro-takumi: @takumi-rs/core has no registerFont(); using per-render fonts");
    return false;
  }
  try {
    for (const font of fonts) {
      await Promise.resolve(candidate.registerFont(font));
    }
    return true;
  } catch (e) {
    logger.warn(`astro-takumi: registerFont failed (${String(e)}); using per-render fonts`);
    return false;
  }
}

function isExcluded(pathname: string, patterns: (string | RegExp)[]): boolean {
  return patterns.some((p) => (typeof p === "string" ? pathname.includes(p) : p.test(pathname)));
}
