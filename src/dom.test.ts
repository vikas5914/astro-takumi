import { describe, expect, test } from "vitest";
import { createDocument } from "./dom.js";
import type { DomBackend } from "./types.js";
import { extract, sanitizeHtml } from "./extract.js";

const backends: DomBackend[] = ["jsdom", "linkedom", "happy-dom"];

const html = `<!doctype html>
<html>
  <head>
    <title>Example</title>
    <style>body { color: red; }</style>
    <script>console.log("ignored");</script>
    <meta property="og:title" content="Example page" />
    <meta property="og:description" content="An example page" />
    <meta property="og:url" content="https://example.com/page" />
    <meta property="og:type" content="article" />
    <meta property="og:image" content="https://example.com/page.png" />
  </head>
  <body>
    <p>Hello from the page body.</p>
  </body>
</html>`;

describe.each(backends)("createDocument with %s", (backend) => {
  test("extracts Open Graph metadata", async () => {
    const document = await createDocument(sanitizeHtml(html), backend);

    expect(extract(document)).toEqual({
      title: "Example page",
      description: "An example page",
      url: "https://example.com/page",
      type: "article",
      image: "https://example.com/page.png",
    });
  });

  test("exposes page content to render functions", async () => {
    const document = await createDocument(sanitizeHtml(html), backend);

    expect(document.querySelector("body")?.textContent?.trim()).toBe("Hello from the page body.");
  });
});

test("defaults to jsdom", async () => {
  const document = await createDocument(sanitizeHtml(html));

  expect(extract(document).title).toBe("Example page");
});
