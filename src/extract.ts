import type { PageDetails } from "./types.js";

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<style([\S\s]*?)>([\S\s]*?)<\/style>/gim, "")
    .replace(/<script([\S\s]*?)>([\S\s]*?)<\/script>/gim, "");
}

const OG_PROPS = ["og:title", "og:description", "og:url", "og:type", "og:image"] as const;

export function extractMetaFast(html: string): PageDetails {
  const headEnd = html.indexOf("</head>");
  const head = headEnd === -1 ? html.slice(0, 65536) : html.slice(0, headEnd);
  const found = new Map<string, string>();
  const tags = head.match(/<meta\b[^>]*>/gi);
  if (tags !== null) {
    for (const tag of tags) {
      let property: string | undefined;
      let content: string | undefined;
      for (const m of tag.matchAll(/(?:property|name)\s*=\s*["']([^"']*)["']|content\s*=\s*["']([^"']*)["']/gi)) {
        if (m[1] !== undefined && property === undefined) property = m[1];
        if (m[2] !== undefined && content === undefined) content = m[2];
      }
      if (property !== undefined && content !== undefined && property.startsWith("og:") && !found.has(property)) {
        found.set(property, decodeEntities(content));
      }
    }
  }
  return toPageDetails(found);
}

export function extract(document: Document): PageDetails {
  const found = new Map<string, string>();
  for (const prop of OG_PROPS) {
    const v = document.querySelector(`meta[property='${prop}']`)?.getAttribute("content");
    if (v !== null && v !== undefined) found.set(prop, v);
  }
  return toPageDetails(found);
}

function toPageDetails(found: Map<string, string>): PageDetails {
  const title = found.get("og:title");
  const description = found.get("og:description");
  const url = found.get("og:url");
  const type = found.get("og:type");
  const image = found.get("og:image");

  const errors: string[] = [];
  if (!title) errors.push("og:title");
  if (!url) errors.push("og:url");
  if (!type) errors.push("og:type");
  if (!image) errors.push("og:image");

  if (errors.length > 0) {
    const html = errors.map((error) => `<meta property="${error}" content="some value"/>`);
    throw new Error(
      `Missing required meta tags: ${errors.join(", ")}. Add the following to your page:\n${html.join("\n")}`,
    );
  }

  const returnVal: PageDetails = {
    title: title!,
    url: url!,
    type: type!,
    image: image!,
  };
  if (description !== undefined && description !== returnVal.title) {
    returnVal.description = description;
  }
  return returnVal;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_m: string, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m: string, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
