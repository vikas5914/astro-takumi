import { expect, test } from "vitest";
import { extractMetaFast } from "./extract.js";
import { createDocument } from "./dom.js";
import { extract } from "./extract.js";

const HTML = `<!doctype html><html><head>
<meta charset="utf-8">
<meta content="Hello &amp; welcome" property="og:title">
<meta property="og:description" content="A &quot;quoted&quot; desc">
<meta property="og:url" content="http://example.com/blog/a/">
<meta property="og:type" content="article">
<meta property="og:image" content="http://example.com/blog/a/index.png">
<style>body{color:red}</style>
<script>console.log("og:title fake")</script>
</head><body><h1>Hi</h1></body></html>`;

test("extractMetaFast parses all og tags regardless of attribute order", () => {
  const d = extractMetaFast(HTML);
  expect(d.title).toBe("Hello & welcome");
  expect(d.description).toBe('A "quoted" desc');
  expect(d.url).toBe("http://example.com/blog/a/");
  expect(d.type).toBe("article");
  expect(d.image).toBe("http://example.com/blog/a/index.png");
});

test("extractMetaFast matches DOM-based extract", async () => {
  const document = await createDocument(HTML, "linkedom");
  expect(extractMetaFast(HTML)).toEqual(extract(document));
});

test("extractMetaFast throws listing missing tags", () => {
  expect(() => extractMetaFast("<html><head></head></html>")).toThrow(/Missing required meta tags/);
});

test("extractMetaFast ignores non-og metas and later duplicates", () => {
  const html = `<head>
    <meta name="twitter:title" content="nope">
    <meta property="og:title" content="first">
    <meta property="og:title" content="second">
    <meta property="og:url" content="http://e.com/">
    <meta property="og:type" content="website">
    <meta property="og:image" content="http://e.com/index.png">
  </head>`;
  expect(extractMetaFast(html).title).toBe("first");
});
