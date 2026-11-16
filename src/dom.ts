import type { DomBackend } from "./types.js";
import { sanitizeHtml } from "./extract.js";

interface QueryableDocument {
  querySelector(selectors: string): { getAttribute(name: string): string | null } | null;
}

function toDocument(value: QueryableDocument): Document {
  // SAFETY: querySelector/getAttribute are the DOM APIs consumed by extract(); the full
  // global Document surface is not available from happy-dom's document type.
  return value as Document;
}

/**
 * Parse an HTML string into a DOM document using the selected backend.
 *
 * Every backend is loaded with a dynamic `import()` so that selecting one
 * backend never eagerly evaluates another. This matters on Node >= 24 where
 * statically importing `jsdom@31` can trip the parse5 ESM-in-CJS-require bug
 * even when jsdom is never used.
 */
export async function createDocument(html: string, backend: DomBackend = "linkedom"): Promise<Document> {
  switch (backend) {
    case "jsdom": {
      const { JSDOM } = await import("jsdom");
      // jsdom chokes on Astro's CSS; other backends tolerate it fine.
      return new JSDOM(sanitizeHtml(html)).window.document;
    }
    case "linkedom": {
      try {
        const { parseHTML } = await import("linkedom");
        return parseHTML(html).document;
      } catch (e) {
        throw new Error(
          'astro-takumi: domBackend "linkedom" requires the optional peer dep. ' +
            'Run `npm i -D linkedom`, or set domBackend: "jsdom". (' +
            String(e) +
            ")", { cause: e },
        );
      }
    }
    case "happy-dom": {
      try {
        const { Window } = await import("happy-dom");
        const window = new Window();
        window.document.write(html);
        return toDocument(window.document);
      } catch (e) {
        throw new Error(
          'astro-takumi: domBackend "happy-dom" requires the optional peer dep. ' +
            "Run `npm i -D happy-dom`. (" +
            String(e) +
            ")", { cause: e },
        );
      }
    }
  }
}
