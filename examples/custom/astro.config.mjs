import { defineConfig } from "astro/config";
import * as fs from "node:fs";
import astroTakumi from "astro-takumi";
import { customOgMediaLayout } from "./src/customRenderer.ts";

// https://astro.build/config
export default defineConfig({
  site: "http://example.com",
  integrations: [
    astroTakumi({
      options: {
        fonts: [fs.readFileSync("node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff")],
        verbose: true,
      },
      render: customOgMediaLayout,
    }),
  ],
});
