import * as fs from "fs";
import path from "path";

// some files, e.g. index or 404 pages, are served without a folder
// other files, e.g. blog posts, are served from a folder
// with `build.format: 'file'`, pages are written as `page.html` instead of `page/index.html`
// and the pathname has no trailing slash, so:
// 1. prefer directory-style output: …/page/index.html
// 2. fall back to file-style output: …/page.html
export function getFilePath({ dir, page }: { dir: string; page: string }) {
  // the pathname may have a trailing slash (directory format) or not (file format)
  const withoutSlashes = page.replace(/^\/+|\/+$/g, "");

  // for the site root, this is just `dir/index.html`
  const target = path.join(dir, withoutSlashes, "index.html");

  if (fs.existsSync(target)) {
    return target;
  }

  // the site root always maps to index.html
  if (withoutSlashes === "") {
    return target;
  }

  return path.join(dir, `${withoutSlashes}.html`);
}

export function getImagePath({
  url,
  site,
  format = "png",
}: {
  url: URL;
  site: URL | undefined;
  format?: "png" | "webp" | "jpeg";
}): string {
  if (!site) {
    throw new Error(
      "`site` must be set in your Astro configuration: https://docs.astro.build/en/reference/configuration-reference/#site",
    );
  }

  let target = url.pathname;

  // if url ends with a slash, it's a directory
  // add index.<format> to the end
  if (target.endsWith("/")) {
    target = target + `index.${format}`;
  } else {
    target = target + `.${format}`;
  }

  // Astro creates these as top-level files rather than in a folder
  if (target === `/404/index.${format}`) {
    return site.toString() + `404.${format}`;
  } else if (target === `/500/index.${format}`) {
    return site.toString() + `500.${format}`;
  }

  // remove leading slash
  target = target.slice(1);
  // add site URL
  target = site.toString() + target;

  return target;
}

async function createObjectURL(blob: Blob) {
  return `data:${blob.type};base64,${btoa(
    (await blob.bytes()).reduce((data, byte) => data + String.fromCharCode(byte), ""),
  )}`;
}

export async function fetchImage(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();

  return createObjectURL(blob);
}
