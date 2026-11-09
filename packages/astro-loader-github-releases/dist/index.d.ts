import { n as GithubReleasesLoaderUserConfig, t as GithubReleasesLoaderOutputConfig } from "./config-D4E7wcxO.js";
import { Loader } from "astro/loaders";
/**
 * Build-time Astro loader that loads multiple GitHub releases at build time.
 * Loads releases from a list of repositories.
 */
export declare function githubReleasesLoader<TConfig extends GithubReleasesLoaderUserConfig>(userConfig: TConfig): Loader;
export type { GithubReleasesLoaderOutputConfig, GithubReleasesLoaderUserConfig };