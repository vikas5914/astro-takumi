import type { BaseIntegrationHooks } from "astro";
import type { ReactNode } from "react";
import type { ConstructRendererOptions } from "@takumi-rs/core";

export interface IntegrationInput {
  options: PartialIntegrationOptions;
  render: RenderFunction;
}

/** When applied to PartialIntegrationOptions this type equals IntegrationOptions */
export interface IntegrationDefaults {
  width: number;
  height: number;
  verbose: boolean;
}

/**
 * IntegrationOptions with some optional properties. This is what we expose to the user. It allows us to
 * merge the defaults with the user's options and ensure that all required properties are present.
 */
export type PartialIntegrationOptions = Omit<ConstructRendererOptions, "height" | "width"> & Partial<IntegrationDefaults>;

/**
 * The options that we use internally. This ensures that all options are configured, either with something
 * the user provided or with a default value.
 */
export type IntegrationOptions = PartialIntegrationOptions & IntegrationDefaults;

/** This is the page data passed in by Astro */
export interface Page {
  pathname: string;
}

/** The input Astro passes to the build done hook */
export type AstroBuildDoneHookInput = Parameters<BaseIntegrationHooks["astro:build:done"]>[0];

/** The input arguments to a `RenderFunction` */
export type RenderFunctionInput = {
  pathname: string;
  dir: URL;
  document: Document;
} & PageDetails;

/** A function that renders some page input to React */
export type RenderFunction = (input: RenderFunctionInput) => Promise<ReactNode>;

/** Basic information about a page */
export interface PageDetails {
  title: string;
  description?: string;
  url: string;
  type: string;
  image: string;
}