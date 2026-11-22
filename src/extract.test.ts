import { expect, test } from "vitest";
import { extract } from "./extract.js";

// The other three required tags, reused across the single-og:title entity cases.
const baseRequired =
  '<meta property="og:url" content="https://e.com/">' +
  '<meta property="og:type" content="article">' +
  '<meta property="og:image" content="https://e.com/i.png">';

const wrapTitle = (content: string): string =>
  `<!doctype html><html><head><meta property="og:title" content="${content}">${baseRequired}</head><body></body></html>`;

// Returns the exact thrown message, failing the test if extract did not throw.
function extractThrows(html: string): string {
  let message = "";
  try {
    extract(html);
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  if (message === "") {
    throw new Error(`expected extract() to throw for: ${html}`);
  }
  return message;
}

test("real Astro 7.3.2 fixture: raw apostrophe, raw -> and raw <b> inside a double-quoted value", () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="Vikas\'s blog &amp; &quot;quotes&quot; -> <b>">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</head></html>";
  expect(extract(html).title).toBe(`Vikas's blog & "quotes" -> <b>`);
});

test("named and numeric entities decode exactly (single-pass)", () => {
  expect(extract(wrapTitle("A &amp; B")).title).toBe("A & B");
  expect(extract(wrapTitle("A &quot;B&quot;")).title).toBe('A "B"');
  expect(extract(wrapTitle("A &apos;B&apos;")).title).toBe("A 'B'");
  expect(extract(wrapTitle("A &#39;B&#39;")).title).toBe("A 'B'");
  expect(extract(wrapTitle("A &#x27;B&#x27;")).title).toBe("A 'B'");
  expect(extract(wrapTitle("A &copy; B")).title).toBe("A \u00a9 B");
  expect(extract(wrapTitle("A &nbsp; B")).title).toBe("A \u00a0 B");
  expect(extract(wrapTitle("A &lt;b&gt;")).title).toBe("A <b>");
});

test("numeric references decode even without a trailing semicolon", () => {
  expect(extract(wrapTitle("A &#39 B")).title).toBe("A ' B");
  expect(extract(wrapTitle("A &#x27 B")).title).toBe("A ' B");
});

test("unterminated named references: raw when followed by alnum or =, decoded otherwise", () => {
  // followed by a space -> decoded
  expect(extract(wrapTitle("A &copy B")).title).toBe("A \u00a9 B");
  // followed by an alphanumeric -> left raw
  expect(extract(wrapTitle("A &copyx")).title).toBe("A &copyx");
  // followed by = -> left raw
  expect(extract(wrapTitle("A &copy=")).title).toBe("A &copy=");
});

test("entity decoding is single-pass: &amp;copy; stays &copy;, never \u00a9", () => {
  expect(extract(wrapTitle("A &amp;copy; B")).title).toBe("A &copy; B");
  expect(extract(wrapTitle("A &amp;copy B")).title).toBe("A &copy B");
});

test("attribute forms: single-quoted, unquoted, uppercase, content-before-property, whitespace around =", () => {
  const html =
    "<!doctype html><html><head>" +
    "<META PROPERTY = 'og:title' CONTENT = 'Single'>\n" +
    '<meta content="http://e.com/" property="og:url">\n' +
    '<meta property="og:type" content=article>\n' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</head></html>";
  expect(extract(html)).toEqual({
    title: "Single",
    url: "http://e.com/",
    type: "article",
    image: "https://e.com/i.png",
  });
});

test("duplicate og tags: first match wins, even when it has no content", () => {
  // first has content -> first wins, second ignored
  const firstWins =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="first">' +
    '<meta property="og:title" content="second">' +
    baseRequired +
    "</head></html>";
  expect(extract(firstWins).title).toBe("first");

  // first has NO content attribute -> the key is still owned by it (querySelector
  // parity), so a later duplicate with content must not fill it -> missing-tag error.
  const firstWithoutContent =
    "<!doctype html><html><head>" +
    '<meta property="og:title">' +
    '<meta property="og:title" content="second">' +
    baseRequired +
    "</head></html>";
  expect(extractThrows(firstWithoutContent)).toBe(
    'Missing required meta tags: og:title. Add the following to your page:\n<meta property="og:title" content="some value"/>',
  );
});

