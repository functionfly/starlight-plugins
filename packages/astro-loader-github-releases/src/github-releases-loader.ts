import { GithubReleasesLoaderUserConfigSchema } from "./config.js";
import { fetchReleasesByRepoList } from "./releases.js";
import { ReleaseByIdSchema, ReleaseByRepoSchema } from "./schemas.js";
import { resolveGitHubToken } from "./utils.js";

import type { Loader } from "astro/loaders";
import type { GithubReleasesLoaderUserConfig } from "./config.js";

/**
 * Build-time Astro loader that loads multiple GitHub releases at build time.
 * Loads releases from a list of repositories.
 */
export function githubReleasesLoader<
  TConfig extends GithubReleasesLoaderUserConfig,
>(userConfig: TConfig): Loader {
  return {
    name: "github-releases",
    schema:
      userConfig.entryReturnType === "byRelease"
        ? ReleaseByIdSchema
        : ReleaseByRepoSchema,

    async load({ store, logger, parseData, generateDigest }) {
      const parsed = GithubReleasesLoaderUserConfigSchema.safeParse(userConfig);
      if (!parsed.success) {
        logger.error(
          `The configuration provided is invalid. ${parsed.error.issues
            .map((issue) => issue.message)
            .join("\n")}`,
        );
        return;
      }

      try {
        const { clearStore, ...config } = parsed.data;
        const token = resolveGitHubToken(config.githubToken);

        if (!token) {
          logger.warn(
            "No GitHub token provided. Please provide a `githubToken` or set the `GITHUB_TOKEN` environment variable.",
          );
          return;
        }

        const releases = await fetchReleasesByRepoList(config, token, logger);

        if (clearStore) store.clear();

        for (const item of releases) {
          if ("id" in item && config.entryReturnType === "byRelease") {
            const parsedItem = await parseData({ id: item.id, data: item });
            store.set({
              id: item.id,
              data: parsedItem,
              digest: generateDigest(parsedItem),
              rendered: { html: item.descriptionHTML || "" },
            });
          }

          if ("repo" in item && config.entryReturnType === "byRepository") {
            const parsedItem = await parseData({ id: item.repo, data: item });
            store.set({
              id: item.repo,
              data: parsedItem,
              digest: generateDigest(parsedItem),
            });
          }
        }

        logger.info(
          `Successfully loaded ${releases.length} GitHub release${
            releases.length === 1 ? "" : "s"
          }`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to load GitHub releases. ${message}`);
      }
    },
  } satisfies Loader;
}
