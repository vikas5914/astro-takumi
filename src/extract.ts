import { Parser } from "htmlparser2";
import type { PageDetails } from "./types.js";

// Astro CSS parsing fails: Error: Could not parse CSS stylesheet
// Remove CSS from the HTML
// https://github.com/jsdom/jsdom/issues/2005#issuecomment-1758940894
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<style([\S\s]*?)>([\S\s]*?)<\/style>/gim, "")
    .replace(/<script([\S\s]*?)>([\S\s]*?)<\/script>/gim, "");
}

// The five Open Graph properties astro-takumi reads. `og:description` is the
// only optional one; the rest are required and trigger a missing-tag error.
const OG_PROPS = ["og:title", "og:description", "og:url", "og:type", "og:image"] as const;

// Required keys, in the order the missing-tag error lists them (matches master).
const REQUIRED = ["og:title", "og:url", "og:type", "og:image"] as const;

// Zero-assertion membership test: narrows an arbitrary string to a known OG key.
const isOgKey = (value: string): value is (typeof OG_PROPS)[number] => OG_PROPS.some((key) => key === value);

/**
 * Extract Open Graph metadata from an HTML string using a streaming
 * htmlparser2 pass.
 *
 * Only the `property` attribute is recognized (matching master's
 * `meta[property='og:...']` selector); `name=` twitter/og metas are ignored.
 * The first `<meta>` carrying a given property owns that key, even when it has
 * no `content` attribute (querySelector first-match semantics, including a
 * first duplicate without content). Parsing pauses at `</head>` or `<body>` —
 * but only once every required key has been found — so OG tags rendered inside
 * `<body>` are still discovered, while a complete `<head>` is not scanned past.
 * `<meta>` inside `<template>` is ignored via a depth counter; comments,
 * `<script>` and `<style>` are already raw-text to htmlparser2.
 */
export function extract(html: string): PageDetails {
  const found = new Map<string, string>();
  const seen = new Set<string>();
  let templateDepth = 0;
  let paused = false;

  const complete = (): boolean => REQUIRED.every((key) => found.has(key));

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name === "template") {
          templateDepth++;
          return;
        }
        if (name === "body" && complete()) {
          paused = true;
          parser.pause();
          return;
        }
        if (name !== "meta" || templateDepth > 0) return;
        const { property, content } = attribs;
        if (property === undefined || !isOgKey(property) || seen.has(property)) return;
        // First match owns the key even without content (querySelector parity):
        // a later duplicate with content must not overwrite a content-less first.
        seen.add(property);
        if (content !== undefined) {
          found.set(property, content);
        }
      },
      onclosetag(name) {
        if (name === "template") {
          templateDepth--;
        } else if (name === "head" && complete()) {
          paused = true;
          parser.pause();
        }
      },
    },
    { decodeEntities: true },
  );

  parser.write(html);
  if (!paused) {
    parser.end();
  }

  return toPageDetails(found);
}

// Shared validation path: throws a byte-identical missing-tag error (same key
// order and hint lines as master) or returns a fully-typed PageDetails. The
// combined guard narrows all four required values to `string` without any
// non-null assertions or lint suppressions.
function toPageDetails(found: Map<string, string>): PageDetails {
  const title = found.get("og:title");
  const description = found.get("og:description");
  const url = found.get("og:url");
  const type = found.get("og:type");
  const image = found.get("og:image");

  if (!title || !url || !type || !image) {
    const errors: string[] = [];
    if (!title) {
      errors.push("og:title");
    }
    if (!url) {
      errors.push("og:url");
    }
    if (!type) {
      errors.push("og:type");
    }
    if (!image) {
      errors.push("og:image");
    }
    const html = errors.map((error) => {
      return `<meta property="${error}" content="some value"/>`;
    });
    throw new Error(
      `Missing required meta tags: ${errors.join(", ")}. Add the following to your page:\n${html.join("\n")}`,
    );
  }

  const returnVal: PageDetails = {
    title,
    url,
    type,
    image,
  };
  // master: description is included only when non-empty and different from title.
  if (description && description != title) {
    returnVal.description = description;
  }
  return returnVal;
}