test("non-og and twitter:* metas are ignored; a meta with content but no property is ignored", () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta name="twitter:title" content="nope">' +
    '<meta content="loose">' +
    '<meta property="og:title" content="real">' +
    baseRequired +
    "</head></html>";
  expect(extract(html)).toEqual({
    title: "real",
    url: "https://e.com/",
    type: "article",
    image: "https://e.com/i.png",
  });
});

test("meta inside a comment, script, style and template (incl. nested templates) is ignored", () => {
  const html =
    "<!doctype html><html><head>" +
    '<!--<meta property="og:title" content="c">-->' +
    '<script>var m="<meta property=og:title content=s>"</script>' +
    '<style>.x{content:"<meta property=og:title content=st>"}</style>' +
    "<template><template>" +
    '<meta property="og:title" content="deep">' +
    "</template>" +
    '<meta property="og:title" content="tmpl">' +
    "</template>" +
    '<meta property="og:title" content="real">' +
    baseRequired +
    "</head></html>";
  expect(extract(html)).toEqual({
    title: "real",
    url: "https://e.com/",
    type: "article",
    image: "https://e.com/i.png",
  });
});

test("no <head> at all: tags are still found", () => {
  const html =
    '<meta property="og:title" content="T">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">';
  expect(extract(html).title).toBe("T");
});

test("required OG tags only inside <body> are found (continue-into-body)", () => {
  const html =
    "<!doctype html><html><head></head><body>" +
    '<meta property="og:title" content="T">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</body></html>";
  expect(extract(html)).toEqual({
    title: "T",
    url: "https://e.com/",
    type: "article",
    image: "https://e.com/i.png",
  });
});

test("a complete Starlight-like head early-stops: a duplicate og:title later in <body> does not win", () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width">' +
    '<meta name="generator" content="Astro">' +
    "<title>Page</title>" +
    '<link rel="preload" href="/f.woff" as="font">' +
    '<link rel="stylesheet" href="/s.css">' +
    '<script src="/a.js"></script>' +
    '<meta property="og:title" content="head-title">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</head><body><main>" +
    '<meta property="og:title" content="body-title">' +
    "</main></body></html>";
  expect(extract(html).title).toBe("head-title");
});

test("missing all required tags: exact full error message, key order and hint lines", () => {
  expect(extractThrows("<!doctype html><html><head></head></html>")).toBe(
    "Missing required meta tags: og:title, og:url, og:type, og:image. Add the following to your page:\n" +
      '<meta property="og:title" content="some value"/>\n' +
      '<meta property="og:url" content="some value"/>\n' +
      '<meta property="og:type" content="some value"/>\n' +
      '<meta property="og:image" content="some value"/>',
  );
});

test("missing only og:image: exact error message", () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="T">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    "</head></html>";
  expect(extractThrows(html)).toBe(
    'Missing required meta tags: og:image. Add the following to your page:\n<meta property="og:image" content="some value"/>',
  );
});

test("empty-string content for a required key counts as missing", () => {
  const html =
    "<!doctype html><html><head>" + '<meta property="og:title" content="">' + baseRequired + "</head></html>";
  expect(extractThrows(html)).toBe(
    'Missing required meta tags: og:title. Add the following to your page:\n<meta property="og:title" content="some value"/>',
  );
});

test("og:description is omitted when equal to the title", () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="Same">' +
    '<meta property="og:description" content="Same">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</head></html>";
  const details = extract(html);
  expect(details.description).toBeUndefined();
});

test("og:description is omitted when empty", () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="T">' +
    '<meta property="og:description" content="">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</head></html>";
  expect(extract(html).description).toBeUndefined();
});

test("og:description is included when different from the title", () => {
  const html =
    "<!doctype html><html><head>" +
    '<meta property="og:title" content="T">' +
    '<meta property="og:description" content="D">' +
    '<meta property="og:url" content="https://e.com/">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:image" content="https://e.com/i.png">' +
    "</head></html>";
  expect(extract(html)).toEqual({
    title: "T",
    description: "D",
    url: "https://e.com/",
    type: "article",
    image: "https://e.com/i.png",
  });
});
