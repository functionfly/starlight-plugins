import { getSecret } from "astro:env/server";

import {
  LiveCollectionFilterSchema,
  LiveEntryFilterSchema,
  LiveGithubReleasesLoaderUserConfigSchema,
} from "./config.js";
import {
  fetchReleaseById,
  fetchReleaseByRestId,
  fetchReleaseByTag,
  fetchReleasesByRepoList,
} from "./releases.js";
import { resolveGitHubToken } from "./utils.js";

import type { LiveLoader } from "astro/loaders";
import type {
  LiveCollectionFilter,
  LiveEntryFilter,
  LiveGithubReleasesLoaderUserConfig,
} from "./config.js";
import type { ReleaseById, ReleaseByRepo } from "./schemas.js";

type LiveGithubReleasesEntry = ReleaseById | ReleaseByRepo;

/**
 * Simple in-memory cache for live loader results.
 */
const cache = new Map<string, { data: any; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached(key: string, data: any, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return;
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export class LiveGithubReleasesLoaderError extends Error {
  constructor(
    message: string,
    public code?: string,
    public identifier?: string,
  ) {
    super(message);
    this.name = "LiveGithubReleasesLoaderError";
  }
}

/**
 * Resolve the token for the live loader.
 *
 * `getSecret` THROWS when the secret is not declared in `astro:env`, so an
 * undeclared secret used to abort the request with an error instead of the
 * loader's own "missing token" answer. The process environment is checked
 * afterwards, because a token in the environment is a normal way to run this.
 */
function resolveLiveToken(explicit?: string): string | undefined {
  if (explicit) return explicit;

  try {
    const secret = getSecret("GITHUB_TOKEN");
    if (secret) return secret;
  } catch {
    // Not declared in astro:env — fall through to the environment.
  }

  return resolveGitHubToken();
}

/**
 * Live Astro loader that fetches releases at runtime on each request.
 * Fetches releases from repository lists or a single release by its identifier.
 */
export function liveGithubReleasesLoader(
  userConfig?: LiveGithubReleasesLoaderUserConfig,
): LiveLoader<
  LiveGithubReleasesEntry,
  LiveEntryFilter,
  LiveCollectionFilter,
  LiveGithubReleasesLoaderError
> {
  let githubToken: string | undefined;
  let cacheTtlSeconds = 300;

  if (userConfig) {
    const parsedConfig =
      LiveGithubReleasesLoaderUserConfigSchema.safeParse(userConfig);
    if (!parsedConfig.success)
      throw new LiveGithubReleasesLoaderError(
        `The configuration provided is invalid. ${parsedConfig.error.issues
          .map((issue) => issue.message)
          .join("\n")}`,
        "INVALID_CONFIG",
      );

    githubToken = parsedConfig.data.githubToken;
    cacheTtlSeconds = parsedConfig.data.cacheTtl;
  }

  return {
    name: "live-github-releases",

    async loadCollection({ filter }) {
      const parsedFilter = LiveCollectionFilterSchema.safeParse(filter);
      if (!parsedFilter.success)
        return {
          error: new LiveGithubReleasesLoaderError(
            `The filter provided is invalid. ${parsedFilter.error.issues
              .map((issue) => issue.message)
              .join("\n")}`,
            "INVALID_FILTER",
          ),
        };

      const parsed = parsedFilter.data;

      // Check cache
      const cacheKey = `collection:${JSON.stringify(parsed)}`;
      const cached = getCached<any[]>(cacheKey);
      if (cached) {
        return { entries: cached };
      }

      const config = parsed;
      const token = resolveLiveToken(githubToken);
      if (!token)
        return {
          error: new LiveGithubReleasesLoaderError(
            "No GitHub token provided.",
            "MISSING_TOKEN",
          ),
        };

      try {
        const releases = await fetchReleasesByRepoList(config as any, token);

        const entries = releases.map((release) => ({
          id: "id" in release ? release.id : release.repo,
          data: release,
          rendered:
            "descriptionHTML" in release
              ? { html: release.descriptionHTML || "" }
              : undefined,
        }));

        // Cache the result
        const ttl = cacheTtlSeconds;
        setCached(cacheKey, entries, ttl);

        return { entries };
      } catch (error) {
        return {
          error: new LiveGithubReleasesLoaderError(
            "Failed to load GitHub releases.",
            "COLLECTION_LOAD_ERROR",
          ),
        };
      }
    },

    async loadEntry({ filter }) {
      const parsedFilter = LiveEntryFilterSchema.safeParse(filter);
      if (!parsedFilter.success)
        return {
          error: new LiveGithubReleasesLoaderError(
            `The filter provided is invalid. ${parsedFilter.error.issues
              .map((issue) => issue.message)
              .join("\n")}`,
            "INVALID_FILTER",
          ),
        };

      const token = resolveLiveToken(githubToken);
      if (!token) {
        return {
          error: new LiveGithubReleasesLoaderError(
            "No GitHub token provided.",
            "MISSING_TOKEN",
          ),
        };
      }

      const { identifier } = parsedFilter.data;

      // Check cache
      const cacheKey = `entry:${JSON.stringify(identifier)}`;
      const cached = getCached<any>(cacheKey);
      if (cached) {
        return cached;
      }

      try {
        let release: ReleaseById | null = null;

        if ("nodeId" in identifier) {
          // It's a release node ID
          release = await fetchReleaseById(token, identifier.nodeId);
        } else if (identifier.releaseId !== undefined) {
          // It's { owner, repo, releaseId }
          release = await fetchReleaseByRestId(
            token,
            identifier.owner,
            identifier.repo,
            identifier.releaseId,
          );
        } else if (identifier.tagName) {
          // It's { owner, repo, tagName }
          release = await fetchReleaseByTag(
            token,
            identifier.owner,
            identifier.repo,
            identifier.tagName,
          );
        }

        if (!release) {
          const result = {
            error: new LiveGithubReleasesLoaderError(
              `The identifier '${JSON.stringify(identifier)}' did not resolve to a GitHub Release.`,
              "INVALID_IDENTIFIER",
              String(identifier),
            ),
          };
          return result;
        }

        const result = {
          id: release.id,
          data: release,
          rendered: { html: release.descriptionHTML || "" },
        };

        // Cache the result
        const ttl = cacheTtlSeconds;
        setCached(cacheKey, result, ttl);

        return result;
      } catch (error) {
        return {
          error: new LiveGithubReleasesLoaderError(
            "Failed to load GitHub release.",
            "ENTRY_LOAD_ERROR",
            String(identifier),
          ),
        };
      }
    },
  };
}

/**
 * Clear the in-memory cache (useful for testing).
 */
export function clearLiveLoaderCache(): void {
  cache.clear();
}
