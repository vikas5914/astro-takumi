import * as jsdom from "jsdom";
import type { DomBackend } from "./types.js";

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
 * `jsdom` is the default and is always available. `linkedom` and `happy-dom`
 * are optional peer dependencies that are only imported when explicitly
 * selected, so installations that keep the default do not pay for them.
 */
export async function createDocument(html: string, backend: DomBackend = "jsdom"): Promise<Document> {
  switch (backend) {
    case "jsdom":
      return new jsdom.JSDOM(html).window.document;
    case "linkedom": {
      const { parseHTML } = await import("linkedom");
      return parseHTML(html).document;
    }
    case "happy-dom": {
      const { Window } = await import("happy-dom");
      const window = new Window();
      window.document.write(html);
      return toDocument(window.document);
    }
  }
}
