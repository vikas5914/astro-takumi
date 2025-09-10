import { defineConfig } from "astro/config";
import astroTakumi, { presets } from "astro-takumi";

// https://astro.build/config
export default defineConfig({
  site: "http://example.com",
  integrations: [
    astroTakumi({
      options: {
        fonts: [fs.readFileSync("node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff")],
        verbose: true,
      },
      render: presets.blackAndWhite,
    }),
  ],
});
