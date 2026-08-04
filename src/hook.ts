import { Renderer } from "@takumi-rs/core";
import { prepareImages } from "@takumi-rs/helpers";
import { fromJsx } from "@takumi-rs/helpers/jsx";
import type { AstroBuildDoneHookInput, IntegrationOptions, Page, RenderFunction } from "./types.js";
import * as fs from "fs/promises";
import type { AstroIntegrationLogger } from "astro";
import { extract, sanitizeHtml } from "./extract.js";
import { getFilePath } from "./util.js";
import { fileURLToPath } from "url";
import * as jsdom from "jsdom";
import path from "path";

export async function buildDoneHook({
  logger,
  pages,
  options,
  dir,
  render,
}: AstroBuildDoneHookInput & {
  options: IntegrationOptions;
  render: RenderFunction;
}) {
  logger.info("Generating Open Graph images using Takumi");

  // Takumi 2: Renderer takes no constructor args; fonts/images are per-render.
  const renderer = new Renderer();
  // Share a byte cache across pages so remote assets are only fetched once.
  const fetchCache = new Map<string, Promise<ArrayBuffer>>();
  const promises = pages.map((page) => handlePage({ page, options, render, dir, logger, renderer, fetchCache }));
  await Promise.all(promises);
}

interface HandlePageInput {
  page: Page;
  options: IntegrationOptions;
  render: RenderFunction;
  dir: URL;
  logger: AstroIntegrationLogger;
  renderer: Renderer;
  fetchCache: Map<string, Promise<ArrayBuffer>>;
}

async function handlePage({ page, options, render, dir, logger, renderer, fetchCache }: HandlePageInput) {
  // gets the absolute path to the HTML file. E.g. /home/user/project/dist/blog/index.html
  // fileURLToPath() converts the URL to a file path. Without it, the path would start with a leading slash on Windows
  // systems, resulting in an invalid path.
  const htmlFile = getFilePath({ dir: fileURLToPath(dir), page: page.pathname });

  // read the HTML file and parse it with jsdom
  const html = (await fs.readFile(htmlFile)).toString();
  const document = new jsdom.JSDOM(sanitizeHtml(html)).window.document;

  // extract the OpenGraph properties from the HTML file
  const pageDetails = extract(document);

  // render the image using Takumi
  const reactNode = await render({ ...page, ...pageDetails, dir, document });
  const { node, stylesheets } = await fromJsx(reactNode);
  const images = await prepareImages({
    node,
    ...(options.images ? { sources: options.images } : {}),
    fetchCache,
  });

  // quality is only valid for jpeg / lossy webp in Takumi 2's format union
  const formatOptions =
    options.format === "jpeg" || options.format === "webp"
      ? ({ format: options.format, quality: options.quality } as const)
      : ({ format: options.format } as const);

  const imageBuffer = await renderer.render(node, {
    width: options.width,
    height: options.height,
    ...formatOptions,
    drawDebugBorder: options.drawDebugBorder,
    stylesheets,
    images,
    ...(options.fonts ? { fonts: options.fonts } : {}),
    ...(options.fontFamilies ? { fontFamilies: options.fontFamilies } : {}),
  });

  // save the image file. The file name is the same as the HTML file, but with the appropriate extension.
  const imageFile = htmlFile.replace(/\.html$/, `.${options.format}`);
  await fs.writeFile(imageFile, imageBuffer);

  // get the relative filesystem path to the image file from the output directory. E.g. blog/index.webp
  // path.relative() returns the relative path from the first argument to the second argument.
  const relativeImageFile = path.relative(fileURLToPath(dir), imageFile).replace(/\\/g, "/");

  // convert the image path to a URL and remove the leading slash
  const imageUrl = new URL(pageDetails.image).pathname.slice(1);

  // check that the og:image property matches the sitePath
  if (decodeURIComponent(imageUrl) !== relativeImageFile) {
    throw new Error(
      `The og:image property in ${htmlFile} (${imageUrl}) does not match the generated image (${relativeImageFile}).`,
    );
  }

  if (options.verbose) {
    logger.info(`Generated ${relativeImageFile} for ${htmlFile}.`);
  }
}
