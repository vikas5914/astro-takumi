import type { AstroIntegration } from "astro";
import type { AstroBuildDoneHookInput, IntegrationDefaults, IntegrationInput, IntegrationOptions } from "./types.js";
import { buildDoneHook } from "./hook.js";

const defaults: IntegrationDefaults = {
  width: 1200,
  height: 630,
  format: "png",
  quality: 100,
  verbose: false,
  drawDebugBorder: false,
};

export function astroTakumi({ options, render }: IntegrationInput): AstroIntegration {
  const optionsWithDefaults: IntegrationOptions = { ...defaults, ...options };

  return {
    name: "astro-takumi",
    hooks: {
      "astro:build:done": async (entry: AstroBuildDoneHookInput) => {
        return buildDoneHook({
          ...entry,
          options: optionsWithDefaults,
          render,
        });
      },
    },
  };
}
