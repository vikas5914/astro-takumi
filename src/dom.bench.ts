import { Bench } from "tinybench";
import { createDocument } from "./dom.js";
import type { DomBackend } from "./types.js";
import { extract, sanitizeHtml } from "./extract.js";

// A representative page: a long list of posts plus the Open Graph metadata the
// integration reads on every build. The benchmark measures the "parse then
// extract" work the build hook performs per page.
const posts = Array.from({ length: 500 }, (_, index) => {
  const id = String(index);
  return `<article><h2>Post ${id}</h2><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit ${id}.</p></article>`;
}).join("");

const html = sanitizeHtml(`<!doctype html>
<html>
  <head>
    <title>Benchmark page</title>
    <meta property="og:title" content="Benchmark page" />
    <meta property="og:description" content="A page used to benchmark DOM backends" />
    <meta property="og:url" content="https://example.com/benchmark" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://example.com/benchmark.png" />
  </head>
  <body>${posts}</body>
</html>`);

function measure(backend: DomBackend) {
  return async () => {
    const document = await createDocument(html, backend);
    extract(document);
  };
}

const bench = new Bench({ time: 2_000, warmupTime: 500 });

bench.add("jsdom", measure("jsdom"));
bench.add("linkedom", measure("linkedom"));
bench.add("happy-dom", measure("happy-dom"));

await bench.run();

console.table(bench.table());
