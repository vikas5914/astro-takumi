import { Renderer } from "@takumi-rs/core";
import type { ImageSource, RenderOptions } from "@takumi-rs/core";
import { prepareImages } from "@takumi-rs/helpers";
import type { PrepareImagesOptions } from "@takumi-rs/helpers";
import { fromJsx } from "@takumi-rs/helpers/jsx";
import type {
  AstroBuildDoneHookInput,
  IntegrationOptions,
  Page,
  PageDetails,
  RenderFunction,
  RenderFunctionInput,
} from "./types.js";
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

  // Takumi 2: fonts/images are supplied per render, so the renderer needs no constructor setup.
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

interface RenderInputFactoryInput {
  page: Page;
  pageDetails: PageDetails;
  dir: URL;
  html: string;
}

// Build the RenderFunctionInput for a page, exposing `document` as a lazily-built,
// per-page cached jsdom document. The jsdom DOM — and the sanitizeHtml pass it
// needs — is constructed only when a render function reads `document`; presets
// that never touch the DOM skip it entirely. The public RenderFunctionInput
// type is unchanged (a getter satisfies `document: Document`).
export function buildRenderInput({ page, pageDetails, dir, html }: RenderInputFactoryInput): RenderFunctionInput {
  let cachedDocument: Document | undefined;
  return {
    ...page,
    ...pageDetails,
    dir,
    get document() {
      cachedDocument ??= new jsdom.JSDOM(sanitizeHtml(html)).window.document;
      return cachedDocument;
    },
  };
}

async function handlePage({ page, options, render, dir, logger, renderer, fetchCache }: HandlePageInput) {
  // gets the absolute path to the HTML file. E.g. /home/user/project/dist/blog/index.html
  // fileURLToPath() converts the URL to a file path. Without it, the path would start with a leading slash on Windows
  // systems, resulting in an invalid path.
  const htmlFile = getFilePath({ dir: fileURLToPath(dir), page: page.pathname });

  // read the HTML file
  const html = (await fs.readFile(htmlFile)).toString();

  // extract the OpenGraph properties from the HTML file
  const pageDetails = extract(html);

  // render the image using Takumi
  const reactNode = await render(buildRenderInput({ page, pageDetails, dir, html }));
  const { node, css } = await fromJsx(reactNode);

  const prepareImagesOptions: PrepareImagesOptions<ImageSource> = { node, fetchCache };
  if (options.images) {
    prepareImagesOptions.sources = options.images;
  }
  const images = await prepareImages(prepareImagesOptions);

  // quality is only valid for jpeg / lossy webp in Takumi 2's format union
  const formatOptions =
    options.format === "jpeg" || options.format === "webp"
      ? ({ format: options.format, quality: options.quality } as const)
      : ({ format: options.format } as const);

  const renderOptions: RenderOptions = {
    width: options.width,
    height: options.height,
    ...formatOptions,
    drawDebugBorder: options.drawDebugBorder,
    css,
    images,
  };
  if (options.fonts) {
    renderOptions.fonts = options.fonts;
  }
  if (options.fontFamilies) {
    renderOptions.fontFamilies = options.fontFamilies;
  }
  const imageBuffer = await renderer.render(node, renderOptions);

  // save the image file. The file name is the same as the HTML file, but with the appropriate extension.
  const imageFile = htmlFile.replace(/\.html$/, `.${options.format}`);
  await fs.writeFile(imageFile, imageBuffer);

  // get the relative filesystem path to the image file from the output directory. E.g. blog/index.webp
  // path.relative() returns the relative path from the first argument to the second argument.
  const relativeImageFile = path.relative(fileURLToPath(dir), imageFile).replace(/\\/g, "/");

  // convert the image path to a URL and remove the leading slash
  // the og:image URL is percent-encoded (e.g. spaces become %20), while the generated
  // image file path on disk is not, so decode it before comparing
  const imageUrl = decodeURIComponent(new URL(pageDetails.image).pathname).slice(1);

  // check that the og:image property matches the sitePath
  if (imageUrl !== relativeImageFile) {
    throw new Error(
      `The og:image property in ${htmlFile} (${imageUrl}) does not match the generated image (${relativeImageFile}).`,
    );
  }

  if (options.verbose) {
    logger.info(`Generated ${relativeImageFile} for ${htmlFile}.`);
  }
}
