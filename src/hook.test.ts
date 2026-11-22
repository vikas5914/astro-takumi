import { expect, test } from "vitest";
import { createElement } from "react";
import { isValidElement } from "react";
import { JSDOM } from "jsdom";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AstroIntegrationLogger } from "astro";
import { buildDoneHook, buildRenderInput } from "./hook.js";
import { customProperty } from "./presets/customProperty.js";
import type { IntegrationOptions, PageDetails, RenderFunction } from "./types.js";

const dir = new URL("https://e.com/");
const pageDetails: PageDetails = {
  title: "T",
  url: "https://e.com/",
  type: "article",
  image: "https://e.com/i.png",
};

// Walks a React element tree and concatenates every string child, without
// rasterizing. `isValidElement` narrows to ReactElement with a typed props
// shape, so `props.children` is read with no casts or unsafe member access.
function collectText(node: unknown): string {
  if (node === null || node === undefined) {
    return "";
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join("");
  }
  if (isValidElement<{ children?: unknown }>(node)) {
    const children = node.props.children;
    return children === undefined ? "" : collectText(children);
  }
  // SAFETY: after the null/array/element guards only primitive leaves remain
  // (customProperty emits strings and elements); narrow to a primitive so it can be
  // stringified without triggering the default Object stringification path.
  const primitive: string | number | bigint | boolean = node as string | number | bigint | boolean;
  return String(primitive);
}

// A structurally-complete AstroIntegrationLogger: every method the hook touches
// is implemented with a real (non-empty) body, so no type assertion is needed.
function makeLogger(): AstroIntegrationLogger {
  const messages: string[] = [];
  const record = (message: string): void => {
    messages.push(message);
  };
  return {
    options: {
      destination: {
        write: (chunk) => {
          record(chunk.message);
        },
      },
      level: "info",
    },
    label: "astro-takumi-test",
    info: record,
    warn: record,
    error: record,
    debug: record,
    flush: () => undefined,
    close: () => undefined,
    fork: () => makeLogger(),
  };
}

test("document is a lazy, cached getter and sanitize strips <style>/<script> text", () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="T">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    '</head><body><p>Hello body</p><style>body{color:red}</style><script>console.log("ignored")</script></body></html>';
  const input = buildRenderInput({ page: { pathname: "/" }, pageDetails, dir, html });

  const descriptor = Object.getOwnPropertyDescriptor(input, "document");
  // accessor descriptor (a getter), not a data property: `value` and `writable` are absent
  expect(descriptor?.value).toBeUndefined();
  expect(descriptor?.writable).toBeUndefined();

  // cached: the jsdom document is built once, not on every read
  expect(input.document).toBe(input.document);
  // sanitize ran on the jsdom path: style/script text is gone from the body
  expect(input.document.body?.textContent).toBe("Hello body");
});

test("customProperty preset reads document.body.textContent from the lazy input", async () => {
  const bodyText = "This page body is intentionally longer than fifty characters so truncation happens.";
  const html =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="My Title">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</head><body>" +
    bodyText +
    "</body></html>";
  const input = buildRenderInput({
    page: { pathname: "/" },
    pageDetails: { title: "My Title", url: "https://e.com/", type: "article", image: "https://e.com/i.png" },
    dir,
    html,
  });

  const node = await customProperty(input);
  const text = collectText(node);
  // customProperty truncates the body to its first 50 chars and appends "..."
  expect(text).toContain("This page body is intentionally longer than fifty");
  expect(text).toContain("...");
});

test("a render that never reads document does not invoke the lazy getter", async () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="T">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</head></html>";
  const input = buildRenderInput({ page: { pathname: "/" }, pageDetails, dir, html });

  // Swap the getter for a tripwire that flips `accessed` if anything reads it.
  let accessed = false;
  Object.defineProperty(input, "document", {
    get: () => {
      accessed = true;
      return new JSDOM("<html></html>").window.document;
    },
    configurable: true,
  });

  const ignoringRender: RenderFunction = ({ title }) =>
    Promise.resolve(createElement("div", { style: { width: "100%", height: "100%", backgroundColor: "#000" } }, title));

  await ignoringRender(input);
  expect(accessed).toBe(false);
});

const e2eOptions: IntegrationOptions = {
  width: 200,
  height: 100,
  format: "png",
  quality: 100,
  verbose: false,
  drawDebugBorder: false,
};

function e2ePageHtml(): string {
  return (
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="Home">' +
    '<meta property="og:url" content="http://example.com/">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:image" content="http://example.com/index.png">' +
    "</head><body>Hello world</body></html>"
  );
}

async function withDistDir<T>(fn: (dist: string, dirUrl: URL) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "takumi-hook-"));
  const dist = join(root, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, "index.html"), e2ePageHtml());
  try {
    return await fn(dist, pathToFileURL(dist + "/"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("buildDoneHook writes the og:image when the render never reads document", async () => {
  const render: RenderFunction = () =>
    Promise.resolve(createElement("div", { style: { width: "100%", height: "100%", backgroundColor: "#000" } }));

  await withDistDir(async (dist, dirUrl) => {
    await buildDoneHook({
      logger: makeLogger(),
      pages: [{ pathname: "/" }],
      dir: dirUrl,
      assets: new Map<string, URL[]>(),
      options: e2eOptions,
      render,
    });
    const png = await readFile(join(dist, "index.png"));
    expect(png.length).toBeGreaterThan(0);
  });
}, 30000);

test("buildDoneHook writes the og:image when the render reads document", async () => {
  const render: RenderFunction = ({ document }) => {
    const bodyText = document.body?.textContent ?? "";
    return Promise.resolve(
      createElement("div", {
        style: { width: "100%", height: "100%", backgroundColor: bodyText === "" ? "#000" : "#111" },
      }),
    );
  };

  await withDistDir(async (dist, dirUrl) => {
    await buildDoneHook({
      logger: makeLogger(),
      pages: [{ pathname: "/" }],
      dir: dirUrl,
      assets: new Map<string, URL[]>(),
      options: e2eOptions,
      render,
    });
    const png = await readFile(join(dist, "index.png"));
    expect(png.length).toBeGreaterThan(0);
  });
}, 30000);
